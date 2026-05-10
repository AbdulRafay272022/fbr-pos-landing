/**
 * lib/agent/seo/backlinkMonitor.ts
 *
 * Tracks domain-level backlink growth/loss over time.
 * Stores weekly snapshots so the dashboard can show:
 *   - Backlink count trend
 *   - Referring domain trend
 *   - Lost backlinks (week over week)
 *   - New backlinks
 *   - Domain Rank score
 *
 * Cost: ~$0.01 per snapshot. Run weekly.
 */

import { getBacklinkSummary } from "./dataforseo";

export interface BacklinkSnapshot {
  /** YYYY-MM-DD */
  date:                   string;
  domainRank:             number;
  totalBacklinks:         number;
  referringDomains:       number;
  referringMainDomains:   number;
  brokenBacklinks:        number;
  brokenPages:            number;
  /** Week-over-week deltas (calculated when prior snapshot exists) */
  newBacklinks?:          number;
  lostBacklinks?:         number;
  newRefDomains?:         number;
  lostRefDomains?:        number;
}

export interface BacklinkData {
  target:           string;
  snapshots:        BacklinkSnapshot[];   // newest last
  lastSnapshotAt:   string | null;
}

export const EMPTY_BACKLINKS: BacklinkData = { target: "", snapshots: [], lastSnapshotAt: null };

export async function captureBacklinkSnapshot(
  target:  string,
  current: BacklinkData,
): Promise<{ ok: true; snapshot: BacklinkSnapshot; data: BacklinkData; cost: number } | { ok: false; error: string }> {
  const result = await getBacklinkSummary({ target });
  if (!result.ok) return { ok: false, error: result.error };

  const prev = current.snapshots[current.snapshots.length - 1];

  const snap: BacklinkSnapshot = {
    date:                 new Date().toISOString().slice(0, 10),
    domainRank:           result.data.rank,
    totalBacklinks:       result.data.backlinks,
    referringDomains:     result.data.referring_domains,
    referringMainDomains: result.data.referring_main_domains,
    brokenBacklinks:      result.data.broken_backlinks,
    brokenPages:          result.data.broken_pages,
  };

  if (prev) {
    snap.newBacklinks  = Math.max(0, snap.totalBacklinks  - prev.totalBacklinks);
    snap.lostBacklinks = Math.max(0, prev.totalBacklinks  - snap.totalBacklinks);
    snap.newRefDomains  = Math.max(0, snap.referringDomains - prev.referringDomains);
    snap.lostRefDomains = Math.max(0, prev.referringDomains - snap.referringDomains);
  }

  current.target         = target;
  current.snapshots      = [...current.snapshots.slice(-51), snap]; // keep ~1 year (52 weeks)
  current.lastSnapshotAt = new Date().toISOString();

  return { ok: true, snapshot: snap, data: current, cost: result.cost };
}

export interface BacklinkSummary {
  current:        BacklinkSnapshot | null;
  trend30d:       { backlinks: number; refDomains: number; rank: number };
  trend90d:       { backlinks: number; refDomains: number; rank: number };
  /** Health score 0-100 — higher = stronger backlink profile */
  healthScore:    number;
  flags:          string[];
}

export function summarizeBacklinks(data: BacklinkData): BacklinkSummary {
  const snaps = data.snapshots;
  const current = snaps[snaps.length - 1] ?? null;

  const findNDaysAgo = (n: number) => {
    if (!current) return null;
    const targetMs = new Date(current.date).getTime() - n * 86_400_000;
    let best: BacklinkSnapshot | null = null;
    let bestDiff = Infinity;
    for (const s of snaps) {
      const diff = Math.abs(new Date(s.date).getTime() - targetMs);
      if (diff < bestDiff) { best = s; bestDiff = diff; }
    }
    return best;
  };

  const past30 = findNDaysAgo(30);
  const past90 = findNDaysAgo(90);

  const diff = (a: BacklinkSnapshot | null, b: BacklinkSnapshot | null) => ({
    backlinks:  a && b ? a.totalBacklinks   - b.totalBacklinks   : 0,
    refDomains: a && b ? a.referringDomains - b.referringDomains : 0,
    rank:       a && b ? a.domainRank        - b.domainRank      : 0,
  });

  const flags: string[] = [];
  if (current) {
    if (current.brokenBacklinks > 50) flags.push(`${current.brokenBacklinks} broken backlinks — fix or redirect`);
    if (current.lostBacklinks && current.lostBacklinks > 20) flags.push(`${current.lostBacklinks} backlinks lost this week`);
    if (current.referringDomains < 10) flags.push("Very few referring domains — focus on outreach");
  }

  // Health score: blend of rank, growth, and broken backlinks
  let health = 0;
  if (current) {
    health = Math.min(100, Math.round(
      (current.domainRank / 10) +
      Math.log10(current.referringDomains + 1) * 12 +
      (past30 ? Math.max(0, current.referringDomains - past30.referringDomains) * 2 : 0) -
      Math.min(20, current.brokenBacklinks / 5),
    ));
  }

  return {
    current,
    trend30d:    diff(current, past30),
    trend90d:    diff(current, past90),
    healthScore: Math.max(0, health),
    flags,
  };
}
