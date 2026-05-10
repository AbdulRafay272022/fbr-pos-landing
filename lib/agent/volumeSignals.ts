/**
 * lib/agent/volumeSignals.ts
 *
 * Free search-volume estimation — combines 4 signals into a 0-100 score.
 *
 * No paid APIs required. Aggregates:
 *   1. Google Autocomplete position  (top = more searched)
 *   2. PAA presence in Serper        (Google generates PAA for popular queries)
 *   3. Google Trends interest score  (relative trend signal)
 *   4. GSC impressions (if available) (real proven volume)
 *
 * Output: pseudo-volume score for prioritization, NOT absolute numbers.
 * Used to filter out keywords that pass discovery but have ~0 real volume.
 */

import type { SeoData } from "@/lib/types";

export interface VolumeSignals {
  keyword:           string;
  autocompleteRank:  number | null;     // 1-10 (1 = top suggestion)
  hasPaa:            boolean;
  trendsScore:       number | null;     // 0-100 from Google Trends
  gscImpressions:    number;            // 28-day total from GSC
  pseudoVolume:      "very-high" | "high" | "medium" | "low" | "very-low" | "unknown";
  score:             number;            // 0-100 composite
}

// ─── 1. Google Autocomplete position ─────────────────────────────────────────

/**
 * Returns the position of the keyword in Google's autocomplete (1-10).
 * Lower position = more searched. Returns null if not in suggestions.
 */
