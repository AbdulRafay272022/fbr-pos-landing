/**
 * lib/agent/blogScorer.ts
 *
 * Quality-based blog scoring for smart update prioritization.
 *
 * Instead of updating blogs purely by age (time-based), the update engine
 * uses this scorer to target the blogs with the LOWEST quality score first.
 *
 * Score 0–100: lower score = worse quality = update it first.
 *
 * Factors:
 *
 *   Content length    25 pts  (proportional to 2000-word ideal)
 *   FAQ richness      20 pts  (more FAQs = better)
 *   Internal links    20 pts  (estimated from content)
 *   Freshness         20 pts  (age since last update)
 *   Version maturity  15 pts  (never updated = 0 pts)
 *
 * Update priority = 100 - score
 * (a blog with score 20 gets priority 80 — update it urgently)
 */

import type { BlogPost, BlogQualityScore } from "@/lib/types";
import { countWords } from "./qualityGate";

// ─── Ideal values (full marks) ────────────────────────────────────────────────

const IDEAL_WORD_COUNT     = 2000;
const IDEAL_FAQ_COUNT      = 7;
const IDEAL_LINK_COUNT     = 4;
const IDEAL_UPDATE_DAYS    = 14;   // freshest possible = updated 14 days ago
const MAX_STALE_DAYS       = 90;   // beyond this, freshness score = 0

// ─── Internal link counter (simple regex) ────────────────────────────────────

function estimateInternalLinks(html: string): number {
  return (html.match(/href=["']\/blog\//g) ?? []).length +
         (html.match(/href=["']\//g) ?? []).length;
}

// ─── Age helpers ──────────────────────────────────────────────────────────────

function daysSince(isoDate: string | undefined | null): number {
  if (!isoDate) return 999;
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

// ─── Scorer ───────────────────────────────────────────────────────────────────

/**
 * Score a single blog post.
 * Requires the full BlogPost object (with `content` field).
 */
export function scoreBlog(blog: BlogPost): BlogQualityScore {
  const wc          = countWords(blog.content);
  const faqCount    = blog.faqs?.length ?? 0;
  const linkCount   = estimateInternalLinks(blog.content);
  const ageDays     = daysSince(blog.lastUpdated ?? blog.publishedAt);
  const version     = blog.version ?? 1;

  // ── Word count (25 pts) ──────────────────────────────────────────────────
  const wordPts = Math.min(25, Math.round((wc / IDEAL_WORD_COUNT) * 25));

  // ── FAQ richness (20 pts) ────────────────────────────────────────────────
  const faqPts = Math.min(20, Math.round((faqCount / IDEAL_FAQ_COUNT) * 20));

  // ── Internal links (20 pts) ──────────────────────────────────────────────
  const linkPts = Math.min(20, Math.round((linkCount / IDEAL_LINK_COUNT) * 20));

  // ── Freshness (20 pts) ───────────────────────────────────────────────────
  // 20 pts if updated within IDEAL_UPDATE_DAYS, scales down to 0 at MAX_STALE_DAYS
  const staleness = Math.min(ageDays, MAX_STALE_DAYS);
  const freshPts = Math.round(
    ((MAX_STALE_DAYS - staleness) / MAX_STALE_DAYS) * 20
  );

  // ── Version maturity (15 pts) ────────────────────────────────────────────
  // v1 = 0 pts (never updated), v2 = 7 pts, v3+ = 15 pts
  const versionPts = version === 1 ? 0 : version === 2 ? 7 : 15;

  const total = wordPts + faqPts + linkPts + freshPts + versionPts;

  return {
    slug:  blog.slug,
    score: Math.min(100, total),
    breakdown: {
      wordCount:     wordPts,
      faqCount:      faqPts,
      internalLinks: linkPts,
      ageDays:       Math.round(ageDays),
      version,
    },
  };
}

/**
 * Sort a list of BlogQualityScore entries by update priority.
 * Lower score = higher priority = first in the returned array.
 */
export function sortByUpdatePriority(
  scores: BlogQualityScore[]
): BlogQualityScore[] {
  return [...scores].sort((a, b) => a.score - b.score);
}

/**
 * Filter blogs that are eligible for updating, then sort by priority.
 *
 * Eligibility:
 *  - published at least `updateAfterDays` ago
 *  - last updated more than `skipIfUpdatedWithinDays` ago (or never updated)
 */
export function getUpdateCandidates(
  blogs: BlogPost[],
  updateAfterDays: number,
  skipIfUpdatedWithinDays: number,
  maxCount: number
): Array<{ blog: BlogPost; score: BlogQualityScore }> {
  const eligible = blogs.filter((b) => {
    const ageDays      = daysSince(b.publishedAt);
    const daysSinceUpd = daysSince(b.lastUpdated);
    return ageDays >= updateAfterDays && daysSinceUpd >= skipIfUpdatedWithinDays;
  });

  const scored = eligible.map((b) => ({ blog: b, score: scoreBlog(b) }));
  scored.sort((a, b) => a.score.score - b.score.score); // lowest quality first

  return scored.slice(0, maxCount);
}
