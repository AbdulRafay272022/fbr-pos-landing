/**
 * lib/agent/seo/cannibalization.ts
 *
 * Detects keyword cannibalization — multiple pages targeting the same query.
 *
 * Why this matters: Google picks ONE page to rank per query. When you have
 * 3 blogs all targeting "fbr pos system Pakistan", Google ranks one and
 * dilutes authority across the others. The fix: merge, redirect, or
 * differentiate intent.
 *
 * Detection signals:
 *   1. Title similarity (Jaccard >0.5) — most obvious cannibalization
 *   2. Same target keyword in keywords array
 *   3. GSC: same query has multiple pages with impressions on it
 *
 * Output: a list of cannibalisation clusters with recommended actions:
 *   - merge        (two near-duplicate posts → consolidate into one)
 *   - differentiate (split intent — one for "best", one for "how to")
 *   - redirect     (oldest/weakest → 301 to strongest)
 */

export interface CannibalCluster {
  /** Normalised primary keyword shared across pages */
  primaryKeyword: string;
  pages: Array<{
    slug:       string;
    title:      string;
    titleSim:   number;     // 0-1 similarity to cluster centroid
    keywords:   string[];
    /** Position in GSC for this query, if available */
    position?:  number;
    impressions?: number;
  }>;
  recommendation: "merge" | "differentiate" | "redirect" | "monitor";
  reason:         string;
  /** Best action target — usually the highest-ranking or most-trafficked page */
  keepPage?:      string;
  /** Pages to remove/redirect */
  removePages?:   string[];
}

// ─── Token utilities ──────────────────────────────────────────────────────────

const STOP = new Set(["the","a","an","and","or","but","of","to","in","on","at","for","with","by","is","are","how","what","why","when","best","top","2024","2025","2026"]);

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

// ─── Title-similarity clustering ──────────────────────────────────────────────

function clusterByTitleSimilarity(
  blogs: Array<{ slug: string; title: string; keywords?: string[] }>,
  threshold = 0.5,
): Array<Array<{ slug: string; title: string; keywords?: string[] }>> {
  const tokens = blogs.map((b) => ({ b, t: tokenize(b.title) }));
  const visited = new Set<string>();
  const clusters: Array<Array<{ slug: string; title: string; keywords?: string[] }>> = [];

  for (const seed of tokens) {
    if (visited.has(seed.b.slug)) continue;
    const cluster = [seed.b];
    visited.add(seed.b.slug);
    for (const other of tokens) {
      if (visited.has(other.b.slug)) continue;
      if (jaccard(seed.t, other.t) >= threshold) {
        cluster.push(other.b);
        visited.add(other.b.slug);
      }
    }
    if (cluster.length >= 2) clusters.push(cluster);
  }
  return clusters;
}

// ─── Keyword overlap detection ────────────────────────────────────────────────

function clusterBySharedKeyword(
  blogs: Array<{ slug: string; title: string; keywords?: string[] }>,
): Map<string, Array<{ slug: string; title: string; keywords?: string[] }>> {
  const map = new Map<string, Array<{ slug: string; title: string; keywords?: string[] }>>();
  for (const b of blogs) {
    for (const kw of b.keywords ?? []) {
      const norm = kw.toLowerCase().trim();
      if (norm.length < 5) continue; // skip too-generic
      const list = map.get(norm) ?? [];
      list.push(b);
      map.set(norm, list);
    }
  }
  // Only keep keywords claimed by 2+ blogs
  for (const [k, v] of map) if (v.length < 2) map.delete(k);
  return map;
}

// ─── Main detector ────────────────────────────────────────────────────────────

export interface DetectionOptions {
  /** Optional GSC query data: for each query, which pages get impressions */
  gscQueries?: Array<{ query: string; page: string; impressions: number; position: number }>;
  /** Title similarity threshold (default 0.5) */
  titleThreshold?: number;
}

