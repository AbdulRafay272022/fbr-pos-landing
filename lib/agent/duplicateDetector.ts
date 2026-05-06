/**
 * lib/agent/duplicateDetector.ts
 *
 * Prevents keyword cannibalization by detecting when a new keyword is too
 * similar to an already-published blog's topic.
 *
 * Two signals used together:
 *
 *  1. Jaccard similarity — token set overlap (good for paraphrase detection)
 *     "fbr pos pharmacy lahore" vs "fbr pos system pharmacies lahore pakistan"
 *     → shared tokens: fbr, pos, pharmacy/pharmacies, lahore
 *
 *  2. Bigram overlap — catches word-order patterns
 *     "how to setup fbr pos" vs "how to configure fbr pos"
 *     → shared bigrams: "how to", "fbr pos"
 *
 * A keyword is rejected if EITHER signal exceeds its threshold.
 *
 * Thresholds are tuned conservatively — we'd rather allow a slightly similar
 * blog (different angle) than block too aggressively and stall the pipeline.
 */

import type { SimilarityResult } from "@/lib/types";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const JACCARD_THRESHOLD = 0.55;  // reject if token overlap > 55%
const BIGRAM_THRESHOLD  = 0.60;  // reject if bigram overlap > 60%

// ─── Stop words (ignored during tokenization) ─────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to",
  "for", "of", "with", "by", "from", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "shall",
  "how", "what", "when", "where", "why", "which", "who",
  "pakistan", "guide", "complete",
]);

// ─── Tokenisation ─────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function bigrams(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return result;
}

// ─── Similarity metrics ───────────────────────────────────────────────────────

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export function bigramSimilarity(a: string, b: string): number {
  const biA = new Set(bigrams(tokenize(a)));
  const biB = new Set(bigrams(tokenize(b)));
  if (biA.size === 0 && biB.size === 0) return 1;
  if (biA.size === 0 || biB.size === 0) return 0;
  const intersection = [...biA].filter((bg) => biB.has(bg)).length;
  const union = new Set([...biA, ...biB]).size;
  return intersection / union;
}

// ─── Main: check new keyword against published topics ────────────────────────

/**
 * Check whether a proposed keyword is too similar to any existing topic.
 *
 * @param candidate   - new keyword to evaluate
 * @param existingTopics - array of existing blog titles or keywords
 * @returns SimilarityResult with isSimilar flag, score, and matched text
 */
export function isSimilarToExisting(
  candidate: string,
  existingTopics: string[]
): SimilarityResult {
  let maxScore = 0;
  let matchedWith = "";

  for (const topic of existingTopics) {
    const jScore = jaccardSimilarity(candidate, topic);
    const bScore = bigramSimilarity(candidate, topic);
    const combined = Math.max(jScore, bScore);

    if (combined > maxScore) {
      maxScore = combined;
      matchedWith = topic;
    }

    // Short-circuit if clearly too similar
    if (jScore > JACCARD_THRESHOLD || bScore > BIGRAM_THRESHOLD) {
      return { isSimilar: true, score: combined, matchedWith: topic };
    }
  }

  return {
    isSimilar: false,
    score: maxScore,
    matchedWith,
  };
}

/**
 * Build the list of existing topics to compare against.
 * Uses both titles and keywords from the blog index.
 */
export function buildExistingTopicsList(
  blogIndex: Array<{ title: string; keywords: string[] }>
): string[] {
  const topics: string[] = [];
  for (const blog of blogIndex) {
    topics.push(blog.title);
    for (const kw of blog.keywords) {
      topics.push(kw);
    }
  }
  return topics;
}

/**
 * Score how "fresh" a keyword is relative to the entire index.
 * Returns 0.0 (totally saturated) to 1.0 (completely unique).
 * Useful for ranking keyword pool entries.
 */
export function freshnessScore(
  keyword: string,
  existingTopics: string[]
): number {
  if (existingTopics.length === 0) return 1.0;
  let maxSim = 0;
  for (const topic of existingTopics) {
    const s = Math.max(jaccardSimilarity(keyword, topic), bigramSimilarity(keyword, topic));
    if (s > maxSim) maxSim = s;
    if (maxSim >= 0.9) break; // early exit for near-duplicates
  }
  return 1.0 - maxSim;
}