async function getAutocompleteRank(
  keyword: string,
  countryCode: string,
): Promise<number | null> {
  try {
    // Use the seed (first 2-3 words) as the autocomplete query
    const tokens = keyword.split(/\s+/);
    const seed = tokens.slice(0, Math.min(2, tokens.length)).join(" ");
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}&gl=${countryCode}&hl=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
      signal:  AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as [string, string[]];
    const suggestions = data[1] ?? [];
    const norm = keyword.toLowerCase().trim();
    for (let i = 0; i < suggestions.length; i++) {
      if (suggestions[i].toLowerCase().includes(norm) || norm.includes(suggestions[i].toLowerCase())) {
        return i + 1;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── 2. PAA presence (uses Serper if available) ─────────────────────────────

async function hasPaaInSerp(keyword: string, countryCode: string): Promise<boolean> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method:  "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify({ q: keyword, gl: countryCode, hl: "en", num: 5 }),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { peopleAlsoAsk?: unknown[] };
    return (data.peopleAlsoAsk?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── 3. Google Trends (free unofficial endpoint) ─────────────────────────────

interface TrendsResponse {
  default?: { timelineData?: Array<{ value?: number[] }> };
}

/**
 * Fetches Google Trends interest-over-time score (0-100).
 * Uses the unofficial public endpoint — no API key, but rate-limited.
 */
async function getTrendsScore(
  keyword: string,
  countryCode: string,
): Promise<number | null> {
  try {
    const explore = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify({
      comparisonItem: [{ keyword, geo: countryCode.toUpperCase(), time: "today 12-m" }],
      category: 0,
      property: "",
    }))}`;
    const res = await fetch(explore, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Trends API returns ")]}'\n" prefix
    const cleanText = text.replace(/^\)]\}'\n/, "");
    const widgets = JSON.parse(cleanText) as { widgets?: Array<{ token?: string; request?: unknown }> };
    const tsWidget = widgets.widgets?.find((w) => (w as Record<string, unknown>).id === "TIMESERIES");
    if (!tsWidget?.token) return null;

    const tsUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(tsWidget.request))}&token=${tsWidget.token}`;
    const tsRes = await fetch(tsUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!tsRes.ok) return null;
    const tsText = await tsRes.text();
    const data = JSON.parse(tsText.replace(/^\)]\}'\n/, "")) as TrendsResponse;
    const timeline = data.default?.timelineData ?? [];
    if (timeline.length === 0) return null;
    // Average of last 12 months
    const values = timeline.map((t) => t.value?.[0] ?? 0);
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  } catch {
    return null;
  }
}

// ─── 4. GSC impressions ──────────────────────────────────────────────────────

function getGscImpressions(keyword: string, seoData?: SeoData): number {
  if (!seoData) return 0;
  const norm = keyword.toLowerCase().trim();
  let total = 0;
  for (const page of seoData.pages ?? []) {
    const pageWithQueries = page as unknown as { queries?: string[]; impressions?: number };
    if (pageWithQueries.queries?.some((q) => q.toLowerCase().trim() === norm)) {
      total += pageWithQueries.impressions ?? 0;
    }
  }
  return total;
}

// ─── Composite scoring ───────────────────────────────────────────────────────

function calculatePseudoVolume(
  signals: Omit<VolumeSignals, "pseudoVolume" | "score" | "keyword">,
): { score: number; tier: VolumeSignals["pseudoVolume"] } {
  let score = 0;
  let signalCount = 0;

  // GSC impressions = strongest signal (real proven volume)
  if (signals.gscImpressions > 0) {
    if (signals.gscImpressions >= 500)      score += 40;
    else if (signals.gscImpressions >= 100) score += 30;
    else if (signals.gscImpressions >= 20)  score += 20;
    else                                     score += 10;
    signalCount++;
  }

  // Autocomplete rank (1=top, 10=bottom)
  if (signals.autocompleteRank !== null) {
    if (signals.autocompleteRank <= 3)      score += 30;
    else if (signals.autocompleteRank <= 5) score += 20;
    else                                     score += 10;
    signalCount++;
  }

  // PAA presence = Google deemed it popular enough to generate questions
  if (signals.hasPaa) {
    score += 20;
    signalCount++;
  }

  // Trends score
  if (signals.trendsScore !== null) {
    if (signals.trendsScore >= 60)      score += 20;
    else if (signals.trendsScore >= 30) score += 12;
    else if (signals.trendsScore >= 10) score += 6;
    signalCount++;
  }

  if (signalCount === 0) {
    return { score: 0, tier: "unknown" };
  }

  let tier: VolumeSignals["pseudoVolume"];
  if (score >= 75)      tier = "very-high";
  else if (score >= 55) tier = "high";
  else if (score >= 35) tier = "medium";
  else if (score >= 15) tier = "low";
  else                  tier = "very-low";

  return { score, tier };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Estimate volume for a keyword using only free signals.
 * Use this BEFORE committing to write a blog post.
 *
 * @param keyword     - keyword to evaluate
 * @param countryCode - ISO 2-letter (e.g. "pk", "us")
 * @param seoData     - optional GSC data for impressions signal
 */
export async function estimateVolume(
  keyword:     string,
  countryCode: string,
  seoData?:    SeoData,
): Promise<VolumeSignals> {
  // Run all 3 network signals in parallel (GSC is local)
  const [autocompleteRank, hasPaa, trendsScore] = await Promise.all([
    getAutocompleteRank(keyword, countryCode),
    hasPaaInSerp(keyword, countryCode),
    getTrendsScore(keyword, countryCode),
  ]);
  const gscImpressions = getGscImpressions(keyword, seoData);

  const partial = { autocompleteRank, hasPaa, trendsScore, gscImpressions };
  const { score, tier } = calculatePseudoVolume(partial);

  return {
    keyword,
    ...partial,
    pseudoVolume: tier,
    score,
  };
}

/**
 * Quick pre-filter: returns true only if there's at least SOME volume signal.
 * Cheap version — uses just autocomplete + GSC, skips Trends + PAA network calls.
 */
export async function hasMinimalVolume(
  keyword:     string,
  countryCode: string,
  seoData?:    SeoData,
): Promise<boolean> {
  const gscImpressions = getGscImpressions(keyword, seoData);
  if (gscImpressions > 0) return true;

  const rank = await getAutocompleteRank(keyword, countryCode);
  return rank !== null;
}
