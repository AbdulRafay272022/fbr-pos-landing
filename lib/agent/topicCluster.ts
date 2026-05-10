/**
 * lib/agent/topicCluster.ts
 *
 * Topic Cluster Engine — turns a flat list of keywords into a
 * pillar-and-spoke content strategy.
 *
 * What a senior SEO does to build topical authority:
 *   1. Group related keywords into themes
 *   2. Pick the broadest keyword in each theme as the PILLAR
 *   3. Use longer-tail keywords as CLUSTER posts
 *   4. Link all cluster posts up to pillar; pillar links down to all
 *
 * Result: Google sees the site as the authority on that topic.
 * Single posts ≠ ranking. Clusters = ranking.
 */

import type { Keyword } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TopicCluster {
  id:           string;
  theme:        string;        // e.g. "fbr-pos-pharmacy"
  pillarKeyword: string;        // broadest keyword
  pillarSlug:   string | null;  // slug of pillar post (null if not yet written)
  clusterKeywords: Array<{
    keyword: string;
    slug:    string | null;     // null if not yet written
    written: boolean;
  }>;
  totalKeywords: number;
  writtenCount:  number;
  status:        "planning" | "pillar-needed" | "expanding" | "complete";
}

export interface ClusteringResult {
  clusters:    TopicCluster[];
  unclustered: string[];        // keywords that didn't fit any cluster
  stats: {
    totalClusters:   number;
    totalKeywords:   number;
    pillarsNeeded:   number;
    clustersExpanding: number;
    clustersComplete: number;
  };
}

// ─── Stop words / common terms ────────────────────────────────────────────────

const STOP = new Set([
  "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "how", "what", "when", "where", "why",
  "best", "top", "your", "you", "my", "i", "we", "guide", "complete",
  "step", "by", "review", "vs", "versus", "compared", "comparison",
  "near", "me", "this", "that", "these", "those", "are", "do", "does",
]);

// ─── Token extraction ────────────────────────────────────────────────────────

function tokenize(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Extract the most distinctive 2-3 tokens that define a keyword's theme */
function extractThemeTokens(keyword: string): string[] {
  const tokens = tokenize(keyword);
  // Prefer longer, more distinctive tokens
  return tokens
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .sort();
}

/** Compute similarity between two keywords (Jaccard similarity on tokens) */
function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return intersection / union;
}

// ─── Pillar selection ────────────────────────────────────────────────────────

/**
 * The pillar is the broadest, shortest, highest-volume-potential keyword
 * in a cluster. Heuristics:
 *  - Fewer words = broader = pillar candidate
 *  - Generic patterns ("how to X", "X guide") = pillar
 *  - Long-tail with specifics (city, year, industry) = cluster
 */
function pickPillar(keywords: string[]): string {
  // Sort by: shortest (fewer words) + simplest (no specifics)
  const scored = keywords.map((kw) => {
    const words = kw.split(/\s+/).length;
    const specificityPenalty =
      (/\b\d{4}\b/.test(kw)               ? 3 : 0) +   // contains year
      (/\b(karachi|lahore|islamabad|rawalpindi|faisalabad|multan|peshawar)\b/i.test(kw) ? 2 : 0) +
      (/\b(pharmacy|restaurant|retail|hotel|bakery)\b/i.test(kw) ? 1 : 0);
    return { kw, score: words + specificityPenalty };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].kw;
}

// ─── Main clustering algorithm ────────────────────────────────────────────────

/**
 * Group a list of keywords into topic clusters using token overlap.
 *
 * @param keywords        - flat keyword list (e.g. from keywords.json)
 * @param existingPosts   - already-published posts (mapped to keywords)
 * @param minClusterSize  - min keywords needed to form a cluster (default 3)
 * @param simThreshold    - Jaccard similarity threshold to join cluster (default 0.4)
 */
export function buildTopicClusters(
  keywords: Keyword[],
  existingPosts: Array<{ slug: string; keywords: string[]; title: string }> = [],
  minClusterSize = 3,
  simThreshold   = 0.35,
): ClusteringResult {
  // Map existing posts by keyword for slug lookup
  const slugByKeyword = new Map<string, string>();
  for (const post of existingPosts) {
    for (const k of post.keywords ?? []) {
      slugByKeyword.set(k.toLowerCase().trim(), post.slug);
    }
    // Also map post title as a keyword
    slugByKeyword.set(post.title.toLowerCase().trim(), post.slug);
  }

  const sortedKeywords = [...keywords].sort((a, b) => b.priority - a.priority);
  const clusterMap = new Map<string, string[]>(); // theme key → keywords
  const unclustered: string[] = [];

  // Greedy clustering: each keyword joins the most similar existing cluster
  // or starts a new one
  for (const kw of sortedKeywords) {
    let bestCluster = "";
    let bestSim     = 0;

    for (const [themeKey, members] of clusterMap.entries()) {
      // Compare against the cluster's seed keyword (first one added)
      const seed = members[0];
      const sim  = similarity(kw.keyword, seed);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = themeKey;
      }
    }

    if (bestSim >= simThreshold && bestCluster) {
      clusterMap.get(bestCluster)!.push(kw.keyword);
    } else {
      // Start a new cluster
      const themeKey = extractThemeTokens(kw.keyword).join("-") || `c${clusterMap.size}`;
      clusterMap.set(themeKey, [kw.keyword]);
    }
  }

  // Convert to TopicCluster objects, filter by size
  const clusters: TopicCluster[] = [];
  for (const [theme, members] of clusterMap.entries()) {
    if (members.length < minClusterSize) {
      unclustered.push(...members);
      continue;
    }

    const pillarKeyword = pickPillar(members);
    const pillarSlug    = slugByKeyword.get(pillarKeyword.toLowerCase().trim()) ?? null;

    const clusterKeywords = members
      .filter((kw) => kw !== pillarKeyword)
      .map((kw) => {
        const slug = slugByKeyword.get(kw.toLowerCase().trim()) ?? null;
        return { keyword: kw, slug, written: !!slug };
      });

    const writtenCount = (pillarSlug ? 1 : 0) + clusterKeywords.filter((c) => c.written).length;
    const totalKeywords = clusterKeywords.length + 1;

    let status: TopicCluster["status"];
    if (!pillarSlug)                            status = "pillar-needed";
    else if (writtenCount === totalKeywords)    status = "complete";
    else if (writtenCount >= totalKeywords / 2) status = "expanding";
    else                                        status = "expanding";

    clusters.push({
      id:    theme,
      theme,
      pillarKeyword,
      pillarSlug,
      clusterKeywords,
      totalKeywords,
      writtenCount,
      status,
    });
  }

  // Sort clusters by priority: pillar-needed first, then largest expanding
  clusters.sort((a, b) => {
    const order: Record<TopicCluster["status"], number> = {
      "pillar-needed": 0,
      "expanding":     1,
      "planning":      2,
      "complete":      3,
    };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.totalKeywords - a.totalKeywords;
  });

  return {
    clusters,
    unclustered,
    stats: {
      totalClusters:    clusters.length,
      totalKeywords:    clusters.reduce((s, c) => s + c.totalKeywords, 0),
      pillarsNeeded:    clusters.filter((c) => c.status === "pillar-needed").length,
      clustersExpanding: clusters.filter((c) => c.status === "expanding").length,
      clustersComplete:  clusters.filter((c) => c.status === "complete").length,
    },
  };
}

