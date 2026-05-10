/**
 * lib/agent/keywordDiscovery.ts
 *
 * Autonomous keyword discovery — finds what the real market is searching.
 *
 * Sources (in priority order):
 *   1. Google Autocomplete  — free, no API key, real-time Google suggestions
 *   2. Serper PAA           — "People Also Ask" questions from real SERPs
 *   3. GSC query mining     — untargeted queries already sending traffic
 *
 * Works for ANY niche. No hardcoded FBR/Pakistan assumptions.
 * Feed it a niche description → it discovers what people search.
 */

import type { SiteConfig, SeoData } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredKeyword {
  keyword:  string;
  source:   "autocomplete" | "paa" | "gsc" | "ai_seed";
  seed:     string;   // which seed triggered this discovery
  volume?:  "high" | "medium" | "low";  // rough estimate from source position
}

// ─── 1. Google Autocomplete (free, no API key) ────────────────────────────────

/**
 * Hits Google's public suggest endpoint — the same one powering
 * the autocomplete dropdown in your browser. Free, no key, real-time.
 *
 * Returns suggestions Google shows for a given query.
 * Supports country targeting via `gl` param (e.g. "pk" = Pakistan).
 */
async function getGoogleAutocomplete(
  seed:        string,
  countryCode: string = "us",
): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}&gl=${countryCode}&hl=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    // Response: ["original query", ["suggestion1", "suggestion2", ...], ...]
    const data = await res.json() as [string, string[]];
    return Array.isArray(data[1]) ? data[1].slice(0, 10) : [];
  } catch {
    return [];
  }
}

/**
 * Expand a seed keyword via Google Autocomplete using multiple query variants.
 * Each variant (prefix, suffix, question form) triggers different suggestions.
 */
async function expandSeedViaAutocomplete(
  seed:        string,
  countryCode: string,
): Promise<DiscoveredKeyword[]> {
  const queries = [
    seed,                          // base: "FBR POS"
    `${seed} `,                    // with trailing space — gets completions
    `how to ${seed}`,              // informational
    `best ${seed}`,                // commercial
    `${seed} for`,                 // industry variants
    `${seed} in`,                  // location variants
    `${seed} cost`,                // transactional
    `what is ${seed}`,             // definitional
  ];

  const results: DiscoveredKeyword[] = [];
  const seen = new Set<string>();

  // Stagger requests slightly to avoid rate limiting
  for (const query of queries) {
    const suggestions = await getGoogleAutocomplete(query, countryCode);
    for (const suggestion of suggestions) {
      const norm = suggestion.toLowerCase().trim();
      if (!seen.has(norm) && norm.length > 8 && norm.length < 120) {
        seen.add(norm);
        results.push({ keyword: suggestion, source: "autocomplete", seed });
      }
    }
    // Small delay between requests
    await new Promise((r) => setTimeout(r, 150));
  }

  return results;
}

// ─── 2. Serper PAA (People Also Ask) ─────────────────────────────────────────

interface SerperPaaItem {
  question: string;
  snippet?: string;
}

interface SerperResponse {
  peopleAlsoAsk?: SerperPaaItem[];
  organic?: Array<{ title?: string; snippet?: string }>;
}

/**
 * Fetch "People Also Ask" questions from Serper for a keyword.
 * PAA questions are the most valuable — they have proven demand
 * and are perfect for featured-snippet-targeted blog posts.
 */
async function getSerperPAA(
  seed:    string,
  country: string = "us",
): Promise<DiscoveredKeyword[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method:  "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify({ q: seed, gl: country, hl: "en", num: 5 }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const data = await res.json() as SerperResponse;
    const paaItems = data.peopleAlsoAsk ?? [];

    return paaItems
      .filter((item) => item.question && item.question.length > 10)
      .map((item) => ({
        keyword: item.question,
        source:  "paa" as const,
        seed,
        volume:  "medium" as const,
      }));
  } catch {
    return [];
  }
}

// ─── 3. GSC Query Mining ──────────────────────────────────────────────────────

