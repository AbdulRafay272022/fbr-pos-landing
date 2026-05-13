/**
 * lib/agent/programmaticGenerator.ts
 *
 * Programmatic SEO engine — Phase 5.
 *
 * Generates city × service × industry landing pages at scale.
 * Example: "POS System for Restaurants in Lahore — FBR Compliant"
 *
 * Each page is unique because:
 *  1. Groq generates a city-specific intro paragraph (local market context)
 *  2. Industry section references city-specific pain points
 *  3. CTA mentions the city by name
 *  4. Schema.org LocalBusiness type with city addressRegion
 *
 * Combination space:
 *  13 cities × 6 services × 5 priority industries = 390 potential pages
 *
 * Rate limit: 1 page per agent cycle. Cycles through cities × services
 * in priority order (highest-traffic cities first).
 */

import type {
  ProgrammaticPage,
  SiteConfig,
  BlogFaq,
  CostData,
} from "@/lib/types";
import { isUnderBudget, recordUsage } from "./costGuard";
import { getSiteConfig } from "./siteConfig";

// ─── Groq settings ────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const GROQ_TIMEOUT = 55_000;

// ─── Combination space ────────────────────────────────────────────────────────

/** Priority-ordered services for programmatic generation */
const PROG_SERVICES = [
  "POS System",
  "FBR POS Integration",
  "Billing Software",
  "Inventory Management Software",
  "Restaurant POS",
  "Retail Management Software",
] as const;

/** Priority-ordered industries for programmatic generation */
const PROG_INDUSTRIES = [
  "restaurant",
  "retail",
  "pharmacy",
  "clothing store",
  "grocery store",
] as const;

type ProgService  = typeof PROG_SERVICES[number];
type ProgIndustry = typeof PROG_INDUSTRIES[number];

// ─── Slug builder ─────────────────────────────────────────────────────────────

export function buildProgSlug(
  city:     string,
  service:  string,
  industry: string
): string {
  const clean = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
  return `${clean(service)}-${clean(industry)}-${clean(city)}`;
}

// ─── Groq prompts ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a local SEO content expert specialising in Pakistani business software.
Write compelling, locally-relevant content for POS and ERP software landing pages.
Your content must feel written by someone who knows the specific city and industry well.
CRITICAL: Respond ONLY with a JSON object. No markdown. No explanation. Pure JSON only.`;
}

function buildUserPrompt(
  city:       string,
  service:    string,
  industry:   string,
  siteConfig: SiteConfig
): string {
  const ctaPhone = siteConfig.ctaWhatsApp ?? "923001234567";
  const ctaUrl   = `https://wa.me/${ctaPhone}`;
  const siteName = siteConfig.name;

  return `Generate a programmatic landing page for:
- City: ${city} (Pakistan)
- Service: ${service}
- Industry: ${industry} businesses
- Company: ${siteName}

Return a JSON object with these exact fields:

{
  "title": "Page title (50-60 chars) — format: '${service} for ${industry} in ${city} | ${siteName}'",
  "metaDescription": "Meta description (140-155 chars) mentioning ${city}, ${industry}, FBR compliance",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"],
  "faqs": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ],
  "content": "FULL HTML body content"
}

The content HTML must include:

1. HERO SECTION:
<section style="background:linear-gradient(135deg,#FFF7ED 0%,#FFEDD5 100%);padding:48px 0;border-radius:16px;text-align:center;margin-bottom:36px;">
  <h1 style="font-size:2rem;font-weight:800;color:#1C1917;margin-bottom:14px;">Best ${service} for ${industry} businesses in ${city}</h1>
  <p style="font-size:1.1rem;color:#57534E;max-width:600px;margin:0 auto 24px;">FBR-compliant, cloud-based, and built for ${city}'s growing ${industry} sector.</p>
  <a href="${ctaUrl}" style="display:inline-block;background:#25D366;color:#fff;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;" data-cta-id="prog-hero" data-cta-pos="hero">💬 Free Demo — WhatsApp Us</a>
</section>

2. LOCAL CONTEXT SECTION (write 2–3 paragraphs specific to ${city}'s ${industry} market):
<section style="margin:32px 0;">
  <h2>${city}'s ${industry} market: What software do you need?</h2>
  [2-3 paragraphs about: local business environment in ${city}, specific challenges for ${industry} owners in ${city}, FBR compliance requirements for Tier-1 retailers in ${city}]
</section>

3. FEATURES SECTION:
<section style="margin:32px 0;">
  <h2>Why ${siteName} is the best ${service} for ${city} ${industry} owners</h2>
  <ul style="list-style:none;padding:0;">
    [6 feature bullets with ✅ emoji, each addressing a specific ${industry} pain point]
  </ul>
</section>

4. FBR COMPLIANCE SECTION (REQUIRED):
<section style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:28px;margin:32px 0;">
  <h2>FBR Compliance for ${city} ${industry} Businesses</h2>
  [Explain SRO 1006 / SRO 673 requirements, Tier-1 retailer obligations, QR invoice requirements. Mention ${city} SRB/FBR office if applicable]
</section>

5. FAQ SECTION (render the 3 faqs):
<section style="margin:32px 0;">
  <h2>Frequently Asked Questions</h2>
  [render each faq as <details><summary>question</summary><p>answer</p></details>]
</section>

6. FINAL CTA:
<section style="background:#F97316;padding:44px;border-radius:16px;text-align:center;color:#fff;margin:32px 0;">
  <h2 style="color:#fff;margin-bottom:14px;">Get Started in ${city} Today</h2>
  <p style="color:#FFF7ED;margin-bottom:20px;">Join hundreds of ${city} ${industry} businesses already using ${siteName}. Setup in 24 hours, FBR certified.</p>
  <a href="${ctaUrl}" style="display:inline-block;background:#fff;color:#F97316;padding:14px 32px;border-radius:8px;font-weight:800;text-decoration:none;" data-cta-id="prog-end" data-cta-pos="end">💬 Book Your Free ${city} Demo</a>
</section>

IMPORTANT: No \`\`\`json fences. Pure JSON only. All prices in PKR.
Pricing: Starter plan PKR 1,500/month (single branch). Business plan PKR 4,000/month (multi-branch, most popular). Use these exact prices — do not invent other amounts.`;
}

