/**
 * lib/agent/linkStrategy.ts
 *
 * Internal link strategy engine — Phase 5.
 *
 * Responsibilities:
 *  1. Identify pillar pages per cluster (highest authority slug)
 *  2. Assign each blog a composite link-priority score
 *  3. Expose prioritised candidate lists to autoLinker so pillar pages
 *     receive the most inbound links
 *  4. Build and cache a LinkStrategyMap persisted in data/link-strategy.json
 *
 * Scoring formula (0–100):
 *   inbound_links (0–40)  — each inbound link = 4 pts, cap 10
 *   content_depth (0–25)  — word-count proxy via content length
 *   recency (0–20)        — fresher = higher
 *   update_count (0–15)   — more iterations = more depth
 *
 * The autoLinker reads getPillarSlugForCluster() to ensure pillar pages
 * are always included in the candidate list with elevated priority.
 */

import type { LinkStrategyMap, LinkWeight } from "@/lib/types";
import { TOPIC_CLUSTERS, assignKeywordToCluster } from "./topicMap";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlogEntry {
  slug:        string;
  cluster?:    string;
  keywords?:   string[];
  content:     string;
  publishedAt: string;
  lastUpdated?: string;
  version?:    number;
}

// ─── Authority scoring ────────────────────────────────────────────────────────

const MAX_INBOUND_LINKS = 10;

/**
 * Compute a 0–100 authority score for a single blog.
 */
function computeAuthorityScore(
  blog: BlogEntry,
  inboundCount: number,
  outboundCount: number
): number {
  // Inbound links (0–40)
  const inboundPts = Math.min(MAX_INBOUND_LINKS, inboundCount) * 4;

  // Content depth via HTML length proxy (0–25)
  // Rough heuristic: 3000 chars ≈ 500 words; 18000 chars ≈ 3000 words (cap)
  const contentLen    = blog.content.length;
  const contentDepth  = Math.min(25, Math.round((contentLen / 18_000) * 25));

  // Recency (0–20) — pages updated in the last 30d score full marks
  const ageDays = (() => {
    const ref = blog.lastUpdated ?? blog.publishedAt;
    if (!ref) return 365;
    return (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24);
  })();
  const recencyPts = ageDays <= 7   ? 20
                   : ageDays <= 30  ? 15
                   : ageDays <= 90  ? 10
                   : ageDays <= 180 ? 5
                   : 0;

  // Update count (0–15)
  const version     = blog.version ?? 1;
  const versionPts  = Math.min(15, (version - 1) * 5);

  void outboundCount; // unused in scoring but available for future use

  return inboundPts + contentDepth + recencyPts + versionPts;
}

// ─── Link graph ───────────────────────────────────────────────────────────────

function buildInboundCounts(
  blogs: BlogEntry[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const blog of blogs) {
    const linked = [...blog.content.matchAll(/href="\/blog\/([^"]+)"/g)].map(
      (m) => m[1]
    );
    for (const targetSlug of linked) {
      if (targetSlug !== blog.slug) {
        counts[targetSlug] = (counts[targetSlug] ?? 0) + 1;
      }
    }
  }

  return counts;
}

function buildOutboundCounts(
  blogs: BlogEntry[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const blog of blogs) {
    const linked = [...blog.content.matchAll(/href="\/blog\/([^"]+)"/g)];
    counts[blog.slug] = linked.length;
  }
  return counts;
}

// ─── Strategy builder ─────────────────────────────────────────────────────────

/**
 * Build the full LinkStrategyMap from all published blogs.
 * Call this once per agent cycle and persist the result.
 */
export function buildLinkStrategy(blogs: BlogEntry[]): LinkStrategyMap {
  const inbound  = buildInboundCounts(blogs);
  const outbound = buildOutboundCounts(blogs);

  const weights: LinkWeight[] = blogs.map((blog) => {
    const clusterId = blog.cluster ??
      assignKeywordToCluster((blog.keywords ?? []).join(" ") || blog.slug);

    const inboundCount  = inbound[blog.slug]  ?? 0;
    const outboundCount = outbound[blog.slug] ?? 0;
    const authorityScore = computeAuthorityScore(blog, inboundCount, outboundCount);

    return {
      slug:         blog.slug,
      isPillar:     false, // set below
      cluster:      clusterId,
      authorityScore,
      inboundCount,
      outboundCount,
      priority:     authorityScore, // composite
    };
  });

  // Identify pillar page per cluster: highest authority score in each cluster
  const pillarPages: Record<string, string> = {};

  for (const cluster of TOPIC_CLUSTERS) {
    const clusterWeights = weights.filter((w) => w.cluster === cluster.id);
    if (clusterWeights.length === 0) continue;

    const pillar = clusterWeights.reduce(
      (best, w) => w.authorityScore > best.authorityScore ? w : best,
      clusterWeights[0]
    );

    pillarPages[cluster.id] = pillar.slug;

    // Mark it
    const idx = weights.findIndex((w) => w.slug === pillar.slug);
    if (idx !== -1) {
      weights[idx].isPillar = true;
      // Pillar pages get a priority boost so autoLinker favours them
      weights[idx].priority = Math.min(100, pillar.authorityScore + 20);
    }
  }

  // Sort by priority descending
  weights.sort((a, b) => b.priority - a.priority);

  return {
    pillarPages,
    weights,
    lastBuiltAt: new Date().toISOString(),
  };
}

/**
 * Return the slug of the designated pillar page for a cluster.
 * Falls back to undefined if no blogs exist for that cluster yet.
 */
export function getPillarSlugForCluster(
  clusterId: string,
  strategy: LinkStrategyMap
): string | undefined {
  return strategy.pillarPages[clusterId];
}

/**
 * Return top N slugs by link priority.
 * The autoLinker uses this to build an enhanced candidate list that
 * prioritises high-authority pages over arbitrary ones.
 */
export function getTopLinkTargets(
  strategy: LinkStrategyMap,
  count = 10,
  excludeSlug?: string
): string[] {
  return strategy.weights
    .filter((w) => w.slug !== excludeSlug)
    .slice(0, count)
    .map((w) => w.slug);
}

/**
 * Return all pillar slugs (one per cluster).
 */
export function getAllPillarSlugs(strategy: LinkStrategyMap): string[] {
  return Object.values(strategy.pillarPages);
}

/**
 * Get the link weight entry for a specific slug.
 */
export function getLinkWeight(
  slug: string,
  strategy: LinkStrategyMap
): LinkWeight | undefined {
  return strategy.weights.find((w) => w.slug === slug);
}

/**
 * Return a default empty strategy map (before any blogs exist).
 */
export function defaultLinkStrategy(): LinkStrategyMap {
  return {
    pillarPages: {},
    weights:     [],
    lastBuiltAt: null,
  };
}
