/**
 * lib/agent/topicMap.ts
 *
 * Topic cluster / niche domination engine.
 *
 * Responsibilities:
 *  1. Define 6 core clusters for the FBR POS niche
 *  2. Assign any keyword to its best-fit cluster
 *  3. Analyse current blog index to compute cluster completion status
 *  4. Surface which cluster needs the most new content (priority ordering)
 *  5. Identify the pillar page for each cluster
 *
 * Design: all cluster definitions are in-code constants so they survive
 * server restarts without a DB. Status is computed on-the-fly from the
 * live blog index.
 */

import type { TopicCluster, ClusterStatus, TopicMap } from "@/lib/types";

// ─── Cluster definitions ──────────────────────────────────────────────────────

export const TOPIC_CLUSTERS: TopicCluster[] = [
  {
    id:             "fbr-compliance",
    name:           "FBR Compliance",
    pillarKeyword:  "FBR POS compliance Pakistan",
    relatedKeywords: [
      "FBR integration", "FBR real time invoice", "FBR tier 1 retailer",
      "FBR fiscal module", "FBR STRIVE", "FBR SRO 1006", "FBR SRO 673",
      "FBR tax invoice", "FBR invoice verification", "FBR invoice QR code",
      "FBR penalty non-compliance", "FBR compliant POS system",
      "FBR return filing POS", "FBR NTN registration POS",
      "FBR active taxpayer list", "FBR whitelist retailer",
    ],
    targetBlogCount: 15,
    description:     "Everything a Pakistani retailer needs to know about FBR POS compliance, SROs, and integration requirements.",
  },
  {
    id:             "pos-systems",
    name:           "POS Systems Pakistan",
    pillarKeyword:  "best POS system Pakistan",
    relatedKeywords: [
      "POS software Pakistan", "retail POS Pakistan", "restaurant POS Pakistan",
      "cloud POS Pakistan", "mobile POS Pakistan", "POS hardware Pakistan",
      "POS system features", "POS vs cash register", "POS system price Pakistan",
      "affordable POS Pakistan", "POS system for small business Pakistan",
      "POS inventory management", "POS barcode scanner", "POS receipt printer",
      "POS system comparison Pakistan", "POS for grocery store Pakistan",
    ],
    targetBlogCount: 15,
    description:     "POS system selection, features, and implementation guides for Pakistani businesses.",
  },
  {
    id:             "tax-penalties",
    name:           "Tax Penalties & Risk",
    pillarKeyword:  "FBR tax penalty Pakistan",
    relatedKeywords: [
      "FBR penalty non-filer", "FBR fine retailer", "FBR audit risk",
      "FBR tax evasion penalty", "FBR penalty SRO 673", "income tax penalty Pakistan",
      "sales tax penalty Pakistan", "FBR penalty appeal", "FBR enforcement action",
      "STRIVE penalty", "FBR tier 1 retailer penalty", "tax default surcharge Pakistan",
      "FBR blacklist business", "FBR penalty waiver", "avoiding FBR fine",
    ],
    targetBlogCount: 12,
    description:     "Tax penalty risk management and compliance for Pakistani retailers.",
  },
  {
    id:             "restaurant-industry",
    name:           "Restaurant & Food Industry",
    pillarKeyword:  "restaurant POS system Pakistan FBR",
    relatedKeywords: [
      "restaurant billing software Pakistan", "cafe POS Pakistan", "hotel POS Pakistan",
      "food court billing system Pakistan", "bakery POS Pakistan", "dhaba billing software",
      "restaurant inventory management Pakistan", "restaurant sales report Pakistan",
      "kitchen display system Pakistan", "online order integration Pakistan",
      "restaurant FBR compliance", "food business tax Pakistan",
      "restaurant GST Pakistan", "table management POS Pakistan",
    ],
    targetBlogCount: 12,
    description:     "POS and compliance solutions specifically for restaurants, cafes, and food businesses in Pakistan.",
  },
  {
    id:             "retail-industry",
    name:           "Retail & E-commerce",
    pillarKeyword:  "retail management software Pakistan FBR",
    relatedKeywords: [
      "garment shop POS Pakistan", "clothing store billing Pakistan",
      "supermarket POS Pakistan", "pharmacy POS Pakistan", "electronics store POS Pakistan",
      "multi-branch retail Pakistan", "retail inventory software Pakistan",
      "retail sales analytics Pakistan", "loyalty program retail Pakistan",
      "e-commerce integration POS Pakistan", "omnichannel retail Pakistan",
      "fashion retail billing Pakistan", "shoe shop POS Pakistan",
      "jewellery shop billing Pakistan", "mobile shop POS Pakistan",
    ],
    targetBlogCount: 12,
    description:     "Retail-specific POS features, inventory, and multi-branch management for Pakistani stores.",
  },
  {
    id:             "erp-accounting",
    name:           "ERP & Accounting Integration",
    pillarKeyword:  "ERP accounting integration Pakistan",
    relatedKeywords: [
      "QuickBooks integration Pakistan", "accounting software Pakistan",
      "ERP system Pakistan SME", "POS ERP integration", "inventory accounting Pakistan",
      "purchase order management Pakistan", "accounts payable Pakistan",
      "accounts receivable software Pakistan", "financial reporting Pakistan",
      "cost of goods sold Pakistan", "payroll software Pakistan",
      "expense tracking business Pakistan", "tax reporting software Pakistan",
      "GST filing automation Pakistan", "sales tax reconciliation Pakistan",
    ],
    targetBlogCount: 10,
    description:     "ERP, accounting, and back-office integration for businesses using POS systems in Pakistan.",
  },
];

