/**
 * lib/agent/trendDiscovery.ts
 *
 * Real-time trend discovery — detects what's trending in the FBR/POS/Pakistan
 * space RIGHT NOW, so the agent writes about hot topics before competitors.
 *
 * Two signal sources (run in parallel):
 *
 *   1. Google Autocomplete (FREE, no API key)
 *      Queries that people are actively typing on Google Pakistan today.
 *      URL: suggestqueries.google.com/complete/search?gl=pk
 *
 *   2. Serper /news (uses existing SERPER_API_KEY)
 *      News articles published in the last 48h about FBR/POS/Pakistan.
 *      Fresh news = fresh search intent = write about it first.
 *
 * Output: TrendCandidate[] scored by freshness + signal strength.
 * Cached in data/trends/latest.json (TTL 48h).
 *
 * Pipeline position:
 *   pre-brief (1 AM) → discoverTrends() → save cache → pick trending keyword
 *   generate-blog (2 AM) → read cache → inject as Priority 0 above GSC queries
 */

import type { Keyword } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrendCandidate {
  /** Blog-ready keyword derived from the trend signal */
  keyword:         string;
  /** Where this trend was detected */
  source:          "autocomplete" | "news";
  /** 0–100 composite score (freshness + signal strength) */
  score:           number;
  /** How old the signal is in hours (0 = right now) */
  freshnessHours:  number;
  /** Original news article URL (source === "news" only) */
  newsUrl?:        string;
  /** Original news headline (for context in the SEO brief) */
  newsTitle?:      string;
  /** ISO timestamp this candidate was discovered */
  discoveredAt:    string;
}

export interface TrendsCache {
  candidates:    TrendCandidate[];
  discoveredAt:  string;
  /** ISO — cache is stale after this */
  expiresAt:     string;
  totalSources:  number;
}

// ─── Seed configuration ───────────────────────────────────────────────────────

/**
 * Core seed phrases for Google Autocomplete.
 * These cover the main clusters on phelixerp.online.
 * Results reflect what Pakistani users are actively searching RIGHT NOW.
 */
const AUTOCOMPLETE_SEEDS = [
  "fbr pos system",
  "fbr pos pakistan",
  "fbr penalty",
  "fbr invoice pakistan",
  "fbr compliance 2025",
  "pos software pakistan",
  "fbr tier 1 retailer",
  "fbr integration deadline",
  "sales tax pakistan 2025",
  "fbr iris portal",
];

/**
 * News search queries for Serper /news.
 * Pakistan-scoped via gl:"pk". Keep focused on high-intent FBR topics.
 */
const NEWS_QUERIES = [
  "FBR POS Pakistan 2025",
  "FBR penalty retailers Pakistan",
  "FBR compliance deadline Pakistan",
  "Pakistan sales tax new rules 2025",
  "FBR IRIS integration Pakistan",
];

/**
 * Terms that make a candidate relevant to our niche.
 * Candidates missing all of these are dropped.
 */
const RELEVANCE_TERMS = [
  "fbr", "pos ", "tax", "invoice", "compliance", "retail",
  "restaurant", "pharmacy", "integration", "penalty", "tier 1",
  "iris", "e-invoice", "pra", "srb", "sales",
];

/**
 * Stop words stripped when cleaning autocomplete suggestions into keywords.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "are", "was", "were",
  "has", "have", "been", "will", "from", "its", "their", "they",
  "says", "said", "news", "latest", "new", "how", "what", "why",
  "when", "all", "get", "you", "your", "can", "may", "but", "not",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return RELEVANCE_TERMS.some((t) => lower.includes(t));
}

/**
 * Score a trend candidate based on freshness and source quality.
 * Higher score = write about it sooner.
 */