// ─── Pick the next keyword to write (cluster-aware) ──────────────────────────

/**
 * Decide what to write next based on cluster strategy:
 *   1. If any cluster has no pillar yet → write the pillar
 *   2. Otherwise, pick the cluster with the most missing posts and write next one
 *   3. Spreads writing across clusters instead of dumping into one
 *
 * Returns the keyword + cluster context.
 */
export function pickNextClusterKeyword(
  clusters: TopicCluster[],
): { keyword: string; clusterId: string; isPillar: boolean; clusterContext: TopicCluster } | null {
  // Phase 1: Any cluster missing its pillar → pillar takes priority
  const pillarNeeded = clusters.find((c) => c.status === "pillar-needed");
  if (pillarNeeded) {
    return {
      keyword:        pillarNeeded.pillarKeyword,
      clusterId:      pillarNeeded.id,
      isPillar:       true,
      clusterContext: pillarNeeded,
    };
  }

  // Phase 2: Pick from expanding clusters with the LEAST coverage
  const expanding = clusters
    .filter((c) => c.status === "expanding")
    .sort((a, b) => {
      const aRatio = a.writtenCount / a.totalKeywords;
      const bRatio = b.writtenCount / b.totalKeywords;
      return aRatio - bRatio; // less written first
    });

  for (const cluster of expanding) {
    const unwritten = cluster.clusterKeywords.find((c) => !c.written);
    if (unwritten) {
      return {
        keyword:        unwritten.keyword,
        clusterId:      cluster.id,
        isPillar:       false,
        clusterContext: cluster,
      };
    }
  }

  return null;
}

// ─── Build internal links for a cluster ──────────────────────────────────────

/**
 * Given a cluster and the keyword being written, return the recommended
 * internal links — pillar gets links to all clusters, clusters get link
 * to pillar + 2 sibling clusters.
 */
export function getClusterInternalLinks(
  cluster:        TopicCluster,
  currentKeyword: string,
): Array<{ slug: string; title: string }> {
  const links: Array<{ slug: string; title: string }> = [];

  const isPillar = currentKeyword === cluster.pillarKeyword;

  if (isPillar) {
    // Pillar links DOWN to all written cluster posts
    for (const c of cluster.clusterKeywords) {
      if (c.written && c.slug) {
        links.push({ slug: c.slug, title: c.keyword });
      }
    }
  } else {
    // Cluster post links UP to pillar (if exists) + sibling clusters
    if (cluster.pillarSlug) {
      links.push({ slug: cluster.pillarSlug, title: cluster.pillarKeyword });
    }
    // Add up to 3 sibling cluster posts
    const siblings = cluster.clusterKeywords
      .filter((c) => c.written && c.slug && c.keyword !== currentKeyword)
      .slice(0, 3);
    for (const s of siblings) {
      links.push({ slug: s.slug!, title: s.keyword });
    }
  }

  return links;
}
