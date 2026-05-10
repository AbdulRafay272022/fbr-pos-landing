/**
 * lib/agent/seo/strikingDistance.ts
 *
 * Identifies "striking distance" opportunities from Google Search Console data.
 *
 * A striking-distance keyword is a query where:
 *   - We appear in positions 4-30 (we're CLOSE to ranking top-3)
 *   - We have meaningful impressions (Google sees the page as relevant)
 *   - A small content/link push could move us to page 1
 *
 * This is the highest-ROI activity in SEO. Most agencies obsess over
 * keywords that are unranked — but lifting an existing position-12 to
 * position-7 typically delivers 5-10x more traffic for 1/10th the effort.
 *
 * Output drives:
 *   - Refresh queue (these pages get priority updates)
 *   - Internal-link injection (boost authority to these pages)
 *   - Brief regeneration (rewrite to match SERP intent better)
 */

import type { SeoData } from "@/lib/types";

export interface GscQueryRow {
  query:       string;
  page:        string;
  impressions: number;
  clicks:      number;
  ctr:         number;
  position:    number;
}

export interface Opportunity {
  query:       string;
  page:        string;
  position:    number;
  impressions: number;
  clicks:      number;
  ctr:         number;
  /** Estimated additional clicks if we reach position 3 */
  potentialClicks: number;
  /** Score 0-100 — higher = better opportunity */
  score:       number;
  bucket:      "page-2" | "page-1-bottom" | "long-tail-page-2" | "page-3-plus";
  recommendedAction: string;
}

// Standard CTR-by-position curve from industry benchmarks (averaged Ahrefs/Backlinko 2023)
const CTR_BY_POS: Record<number, number> = {
  1: 0.395, 2: 0.187, 3: 0.103, 4: 0.069, 5: 0.050,
  6: 0.038, 7: 0.030, 8: 0.024, 9: 0.020, 10: 0.017,
};
function expectedCtr(pos: number): number {
  const rounded = Math.max(1, Math.min(10, Math.round(pos)));
  return CTR_BY_POS[rounded] ?? 0.005;
}

/**
 * Find striking-distance opportunities from a flat array of GSC query rows.
 * If you're using SeoData (page-level only), use `findOpportunitiesFromSeo()`.
 */
export function findOpportunities(rows: GscQueryRow[]): Opportunity[] {
  const out: Opportunity[] = [];

  for (const row of rows) {
    if (row.impressions < 30) continue;             // noise
    if (row.position < 4 || row.position > 30) continue;
    if (row.position <= 3 && row.ctr > 0.20) continue; // already winning

    const targetCtr = expectedCtr(3);
    const potentialClicks = Math.round(row.impressions * (targetCtr - row.ctr));
    if (potentialClicks <= 0) continue;

    let bucket: Opportunity["bucket"];
    let action: string;
    if (row.position <= 7) {
      bucket = "page-1-bottom";
      action = "Improve title CTR + add internal links";
    } else if (row.position <= 20) {
      bucket = "page-2";
      action = "Refresh content + match top-3 SERP intent";
    } else if (row.impressions > 100) {
      bucket = "long-tail-page-2";
      action = "Add FAQ block + improve depth";
    } else {
      bucket = "page-3-plus";
      action = "Major rewrite or merge into stronger page";
    }

    // Score = impressions × CTR-gap × position-proximity
    const positionWeight = row.position <= 10 ? 1.0 : row.position <= 20 ? 0.6 : 0.3;
    const score = Math.min(100, Math.round(
      Math.log10(row.impressions + 1) * 15 +
      potentialClicks * 0.5 * positionWeight,
    ));

    out.push({
      query: row.query,
      page:  row.page,
      position:    row.position,
      impressions: row.impressions,
      clicks:      row.clicks,
      ctr:         row.ctr,
      potentialClicks,
      score,
      bucket,
      recommendedAction: action,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

/**
 * Page-level fallback when only SeoData (no per-query data) is available.
 * Treats the page's avg position + total impressions as a synthetic "query".
 */
export function findOpportunitiesFromSeo(seo: SeoData): Opportunity[] {
  const rows: GscQueryRow[] = seo.pages.map((p) => ({
    query:       p.slug,    // slug as proxy
    page:        p.url,
    impressions: p.impressions,
    clicks:      p.clicks,
    ctr:         p.ctr,
    position:    p.position,
  }));
  return findOpportunities(rows);
}

/**
 * Group opportunities by page → produce per-page action plan.
 * Useful when several queries on the same page share an opportunity.
 */
export function groupByPage(ops: Opportunity[]): Array<{
  page:            string;
  totalScore:      number;
  totalPotential:  number;
  queries:         Opportunity[];
  topAction:       string;
}> {
  const map = new Map<string, Opportunity[]>();
  for (const op of ops) {
    const list = map.get(op.page) ?? [];
    list.push(op);
    map.set(op.page, list);
  }
  return Array.from(map.entries())
    .map(([page, queries]) => ({
      page,
      totalScore:     queries.reduce((s, q) => s + q.score, 0),
      totalPotential: queries.reduce((s, q) => s + q.potentialClicks, 0),
      queries,
      topAction:      queries[0]?.recommendedAction ?? "",
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
}