// ─── Keyword → cluster assignment ─────────────────────────────────────────────

/**
 * Given a keyword string, return the best-fit cluster id.
 * Uses keyword overlap scoring against each cluster's keyword list.
 * Falls back to "fbr-compliance" if no match found.
 */
export function assignKeywordToCluster(keyword: string): string {
  const kw = keyword.toLowerCase();

  let bestCluster = "fbr-compliance";
  let bestScore   = 0;

  for (const cluster of TOPIC_CLUSTERS) {
    let score = 0;

    // Check pillar keyword
    if (kw.includes(cluster.pillarKeyword.toLowerCase())) score += 10;

    // Check related keywords
    for (const related of cluster.relatedKeywords) {
      const rel = related.toLowerCase();
      if (kw === rel) {
        score += 8; // exact match
      } else if (kw.includes(rel) || rel.includes(kw)) {
        score += 4; // partial match
      } else {
        // Token overlap
        const kwTokens  = kw.split(/\s+/);
        const relTokens = rel.split(/\s+/);
        const overlap   = kwTokens.filter((t) => relTokens.includes(t)).length;
        score += overlap;
      }
    }

    if (score > bestScore) {
      bestScore   = score;
      bestCluster = cluster.id;
    }
  }

  return bestCluster;
}

// ─── Cluster status computation ───────────────────────────────────────────────

/**
 * Compute the completion status of each cluster from the current blog index.
 * A blog is assigned to a cluster by its `cluster` field; if absent, we
 * infer from the slug/keywords.
 */
export function computeClusterStatus(
  blogs: Array<{ slug: string; cluster?: string; keywords?: string[] }>
): Record<string, ClusterStatus> {
  const status: Record<string, ClusterStatus> = {};

  // Initialise all clusters
  for (const cluster of TOPIC_CLUSTERS) {
    status[cluster.id] = {
      clusterId:      cluster.id,
      publishedCount: 0,
      targetCount:    cluster.targetBlogCount,
      completionPct:  0,
      isComplete:     false,
      slugs:          [],
    };
  }

  // Assign each blog to its cluster
  for (const blog of blogs) {
    const clusterId = blog.cluster ??
      (blog.keywords?.length
        ? assignKeywordToCluster(blog.keywords.join(" "))
        : "fbr-compliance");

    if (status[clusterId]) {
      status[clusterId].publishedCount++;
      status[clusterId].slugs.push(blog.slug);
    }
  }

  // Compute percentages and completion
  for (const id of Object.keys(status)) {
    const s = status[id];
    s.completionPct = Math.min(100, Math.round((s.publishedCount / s.targetCount) * 100));
    s.isComplete    = s.publishedCount >= s.targetCount;
  }

  return status;
}

/**
 * Build the full topic map from a blog index.
 */
export function buildTopicMap(
  blogs: Array<{ slug: string; cluster?: string; keywords?: string[] }>
): TopicMap {
  return {
    clusters:       TOPIC_CLUSTERS,
    clusterStatus:  computeClusterStatus(blogs),
    lastAnalyzedAt: new Date().toISOString(),
  };
}

/**
 * Return clusters ordered by priority (least complete first, so the agent
 * fills gaps before doubling down on already-complete clusters).
 */
export function getClusterPriority(
  clusterStatus: Record<string, ClusterStatus>
): ClusterStatus[] {
  return Object.values(clusterStatus).sort(
    (a, b) => a.completionPct - b.completionPct
  );
}

/**
 * Return the cluster that needs the most new content.
 * Used by the keyword engine to bias toward underserved clusters.
 */
export function getMostUnderdevelopedCluster(
  clusterStatus: Record<string, ClusterStatus>
): ClusterStatus | null {
  const sorted = getClusterPriority(clusterStatus);
  return sorted.find((s) => !s.isComplete) ?? null;
}

/**
 * Return the pillar keyword for a given cluster id.
 */
export function getPillarKeyword(clusterId: string): string {
  return TOPIC_CLUSTERS.find((c) => c.id === clusterId)?.pillarKeyword ?? clusterId;
}

/**
 * Return the cluster definition for a given id.
 */
export function getCluster(clusterId: string): TopicCluster | undefined {
  return TOPIC_CLUSTERS.find((c) => c.id === clusterId);
}

/**
 * Check if a keyword or slug should be treated as a pillar-level topic.
 * Heuristic: keyword matches a cluster's pillarKeyword closely.
 */
export function isPillarKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase();
  return TOPIC_CLUSTERS.some((c) =>
    kw.includes(c.pillarKeyword.toLowerCase()) ||
    c.pillarKeyword.toLowerCase().includes(kw)
  );
}