function score(freshnessHours: number, source: "autocomplete" | "news"): number {
  // Freshness: 0–60 pts
  let pts = 0;
  if      (freshnessHours <= 3)   pts += 60;
  else if (freshnessHours <= 12)  pts += 52;
  else if (freshnessHours <= 24)  pts += 42;
  else if (freshnessHours <= 48)  pts += 30;
  else if (freshnessHours <= 168) pts += 15;
  else                             pts += 5;

  // Source quality: 0–40 pts
  if (source === "news")          pts += 40; // real journalism = high intent signal
  else                             pts += 22; // autocomplete = also strong, slightly lower

  return Math.min(100, pts);
}

/**
 * Parse Serper's relative date strings into hours-ago.
 * Serper returns: "2 hours ago", "1 day ago", "3 days ago", "Jun 5, 2025", etc.
 */
function parseSerperDate(dateStr: string): number {
  if (!dateStr) return 48;
  const lower = dateStr.toLowerCase().trim();

  const minuteMatch = lower.match(/(\d+)\s*minute/);
  if (minuteMatch) return 1;

  const hourMatch = lower.match(/(\d+)\s*hour/);
  if (hourMatch) return parseInt(hourMatch[1], 10);

  const dayMatch = lower.match(/(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1], 10) * 24;

  const weekMatch = lower.match(/(\d+)\s*week/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 168;

  // Try parsing as absolute date (e.g. "Jun 5, 2025")
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return Math.max(1, Math.round((Date.now() - parsed.getTime()) / 3_600_000));
    }
  } catch { /* ignore */ }

  return 48; // conservative default
}

/**
 * Convert a news headline into a clean blog-ready keyword.
 * Keeps FBR/POS-relevant words, strips noise, caps at 8 words.
 *
 * Example:
 *   "FBR imposes Rs 50,000 penalty on non-integrated POS retailers in Pakistan"
 *   → "fbr penalty non-integrated pos retailers pakistan"
 */
function headlineToKeyword(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/['"''""\-–—]/g, " ")
    .replace(/rs\s*[\d,]+/g, "")         // strip rupee amounts
    .replace(/\d{4,}/g, "")              // strip years/large numbers
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 8)
    .join(" ")
    .trim();
}

// ─── Source 1: Google Autocomplete ────────────────────────────────────────────

