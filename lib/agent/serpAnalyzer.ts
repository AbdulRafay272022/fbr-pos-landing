/**
 * lib/agent/serpAnalyzer.ts
 *
 * SERP intelligence engine.
 *
 * Primary:  DataForSEO SERP API (set DATAFORSEO_API_KEY + DATAFORSEO_API_LOGIN)
 * Fallback: Heuristic content gap analysis from keyword patterns alone
 *
 * Outputs SerpAnalysis objects used by:
 *   - contentRefresher.ts   → expand content to match/beat top results
 *   - keywordEngine.ts      → adjust keyword priorities based on SERP difficulty
 *   - generate-blog prompt  → include SERP gaps in the generation context
 *
 * Results are cached in data/serp.json to avoid redundant API calls.
 * Cache TTL: 7 days per keyword.
 */

import type { SerpAnalysis, SerpResult } from "@/lib/types";

// ─── Serper.dev integration (primary) ────────────────────────────────────────

interface SerperOrganicItem {
  position?: number;
  link?:     string;
  title?:    string;
  snippet?:  string;
}

interface SerperApiResponse {
  organic?: SerperOrganicItem[];
}

async function fetchFromSerper(
  keyword: string,
  location: string = "pk" // Pakistan country code
): Promise<SerpResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("Serper API key not configured");

  const res = await fetch("https://google.serper.dev/search", {
    method:  "POST",
    headers: {
      "X-API-KEY":    apiKey,
      "Content-Type": "application/json",
    },
    body:   JSON.stringify({ q: keyword, gl: location, hl: "en", num: 10 }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as SerperApiResponse;
  return (data.organic ?? []).map((item, idx): SerpResult => ({
    position:    item.position    ?? idx + 1,
    url:         item.link        ?? "",
    title:       item.title       ?? "",
    description: item.snippet     ?? "",
  }));
}

// ─── DataForSEO integration (secondary fallback) ──────────────────────────────

interface DfsOrganicItem {
  rank_absolute?: number;
  url?:           string;
  title?:         string;
  description?:   string;
}

interface DfsTaskResult {
  items?: DfsOrganicItem[];
}

interface DfsApiResponse {
  tasks?: Array<{
    result?: DfsTaskResult[];
    status_code?: number;
    status_message?: string;
  }>;
}

async function fetchFromDataForSeo(
  keyword:  string,
  location: string = "2586" // Pakistan location code
): Promise<SerpResult[]> {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error("DataForSEO credentials not configured");
  }

  const credentials = Buffer.from(`${login}:${password}`).toString("base64");
  const body = JSON.stringify([
    {
      keyword,
      location_code:  parseInt(location, 10),
      language_code:  "en",
      depth:          10,
      se_domain:      "google.com",
    },
  ]);

  const res = await fetch(
    "https://api.dataforseo.com/v3/serp/google/organic/live/regular",
    {
      method:  "POST",
      headers: {
        Authorization:  `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(20_000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data  = await res.json() as DfsApiResponse;
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];

  return items.map((item, idx): SerpResult => ({
    position:    item.rank_absolute ?? idx + 1,
    url:         item.url           ?? "",
    title:       item.title         ?? "",
    description: item.description   ?? "",
  }));
}

// ─── Heuristic fallback ───────────────────────────────────────────────────────

/**
 * When no API is available, generate a mock SERP analysis based on
 * keyword patterns alone. This gives the content engine directional
 * guidance without requiring API credentials.
 */
function heuristicAnalysis(keyword: string): SerpResult[] {
  const k = keyword.toLowerCase();

  // Simulate typical top-10 results based on keyword type
  const templates: Array<{ title: string; desc: string }> = [];

  if (k.includes("how to") || k.includes("guide")) {
    templates.push(
      { title: `Complete Guide to ${keyword}`, desc: `Step-by-step instructions for ${keyword} in Pakistan.` },
      { title: `${keyword} — Everything You Need to Know`, desc: `Learn about ${keyword} requirements and process.` },
      { title: `How to Set Up ${keyword} for Your Business`, desc: `Official government requirements for ${keyword}.` }
    );
  }

  if (k.includes("penalty") || k.includes("fine")) {
    templates.push(
      { title: `FBR Penalties for Non-Compliance: Full List`, desc: `All FBR penalties and fines for 2024–2025.` },
      { title: `How to Avoid ${keyword} Pakistan`, desc: `Expert guide to staying compliant and penalty-free.` }
    );
  }

  if (k.includes("cost") || k.includes("price")) {
    templates.push(
      { title: `${keyword} Cost Breakdown 2025`, desc: `Monthly and annual costs for ${keyword} in Pakistan.` },
      { title: `Affordable ${keyword} Solutions Pakistan`, desc: `Compare prices and find the best value solution.` }
    );
  }

  // Fill to 5 results minimum
  while (templates.length < 5) {
    templates.push({
      title: `${keyword} — Complete Pakistan Guide ${new Date().getFullYear()}`,
      desc:  `Everything Pakistani businesses need to know about ${keyword}.`,
    });
  }

  return templates.slice(0, 10).map((t, i) => ({
    position:    i + 1,
    url:         `https://example${i + 1}.com`,
    title:       t.title,
    description: t.desc,
  }));
}

// ─── Content gap analysis ─────────────────────────────────────────────────────

/**
 * Extract content gaps: topics covered by SERP top-10 but NOT in our content.
 */
export function findContentGaps(
  serpResults: SerpResult[],
  ourContent:  string
): string[] {
  const TOPIC_PATTERNS = [
    /step[- ]by[- ]step/i,
    /checklist/i,
    /comparison table/i,
    /penalty amount/i,
    /official requirement/i,
    /frequently asked/i,
    /case study/i,
    /example from/i,
    /how long/i,
    /deadline/i,
    /government notification/i,
    /SRO \d+/i,
    /tier [123]/i,
    /api integration/i,
    /token expiry/i,
    /offline mode/i,
  ];

  const gaps: string[] = [];
  const ourLower = ourContent.toLowerCase();

  // Topics in SERP titles/descriptions not found in our content
  const serpText = serpResults.map((r) => `${r.title} ${r.description}`).join(" ").toLowerCase();

  for (const pattern of TOPIC_PATTERNS) {
    if (pattern.test(serpText) && !pattern.test(ourLower)) {
      gaps.push(pattern.source.replace(/\\[a-z]\d*|[()[\]]/g, "").trim());
    }
  }

  return [...new Set(gaps)].slice(0, 8);
}

/**
 * Extract common heading themes from SERP results.
 */
export function extractCommonHeadings(results: SerpResult[]): string[] {
  const words: Record<string, number> = {};

  for (const r of results) {
    const titleWords = r.title.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    for (const w of titleWords) {
      words[w] = (words[w] ?? 0) + 1;
    }
  }

  return Object.entries(words)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

// ─── Main analysis function ───────────────────────────────────────────────────

/**
 * Fetch and analyze SERP results for a keyword.
 * Falls back to heuristic analysis if DataForSEO is unavailable.
 */
export async function analyzeSerpForKeyword(
  keyword:    string,
  ourContent: string = ""
): Promise<SerpAnalysis> {
  const analyzedAt = new Date().toISOString();

  let results: SerpResult[];
  // Priority: Serper.dev → DataForSEO → heuristic fallback
  if (process.env.SERPER_API_KEY) {
    try {
      results = await fetchFromSerper(keyword);
    } catch {
      try {
        results = await fetchFromDataForSeo(keyword);
      } catch {
        results = heuristicAnalysis(keyword);
      }
    }
  } else if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    try {
      results = await fetchFromDataForSeo(keyword);
    } catch {
      results = heuristicAnalysis(keyword);
    }
  } else {
    results = heuristicAnalysis(keyword);
  }

  const avgWordCount     = 1500; // DataForSEO free tier doesn't return word count; use benchmark
  const commonHeadings   = extractCommonHeadings(results);
  const contentGaps      = ourContent ? findContentGaps(results, ourContent) : [];

  return {
    keyword,
    results,
    analyzedAt,
    avgWordCount,
    commonHeadings,
    contentGaps,
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

export interface SerpCache {
  analyses:       Record<string, SerpAnalysis>;
  lastAnalyzedAt: string | null;
}

export function defaultSerpCache(): SerpCache {
  return { analyses: {}, lastAnalyzedAt: null };
}

/**
 * Check if cached SERP data for a keyword is still fresh.
 * Default TTL: 7 days.
 */
export function isSerpCacheFresh(
  cache:      SerpCache,
  keyword:    string,
  ttlDays = 7
): boolean {
  const analysis = cache.analyses[keyword];
  if (!analysis) return false;
  const ageDays = (Date.now() - new Date(analysis.analyzedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays < ttlDays;
}

/**
 * Build a context string for Groq prompts from SERP analysis.
 * Injected into generate-blog and contentRefresher user prompts.
 */
export function buildSerpContext(analysis: SerpAnalysis): string {
  if (!analysis || analysis.results.length === 0) return "";

  const topTitles = analysis.results
    .slice(0, 5)
    .map((r, i) => `${i + 1}. "${r.title}"`)
    .join("\n");

  const gaps = analysis.contentGaps.length > 0
    ? `\nContent gaps to fill: ${analysis.contentGaps.join(", ")}`
    : "";

  return `SERP Intelligence for "${analysis.keyword}":
Top-ranking titles:
${topTitles}
Common themes: ${analysis.commonHeadings.slice(0, 6).join(", ")}${gaps}
Recommended minimum word count: ${analysis.avgWordCount}`;
}