/**
 * Extract queries from GSC data that are getting impressions but
 * don't have a dedicated blog post targeting them yet.
 * These are the easiest wins — Google already shows you for them.
 */
export function mineGscQueries(
  seoData:    SeoData,
  blogSlugs:  string[],
): DiscoveredKeyword[] {
  const discovered: DiscoveredKeyword[] = [];

  for (const page of seoData.pages) {
    // PageMetric may be extended with `queries` field at runtime
    const pageWithQueries = page as unknown as { queries?: string[] };
    const queries = pageWithQueries.queries ?? [];
    for (const query of queries) {
      const norm = query.toLowerCase().trim();
      // Skip single words and branded queries
      if (norm.split(" ").length < 2) continue;
      // Check if any blog slug contains this query (already covered)
      const alreadyCovered = blogSlugs.some(
        (slug) => slug.includes(norm.replace(/\s+/g, "-").slice(0, 20))
      );
      if (!alreadyCovered) {
        discovered.push({ keyword: query, source: "gsc", seed: query, volume: "low" });
      }
    }
  }

  return discovered;
}

// ─── 4. AI Seed Generation ────────────────────────────────────────────────────

/**
 * Use Groq to generate seed keywords from a niche description.
 * This bootstraps the discovery engine for a brand new site.
 *
 * e.g. "accounting software for small businesses in UAE" →
 *   ["accounting software UAE", "bookkeeping UAE", "VAT software UAE", ...]
 */