export function detectCannibalization(
  blogs: Array<{ slug: string; title: string; keywords?: string[] }>,
  opts: DetectionOptions = {},
): CannibalCluster[] {
  const out: CannibalCluster[] = [];
  const seen = new Set<string>(); // de-dup by sorted slug list

  // 1. Title-similarity clusters
  const titleClusters = clusterByTitleSimilarity(blogs, opts.titleThreshold);
  for (const cluster of titleClusters) {
    const key = cluster.map((b) => b.slug).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const seedTokens = tokenize(cluster[0].title);
    const sharedTokens = cluster
      .map((b) => tokenize(b.title))
      .reduce((acc, t) => new Set([...acc].filter((x) => t.has(x))), seedTokens);

    out.push({
      primaryKeyword: Array.from(sharedTokens).slice(0, 5).join(" ") || cluster[0].title,
      pages: cluster.map((b, i) => ({
        slug:     b.slug,
        title:    b.title,
        titleSim: i === 0 ? 1 : jaccard(seedTokens, tokenize(b.title)),
        keywords: b.keywords ?? [],
      })),
      recommendation: cluster.length === 2 ? "merge" : "differentiate",
      reason:         `${cluster.length} pages have similar titles. Google will pick one and dilute authority on others.`,
    });
  }

  // 2. Shared exact-keyword clusters (catches cases titles diverge but kw collide)
  const kwClusters = clusterBySharedKeyword(blogs);
  for (const [kw, pages] of kwClusters) {
    const key = pages.map((b) => b.slug).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      primaryKeyword: kw,
      pages: pages.map((b) => ({
        slug:     b.slug,
        title:    b.title,
        titleSim: 0,
        keywords: b.keywords ?? [],
      })),
      recommendation: "differentiate",
      reason:         `${pages.length} pages claim the same keyword "${kw}". Reassign to unique long-tail variants.`,
    });
  }

  // 3. GSC-confirmed cannibalization (highest confidence)
  if (opts.gscQueries) {
    const queryToPages = new Map<string, Array<{ page: string; impressions: number; position: number }>>();
    for (const row of opts.gscQueries) {
      if (row.impressions < 10) continue;
      const list = queryToPages.get(row.query) ?? [];
      list.push({ page: row.page, impressions: row.impressions, position: row.position });
      queryToPages.set(row.query, list);
    }

    for (const [query, pages] of queryToPages) {
      if (pages.length < 2) continue;
      const slugs = pages.map((p) => {
        const m = p.page.match(/\/blog\/([^/?#]+)/);
        return m?.[1];
      }).filter(Boolean) as string[];
      if (slugs.length < 2) continue;

      const blogMap = new Map(blogs.map((b) => [b.slug, b]));
      const matchedBlogs = slugs.map((s) => blogMap.get(s)).filter(Boolean) as Array<{ slug: string; title: string; keywords?: string[] }>;
      if (matchedBlogs.length < 2) continue;

      const key = slugs.sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      // Pick the keeper (best position, most impressions)
      const ranked = pages.sort((a, b) => a.position - b.position);
      const keepSlug = (() => {
        const m = ranked[0].page.match(/\/blog\/([^/?#]+)/);
        return m?.[1];
      })();

      out.push({
        primaryKeyword: query,
        pages: matchedBlogs.map((b) => {
          const meta = pages.find((p) => p.page.includes(b.slug));
          return {
            slug:        b.slug,
            title:       b.title,
            titleSim:    0,
            keywords:    b.keywords ?? [],
            position:    meta?.position,
            impressions: meta?.impressions,
          };
        }),
        recommendation: "redirect",
        reason:         `Google sees ${pages.length} pages of yours competing for "${query}". Keep the best-ranking page; 301-redirect others to it.`,
        keepPage:       keepSlug,
        removePages:    matchedBlogs.map((b) => b.slug).filter((s) => s !== keepSlug),
      });
    }
  }

  return out;
}