async function fetchAutocomplete(seed: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?q=${encodeURIComponent(seed)}&gl=pk&hl=en&client=firefox`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOAgent/1.0)" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    // Response: ["original query", ["suggestion1", "suggestion2", ...], ...]
    const data = await res.json() as [string, string[]];
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

async function collectAutocompleteTrends(): Promise<TrendCandidate[]> {
  const results = await Promise.allSettled(
    AUTOCOMPLETE_SEEDS.map((seed) => fetchAutocomplete(seed))
  );

  const candidates: TrendCandidate[] = [];
  const discoveredAt = new Date().toISOString();

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const suggestion of result.value) {
      if (!isRelevant(suggestion)) continue;
      if (suggestion.length < 8 || suggestion.length > 80) continue;

      candidates.push({
        keyword:        suggestion,
        source:         "autocomplete",
        score:          score(6, "autocomplete"), // autocomplete = ~6h freshness
        freshnessHours: 6,
        discoveredAt,
      });
    }
  }

  return candidates;
}

// ─── Source 2: Serper /news ───────────────────────────────────────────────────

interface SerperNewsArticle {
  title:    string;
  link:     string;
  snippet?: string;
  date?:    string;
}

interface SerperNewsResponse {
  news?: SerperNewsArticle[];
}

async function fetchSerperNews(
  query: string,
  apiKey: string
): Promise<SerperNewsArticle[]> {
  try {
    const res = await fetch("https://google.serper.dev/news", {
      method:  "POST",
      headers: {
        "X-API-KEY":    apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, gl: "pk", hl: "en", num: 8 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as SerperNewsResponse;
    return data.news ?? [];
  } catch {
    return [];
  }
}

async function collectNewsTrends(apiKey: string): Promise<TrendCandidate[]> {
  const results = await Promise.allSettled(
    NEWS_QUERIES.map((q) => fetchSerperNews(q, apiKey))
  );

  const candidates: TrendCandidate[] = [];
  const discoveredAt = new Date().toISOString();

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const article of result.value) {
      // Must be relevant to our niche
      const fullText = `${article.title} ${article.snippet ?? ""}`;
      if (!isRelevant(fullText)) continue;

      const keyword = headlineToKeyword(article.title);
      if (!keyword || keyword.split(" ").length < 3) continue;
      if (!isRelevant(keyword)) continue;

      const freshnessHours = parseSerperDate(article.date ?? "");

      candidates.push({
        keyword,
        source:         "news",
        score:          score(freshnessHours, "news"),
        freshnessHours,
        newsUrl:        article.link,
        newsTitle:      article.title,
        discoveredAt,
      });
    }
  }

  return candidates;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover trending FBR/POS topics from all available sources.
 * Runs autocomplete + news in parallel. Total budget: ~10s.
 *
 * @param serperApiKey  Optional — enables Serper news source
 * @returns TrendCandidate[] sorted by score desc (best first)
 */
export async function discoverTrends(serperApiKey?: string): Promise<TrendCandidate[]> {
  const tasks: Promise<TrendCandidate[]>[] = [collectAutocompleteTrends()];

  if (serperApiKey) {
    tasks.push(collectNewsTrends(serperApiKey));
  }

  const settled = await Promise.allSettled(tasks);

  // Merge all candidates
  const all: TrendCandidate[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }

  // Deduplicate by keyword similarity (exact + near-duplicate)
  const seen = new Set<string>();
  const deduped: TrendCandidate[] = [];
  for (const c of all) {
    const norm = c.keyword.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(norm)) continue;
    // Also check for significant overlap (80%+ word overlap)
    const words = new Set(norm.split(" "));
    let isDupe = false;
    for (const existingNorm of seen) {
      const existingWords = new Set(existingNorm.split(" "));
      const intersection = [...words].filter((w) => existingWords.has(w)).length;
      const union = new Set([...words, ...existingWords]).size;
      if (union > 0 && intersection / union >= 0.8) {
        isDupe = true;
        break;
      }
    }
    if (isDupe) continue;
    seen.add(norm);
    deduped.push(c);
  }

  // Sort: highest score first (most fresh + strongest signal)
  return deduped.sort((a, b) => b.score - a.score);
}

/**
 * Build a TrendsCache object ready to persist to data/trends/latest.json.
 */
export function buildTrendsCache(candidates: TrendCandidate[]): TrendsCache {
  const discoveredAt = new Date().toISOString();
  const expiresAt    = new Date(Date.now() + 48 * 3_600_000).toISOString();
  return {
    candidates,
    discoveredAt,
    expiresAt,
    totalSources: new Set(candidates.map((c) => c.source)).size,
  };
}

/**
 * Returns true if the cache is still within its 48h TTL.
 */
export function isCacheValid(cache: TrendsCache): boolean {
  return new Date(cache.expiresAt) > new Date();
}

/**
 * Convert TrendCandidates to Keyword objects compatible with selectTopic().
 * These are injected as Priority 0 — above GSC queries and the keyword pool.
 *
 * Freshest and highest-score candidates get the highest priority values.
 */
export function toKeywordCandidates(candidates: TrendCandidate[]): Keyword[] {
  return candidates.map((c, i) => ({
    keyword:         c.keyword,
    intent:          "informational" as const,
    // Trending news = low difficulty (competitors haven't written yet)
    difficulty:      c.freshnessHours <= 24 ? ("low" as const) : ("medium" as const),
    // Priority 100 → 70 across the list (freshest first)
    priority:        Math.max(70, 100 - i),
    cluster:         c.source === "news" ? "trending-news" : "trending-autocomplete",
    used:            false,
    usedIn:          null,
    generatedAt:     c.discoveredAt,
    validated:       true,          // real user demand = implicit validation
    validationBoost: c.source === "news" ? 2.0 : 1.5,
  }));
}
