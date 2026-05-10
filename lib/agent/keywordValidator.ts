/**
 * lib/agent/keywordValidator.ts
 *
 * Pre-write keyword validation — the gate every keyword passes through
 * before becoming a blog post.
 *
 * What a senior SEO does before writing a single word:
 *  1. Look at top 10 ranking pages
 *  2. Decide: can a small site realistically rank here?
 *  3. If you already rank → refresh that post instead
 *  4. If big brands dominate → skip
 *  5. If winnable → pass + provide a brief
 *
 * Output: WRITE / REFRESH / SKIP verdict + actionable brief
 */

import { analyzeSerpIntelligence } from "./serpIntelligence";
import type { SerpAnalysis, Verdict } from "./serpIntelligence";
import { getCountryCode } from "./keywordDiscovery";
import type { SeoData } from "@/lib/types";

export interface ValidationResult {
  keyword:     string;
  verdict:     Verdict;
  reason:      string;
  analysis?:   SerpAnalysis;
  refreshSlug?: string;       // if verdict = "refresh", which existing post to update
}

/**
 * Validate a single keyword against real Google SERP data.
 * Returns verdict: write / refresh / skip + the reason.
 */
export async function validateKeyword(
  keyword:    string,
  country:    string,
  seoData?:   SeoData,
  blogIndex?: Array<{ slug: string; keywords?: string[]; title: string }>,
): Promise<ValidationResult> {
  // Find current ranking from GSC if available
  const yourRanking = findCurrentRanking(keyword, seoData);

  // Find existing blog post that covers this keyword (for refresh candidate)
  const existingPost = findExistingPostForKeyword(keyword, blogIndex ?? []);

  // Run SERP intelligence
  const countryCode = getCountryCode(country);
  const analysis = await analyzeSerpIntelligence(keyword, countryCode, yourRanking);

  if (!analysis) {
    // No SERP data — can't validate, default to write (cautious)
    return {
      keyword,
      verdict: "write",
      reason:  "SERP data unavailable — proceeding without validation.",
    };
  }

  // If already ranking and we have a post — refresh it
  if (analysis.verdict === "refresh" && existingPost) {
    return {
      keyword,
      verdict:     "refresh",
      reason:      analysis.verdictReason,
      analysis,
      refreshSlug: existingPost.slug,
    };
  }

  return {
    keyword,
    verdict: analysis.verdict,
    reason:  analysis.verdictReason,
    analysis,
  };
}

/**
 * Validate a batch of candidate keywords and return only winnable ones,
 * sorted by opportunity (low difficulty + high intent).
 *
 * This is the "filter" step — out of 100 candidate keywords, return
 * the 10-20 you should actually write about.
 */
export async function pickWinnableKeywords(
  candidates: string[],
  country:    string,
  options: {
    seoData?:   SeoData;
    blogIndex?: Array<{ slug: string; keywords?: string[]; title: string }>;
    maxAnalyses?: number;       // limit API calls (Serper costs)
    targetCount?: number;       // how many to return
  } = {},
): Promise<{
  toWrite:   ValidationResult[];
  toRefresh: ValidationResult[];
  skipped:   ValidationResult[];
}> {
  const { seoData, blogIndex, maxAnalyses = 20, targetCount = 10 } = options;

  const toWrite:   ValidationResult[] = [];
  const toRefresh: ValidationResult[] = [];
  const skipped:   ValidationResult[] = [];

  // Process candidates one at a time (rate-limit friendly)
  // Stop early if we have enough writeable keywords
  const limit = Math.min(maxAnalyses, candidates.length);

  for (let i = 0; i < limit && toWrite.length < targetCount; i++) {
    const keyword = candidates[i];
    const result = await validateKeyword(keyword, country, seoData, blogIndex);

    if (result.verdict === "write")        toWrite.push(result);
    else if (result.verdict === "refresh") toRefresh.push(result);
    else                                   skipped.push(result);

    // Pacing: small delay between Serper calls
    if (i < limit - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Sort writeable by opportunity score (lower difficulty = better)
  toWrite.sort((a, b) => {
    const da = a.analysis?.difficulty ?? 100;
    const db = b.analysis?.difficulty ?? 100;
    return da - db;
  });

  return { toWrite, toRefresh, skipped };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the current ranking position for a keyword from GSC data.
 * Returns null if not currently ranking.
 */
function findCurrentRanking(keyword: string, seoData?: SeoData): number | null {
  if (!seoData) return null;
  const norm = keyword.toLowerCase().trim();

  for (const page of seoData.pages ?? []) {
    const pageWithQueries = page as unknown as { queries?: string[] };
    if (!pageWithQueries.queries) continue;
    if (pageWithQueries.queries.some((q) => q.toLowerCase().trim() === norm)) {
      return Math.round(page.position);
    }
  }
  return null;
}

/**
 * Find an existing blog post that targets a similar keyword.
 * Returns the post if found (signal to refresh instead of writing new).
 */
function findExistingPostForKeyword(
  keyword: string,
  blogIndex: Array<{ slug: string; keywords?: string[]; title: string }>,
): { slug: string; title: string } | null {
  const norm = keyword.toLowerCase().trim();
  const tokens = norm.split(/\s+/).filter((t) => t.length > 3);

  for (const post of blogIndex) {
    // Direct keyword match
    if (post.keywords?.some((k) => k.toLowerCase().trim() === norm)) {
      return { slug: post.slug, title: post.title };
    }
    // Title overlap (≥3 distinctive tokens shared)
    const titleTokens = post.title.toLowerCase().split(/\s+/);
    const overlap = tokens.filter((t) => titleTokens.includes(t)).length;
    if (overlap >= 3) {
      return { slug: post.slug, title: post.title };
    }
  }
  return null;
}
