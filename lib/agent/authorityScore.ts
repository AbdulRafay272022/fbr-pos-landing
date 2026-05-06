/**
 * lib/agent/authorityScore.ts
 *
 * Internal authority scoring for blog posts.
 *
 * Authority = how much the site "trusts" a page. Higher authority pages
 * should be prioritised for title optimisation and featured-snippet targeting.
 *
 * Score breakdown (0–100):
 *   inboundLinks  (0–40) — how many other posts link TO this page
 *   contentDepth  (0–25) — word count relative to site minimum
 *   recency       (0–20) — how recently the post was published/updated
 *   updateCount   (0–15) — how many AI-improvement passes it has had
 */

import type { BlogPost } from "@/lib/types";
import type { AuthorityScoreResult } from "@/lib/types";

// ─── Scoring constants ────────────────────────────────────────────────────────

const MAX_INBOUND_LINKS = 10;   // saturates at 10 inbound links → full 40pts
const EXCELLENT_WORDS   = 2500; // saturates at 2500 words       → full 25pts
const RECENCY_DAYS_MAX  = 180;  // posts older than 180d score 0 on recency
const MAX_UPDATES       = 5;    // saturates at 5 updates        → full 15pts

// ─── Internal helpers ─────────────────────────────────────────────────────────

function countWordsInHtml(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score a single blog post.
 *
 * @param blog         - The blog post to score
 * @param inboundCount - Number of other blog posts that link to this one
 *                       (derived from buildLinkingGraph in autoLinker.ts)
 */
export function scoreAuthority(blog: BlogPost, inboundCount: number): AuthorityScoreResult {
  // ── inboundLinks (0–40) ───────────────────────────────────────────────────
  const inboundLinks = clamp(
    Math.round((inboundCount / MAX_INBOUND_LINKS) * 40),
    0, 40
  );

  // ── contentDepth (0–25) ───────────────────────────────────────────────────
  const wordCount    = countWordsInHtml(blog.content);
  const contentDepth = clamp(
    Math.round((Math.min(wordCount, EXCELLENT_WORDS) / EXCELLENT_WORDS) * 25),
    0, 25
  );

  // ── recency (0–20) ────────────────────────────────────────────────────────
  // Use lastUpdated if available, else publishedAt
  const referenceDate = blog.lastUpdated ?? blog.publishedAt;
  const ageDays       = daysSince(referenceDate);
  const recency       = clamp(
    Math.round((1 - Math.min(ageDays, RECENCY_DAYS_MAX) / RECENCY_DAYS_MAX) * 20),
    0, 20
  );

  // ── updateCount (0–15) ────────────────────────────────────────────────────
  const updates     = blog.version ?? 0;
  const updateCount = clamp(
    Math.round((Math.min(updates, MAX_UPDATES) / MAX_UPDATES) * 15),
    0, 15
  );

  const score = inboundLinks + contentDepth + recency + updateCount;

  return {
    slug:  blog.slug,
    score: clamp(score, 0, 100),
    breakdown: { inboundLinks, contentDepth, recency, updateCount },
  };
}

/**
 * Score all blogs and return sorted by authority (descending).
 *
 * @param blogs          - All blog posts
 * @param linkingGraph   - Map of slug → array of slugs it links TO
 *                         (from buildLinkingGraph in autoLinker.ts)
 */
export function scoreAllAuthority(
  blogs: BlogPost[],
  linkingGraph: Record<string, string[]>
): AuthorityScoreResult[] {
  // Build reverse index: slug → how many others link to it
  const inboundCounts: Record<string, number> = {};
  for (const links of Object.values(linkingGraph)) {
    for (const slug of links) {
      inboundCounts[slug] = (inboundCounts[slug] ?? 0) + 1;
    }
  }

  return blogs
    .map((b) => scoreAuthority(b, inboundCounts[b.slug] ?? 0))
    .sort((a, b) => b.score - a.score);
}

/**
 * Return the top-N highest-authority blogs.
 * These are prime candidates for title optimisation and snippet targeting.
 */
export function getHighAuthorityBlogs(
  blogs: BlogPost[],
  linkingGraph: Record<string, string[]>,
  topN = 10
): AuthorityScoreResult[] {
  return scoreAllAuthority(blogs, linkingGraph).slice(0, topN);
}