export async function generateSeedsFromNiche(
  nicheDescription: string,
  country:          string,
  groqApiKey?:      string,
): Promise<string[]> {
  const apiKey = groqApiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Fallback: extract noun phrases from the niche description
    return extractNounPhrases(nicheDescription, country);
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        model:       "llama3-8b-8192",
        max_tokens:  400,
        temperature: 0.4,
        messages: [
          {
            role:    "system",
            content: "You are an SEO expert. Return ONLY a JSON array of strings. No explanation.",
          },
          {
            role:    "user",
            content: `Generate 15 short seed keyword phrases (2-4 words each) for this business niche:

Niche: "${nicheDescription}"
Country: ${country}

Rules:
- 2-4 words per keyword
- Real search terms people use
- Mix of: product/service name, problem terms, comparison terms
- Include country name in some
- No branded terms
- Return ONLY: ["kw1", "kw2", ...]`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return extractNounPhrases(nicheDescription, country);
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";

    // Extract JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return extractNounPhrases(nicheDescription, country);
    const seeds = JSON.parse(match[0]) as string[];
    return seeds.filter((s) => typeof s === "string" && s.length > 3).slice(0, 20);
  } catch {
    return extractNounPhrases(nicheDescription, country);
  }
}

/** Fallback: extract noun phrases from niche text when no AI available */
function extractNounPhrases(niche: string, country: string): string[] {
  const words = niche.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const seeds: string[] = [
    niche.toLowerCase(),
    `${niche.toLowerCase()} ${country.toLowerCase()}`,
  ];
  // Build bigrams and trigrams
  for (let i = 0; i < words.length - 1; i++) {
    seeds.push(`${words[i]} ${words[i + 1]}`);
    if (i < words.length - 2) seeds.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return [...new Set(seeds)].slice(0, 15);
}

// ─── Main discovery orchestrator ──────────────────────────────────────────────

export interface DiscoveryResult {
  keywords:  DiscoveredKeyword[];
  stats: {
    fromAutocomplete: number;
    fromPaa:          number;
    fromGsc:          number;
    total:            number;
    seedsUsed:        number;
  };
}

/**
 * Run full autonomous keyword discovery for a site config.
 *
 * This is what replaces the static keyword list approach.
 * Call this from /api/scrape-keywords to get real market data.
 *
 * @param config    - SiteConfig with niche, country, seed keywords
 * @param seoData   - Optional GSC data for query mining
 * @param blogSlugs - Optional list of existing blog slugs (to avoid re-covering)
 * @param maxSeeds  - Max seed keywords to expand (to control API costs)
 */
export async function discoverKeywordsFromMarket(
  config:     SiteConfig,
  seoData?:   SeoData,
  blogSlugs:  string[] = [],
  maxSeeds:   number   = 10,
): Promise<DiscoveryResult> {
  const countryCode = getCountryCode(config.country);
  const seeds       = config.seedKeywords.slice(0, maxSeeds);

  const autocompleteResults: DiscoveredKeyword[] = [];
  const paaResults:          DiscoveredKeyword[] = [];
  const gscResults:          DiscoveredKeyword[] = [];
  const seen = new Set<string>();

  function add(items: DiscoveredKeyword[], target: DiscoveredKeyword[]) {
    for (const item of items) {
      const norm = item.keyword.toLowerCase().trim();
      if (!seen.has(norm)) {
        seen.add(norm);
        target.push(item);
      }
    }
  }

  // Run autocomplete + PAA in parallel for each seed
  // Batch seeds to avoid overwhelming APIs
  const BATCH_SIZE = 3;
  for (let i = 0; i < seeds.length; i += BATCH_SIZE) {
    const batch = seeds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (seed) => {
        const [ac, paa] = await Promise.all([
          expandSeedViaAutocomplete(seed, countryCode),
          getSerperPAA(seed, countryCode),
        ]);
        return { ac, paa };
      })
    );
    for (const { ac, paa } of batchResults) {
      add(ac, autocompleteResults);
      add(paa, paaResults);
    }
    // Small delay between batches
    if (i + BATCH_SIZE < seeds.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // GSC query mining (free, uses existing data)
  if (seoData && seoData.pages.length > 0) {
    const gsc = mineGscQueries(seoData, blogSlugs);
    add(gsc, gscResults);
  }

  const allKeywords = [...autocompleteResults, ...paaResults, ...gscResults];

  return {
    keywords: allKeywords,
    stats: {
      fromAutocomplete: autocompleteResults.length,
      fromPaa:          paaResults.length,
      fromGsc:          gscResults.length,
      total:            allKeywords.length,
      seedsUsed:        seeds.length,
    },
  };
}

// ─── Country code mapping ─────────────────────────────────────────────────────

const COUNTRY_CODES: Record<string, string> = {
  pakistan:       "pk",
  india:          "in",
  "united states": "us",
  usa:            "us",
  "united kingdom": "gb",
  uk:             "gb",
  uae:            "ae",
  "united arab emirates": "ae",
  canada:         "ca",
  australia:      "au",
  bangladesh:     "bd",
  nigeria:        "ng",
  kenya:          "ke",
  ghana:          "gh",
  "saudi arabia": "sa",
  egypt:          "eg",
  malaysia:       "my",
  singapore:      "sg",
  philippines:    "ph",
};

export function getCountryCode(country: string): string {
  return COUNTRY_CODES[country.toLowerCase()] ?? "us";
}

// ─── Niche config (stored in GitHub, editable via admin) ──────────────────────

export interface NicheConfig {
  businessName:     string;
  niche:            string;    // e.g. "FBR POS compliance software"
  country:          string;    // e.g. "Pakistan"
  cities:           string[];  // target cities for local SEO
  industries:       string[];  // target industries
  targetAudience:   string;    // e.g. "small retail business owners"
  competitors:      string[];  // competitor domains (optional)
  ctaWhatsApp?:     string;
  ctaText?:         string;
  configuredAt:     string;
}

export function nicheConfigToSiteConfig(
  niche:   NicheConfig,
  seeds:   string[],
  current: SiteConfig,
): Partial<SiteConfig> {
  return {
    name:             niche.businessName,
    niche:            niche.niche,
    country:          niche.country,
    cities:           niche.cities.length > 0 ? niche.cities : current.cities,
    industries:       niche.industries.length > 0 ? niche.industries : current.industries,
    seedKeywords:     seeds,
    ctaWhatsApp:      niche.ctaWhatsApp ?? current.ctaWhatsApp,
    ctaText:          niche.ctaText ?? current.ctaText,
    authorBio:        `${niche.businessName} helps ${niche.targetAudience} in ${niche.country}.`,
  };
}