// ─── Groq call ────────────────────────────────────────────────────────────────

interface GroqProgResult {
  title:           string;
  metaDescription: string;
  keywords:        string[];
  faqs:            BlogFaq[];
  content:         string;
}

async function callGroqProgrammatic(
  city:       string,
  service:    string,
  industry:   string,
  siteConfig: SiteConfig,
  groqApiKey: string
): Promise<{ result: GroqProgResult; promptTokens: number; completionTokens: number }> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), GROQ_TIMEOUT);

  try {
    const res = await fetch(GROQ_API_URL, {
      method:  "POST",
      signal:  controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        temperature: 0.65,
        max_tokens:  3000,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user",   content: buildUserPrompt(city, service, industry, siteConfig) },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const raw = json.choices?.[0]?.message?.content ?? "";
    const promptTokens     = json.usage?.prompt_tokens     ?? 0;
    const completionTokens = json.usage?.completion_tokens ?? 0;

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as GroqProgResult;

    if (!parsed.title || !parsed.content) {
      throw new Error("Missing required fields in programmatic page response");
    }

    return { result: parsed, promptTokens, completionTokens };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Schema builder ───────────────────────────────────────────────────────────

function buildLocalBusinessSchema(
  page:       { title: string; metaDescription: string; slug: string },
  city:       string,
  industry:   string,
  siteConfig: SiteConfig
): string {
  const baseUrl = siteConfig.baseUrl.replace(/\/$/, "");
  const schema  = {
    "@context":   "https://schema.org",
    "@type":      ["LocalBusiness", "SoftwareApplication"],
    "name":       siteConfig.name,
    "description": page.metaDescription,
    "url":        `${baseUrl}/locations/${page.slug}`,
    "areaServed": {
      "@type":       "City",
      "name":        city,
      "containedIn": { "@type": "Country", "name": "Pakistan" },
    },
    "applicationCategory": "BusinessApplication",
    "operatingSystem":     "Web, Android, iOS",
    "offers": {
      "@type":        "Offer",
      "priceCurrency": "PKR",
      "availability":  "https://schema.org/InStock",
    },
    "knowsAbout": [`${industry} management`, "FBR compliance", "POS systems"],
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export interface GenerateProgrammaticResult {
  success:        boolean;
  page?:          ProgrammaticPage;
  costs?:         CostData;
  error?:         string;
  skippedReason?: string;
}

/**
 * Generate a single programmatic page (city × service × industry).
 */
export async function generateProgrammaticPage(
  city:      string,
  service:   string,
  industry:  string,
  costs:     CostData,
  groqApiKey: string
): Promise<GenerateProgrammaticResult> {
  if (!isUnderBudget(costs)) {
    return { success: false, skippedReason: "Monthly token budget exceeded" };
  }

  const siteConfig = getSiteConfig();

  let groqResult: { result: GroqProgResult; promptTokens: number; completionTokens: number };
  try {
    groqResult = await callGroqProgrammatic(city, service, industry, siteConfig, groqApiKey);
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    };
  }

  const { result, promptTokens, completionTokens } = groqResult;

  const updatedCosts = recordUsage(costs, {
    action:           "generate_programmatic",
    model:            GROQ_MODEL,
    promptTokens,
    completionTokens,
    totalTokens:      promptTokens + completionTokens,
  });

  const slug = buildProgSlug(city, service, industry);

  // Inject local business schema
  const schemaTag    = buildLocalBusinessSchema(
    { title: result.title, metaDescription: result.metaDescription, slug },
    city, industry, siteConfig
  );
  const finalContent = result.content + `\n${schemaTag}`;

  const now  = new Date().toISOString();
  const page: ProgrammaticPage = {
    slug,
    title:           result.title,
    metaDescription: result.metaDescription,
    keywords:        result.keywords ?? [],
    city,
    service,
    industry,
    content:         finalContent,
    publishedAt:     now,
    lastUpdated:     now,
    version:         1,
  };

  return { success: true, page, costs: updatedCosts };
}

// ─── Next combination picker ──────────────────────────────────────────────────

/**
 * Determine the next city × service × industry combination to generate.
 * Cycles through cities (fastest market growth) × services × industries.
 * Returns null when all combinations are exhausted.
 */
export function getNextProgrammaticCombination(
  existingSlugs: string[],
  siteConfig:    SiteConfig
): { city: string; service: string; industry: string } | null {
  const existing = new Set(existingSlugs);

  // Priority cities (subset of siteConfig.cities)
  const priorityCities = siteConfig.cities.slice(0, 8);

  for (const city of priorityCities) {
    for (const service of PROG_SERVICES) {
      for (const industry of PROG_INDUSTRIES) {
        const slug = buildProgSlug(city, service, industry);
        if (!existing.has(slug)) {
          return { city, service, industry };
        }
      }
    }
  }

  return null;
}
