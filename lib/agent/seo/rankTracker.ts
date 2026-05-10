/**
 * lib/agent/seo/rankTracker.ts
 *
 * Daily keyword rank tracking — the missing feedback loop.
 *
 * For each tracked keyword:
 *  1. Fetch live SERP from DataForSEO
 *  2. Find our domain's position (if any) in top 100
 *  3. Compare to previous day's rank → compute delta
 *  4. Persist to data/rankings.json (history per keyword)
 *
 * Output drives:
 *  - Decay alerts (rank dropped > 5)
 *  - Win celebrations (rank improved > 3)
 *  - Weekly client report
 *  - Striking-distance prioritisation
 *
 * Cost: ~$0.0006 per keyword per day. 100 kw × 30 days = $1.80/mo.
 */

import { getLiveSerp } from "./dataforseo";

export interface RankSnapshot {
  /** ISO date YYYY-MM-DD */
  date:        string;
  /** Position 1-100, or null if not in top 100 */
  position:    number | null;
  /** URL on our domain that ranked, or null */
  url:         string | null;
  /** Position of top competitor (rank 1) */
  topCompetitor: { url: string; domain: string } | null;
  /** Cost charged to DataForSEO account */
  cost:        number;
}

export interface KeywordRanking {
  keyword:           string;
  cluster?:          string;
  /** Time-series of daily snapshots (newest last) */
  history:           RankSnapshot[];
  /** Latest position */
  currentPosition:   number | null;
  /** Position 7 days ago */
  position7dAgo:     number | null;
  /** Position 30 days ago */
  position30dAgo:    number | null;
  /** Movement: positive = improved (lower number), negative = declined */
  delta7d:           number | null;
  delta30d:          number | null;
  /** Best rank ever */
  bestPosition:      number | null;
  /** ISO timestamp when best rank was achieved */
  bestPositionAt:    string | null;
  /** Last successful track time */
  lastTrackedAt:     string;
}

export interface RankingsData {
  /** keyed by keyword */
  rankings:          Record<string, KeywordRanking>;
  /** Last full-track timestamp */
  lastTrackRunAt:    string | null;
  /** Total credits spent on DataForSEO this month */
  monthlyCost:       Record<string, number>;
}

export const EMPTY_RANKINGS: RankingsData = {
  rankings:       {},
  lastTrackRunAt: null,
  monthlyCost:    {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d = new Date()): string { return d.toISOString().slice(0, 10); }
function monthKey(d = new Date()): string { return d.toISOString().slice(0, 7); }

function findOurPosition(items: Array<{ type: string; rank_absolute: number; url?: string; domain?: string }>, ourDomain: string): { position: number; url: string } | null {
  const normalized = ourDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  for (const it of items) {
    if (it.type !== "organic") continue;
    const itDomain = (it.domain ?? "").toLowerCase();
    if (itDomain.includes(normalized) || normalized.includes(itDomain)) {
      return { position: it.rank_absolute, url: it.url ?? "" };
    }
  }
  return null;
}

function findTopCompetitor(items: Array<{ type: string; url?: string; domain?: string; rank_absolute: number }>, ourDomain: string): { url: string; domain: string } | null {
  const normalized = ourDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  for (const it of items) {
    if (it.type !== "organic") continue;
    const itDomain = (it.domain ?? "").toLowerCase();
    if (itDomain && !itDomain.includes(normalized)) {
      return { url: it.url ?? "", domain: itDomain };
    }
  }
  return null;
}

function getSnapshotNDaysAgo(history: RankSnapshot[], days: number): number | null {
  const target = isoDate(new Date(Date.now() - days * 86_400_000));
  // Find the snapshot closest to the target date (within ±2 days)
  let best: RankSnapshot | null = null;
  let bestDiff = Infinity;
  for (const s of history) {
    const diff = Math.abs(new Date(s.date).getTime() - new Date(target).getTime()) / 86_400_000;
    if (diff < bestDiff && diff <= 2) { best = s; bestDiff = diff; }
  }
  return best?.position ?? null;
}

// ─── Core tracking ────────────────────────────────────────────────────────────

export interface TrackOptions {
  keywords:     string[];
  ourDomain:    string;          // e.g. "phelixerp.online"
  locationCode?:number;
  languageCode?:string;
  /** Limit how many keywords to track this run (cost guard) */
  maxPerRun?:   number;
}

export interface TrackResult {
  tracked:    number;
  failed:     number;
  newWins:    Array<{ keyword: string; from: number | null; to: number }>;
  newDrops:   Array<{ keyword: string; from: number; to: number | null }>;
  totalCost:  number;
  data:       RankingsData;
}

/**
 * Track all keywords. Mutates and returns the rankings store.
 */
export async function trackKeywords(
  opts:    TrackOptions,
  current: RankingsData,
): Promise<TrackResult> {
  const date = isoDate();
  const month = monthKey();
  const keywords = opts.keywords.slice(0, opts.maxPerRun ?? 200);

  const newWins:  TrackResult["newWins"]  = [];
  const newDrops: TrackResult["newDrops"] = [];
  let tracked = 0, failed = 0, totalCost = 0;

  for (const kw of keywords) {
    const serp = await getLiveSerp({
      keyword:      kw,
      locationCode: opts.locationCode,
      languageCode: opts.languageCode,
    });

    if (!serp.ok) {
      failed++;
      continue;
    }

    const ours = findOurPosition(serp.data.items, opts.ourDomain);
    const top  = findTopCompetitor(serp.data.items, opts.ourDomain);
    totalCost += serp.cost;

    const snapshot: RankSnapshot = {
      date,
      position:      ours?.position ?? null,
      url:           ours?.url      ?? null,
      topCompetitor: top,
      cost:          serp.cost,
    };

    const prev = current.rankings[kw];
    const history = (prev?.history ?? []).slice(-89); // keep 90 days
    history.push(snapshot);

    const prevPos = prev?.currentPosition ?? null;
    const newPos  = snapshot.position;

    // Win/drop detection
    if (newPos !== null && (prevPos === null || newPos < prevPos - 2)) {
      newWins.push({ keyword: kw, from: prevPos, to: newPos });
    } else if (prevPos !== null && (newPos === null || newPos > prevPos + 5)) {
      newDrops.push({ keyword: kw, from: prevPos, to: newPos });
    }

    const bestSoFar = prev?.bestPosition ?? null;
    const newBest = newPos !== null && (bestSoFar === null || newPos < bestSoFar);

    current.rankings[kw] = {
      keyword:         kw,
      cluster:         prev?.cluster,
      history,
      currentPosition: newPos,
      position7dAgo:   getSnapshotNDaysAgo(history, 7),
      position30dAgo:  getSnapshotNDaysAgo(history, 30),
      delta7d:         (() => {
        const past = getSnapshotNDaysAgo(history, 7);
        if (past === null || newPos === null) return null;
        return past - newPos; // positive = improved
      })(),
      delta30d:        (() => {
        const past = getSnapshotNDaysAgo(history, 30);
        if (past === null || newPos === null) return null;
        return past - newPos;
      })(),
      bestPosition:    newBest ? newPos : bestSoFar,
      bestPositionAt:  newBest ? new Date().toISOString() : (prev?.bestPositionAt ?? null),
      lastTrackedAt:   new Date().toISOString(),
    };

    tracked++;
  }

  current.lastTrackRunAt = new Date().toISOString();
  current.monthlyCost[month] = (current.monthlyCost[month] ?? 0) + totalCost;

  return { tracked, failed, newWins, newDrops, totalCost, data: current };
}

// ─── Reporting helpers ────────────────────────────────────────────────────────

export interface RankingSummary {
  totalKeywords:        number;
  ranking:              number;     // appears in top 100
  topThree:             number;
  topTen:               number;
  pageOne:              number;     // 1-10
  pageTwo:              number;     // 11-20
  pageThreePlus:        number;     // 21+
  notRanking:           number;
  averagePosition:      number | null;
  totalImproved:        number;
  totalDeclined:        number;
  biggestWin?:          { keyword: string; delta: number };
  biggestDrop?:         { keyword: string; delta: number };
}

export function summarizeRankings(data: RankingsData): RankingSummary {
  const all = Object.values(data.rankings);
  const sum: RankingSummary = {
    totalKeywords:   all.length,
    ranking:         0, topThree: 0, topTen: 0, pageOne: 0, pageTwo: 0,
    pageThreePlus:   0, notRanking: 0,
    averagePosition: null,
    totalImproved:   0, totalDeclined: 0,
  };
  let posSum = 0, posCount = 0;
  let bestWin: { keyword: string; delta: number } | undefined;
  let worstDrop: { keyword: string; delta: number } | undefined;

  for (const r of all) {
    const p = r.currentPosition;
    if (p === null) sum.notRanking++;
    else {
      sum.ranking++;
      posSum += p; posCount++;
      if (p <= 3)  sum.topThree++;
      if (p <= 10) sum.topTen++;
      if (p <= 10) sum.pageOne++;
      else if (p <= 20) sum.pageTwo++;
      else sum.pageThreePlus++;
    }
    if (r.delta7d !== null) {
      if (r.delta7d > 0) {
        sum.totalImproved++;
        if (!bestWin || r.delta7d > bestWin.delta) bestWin = { keyword: r.keyword, delta: r.delta7d };
      } else if (r.delta7d < 0) {
        sum.totalDeclined++;
        if (!worstDrop || r.delta7d < worstDrop.delta) worstDrop = { keyword: r.keyword, delta: r.delta7d };
      }
    }
  }
  sum.averagePosition = posCount > 0 ? +(posSum / posCount).toFixed(2) : null;
  sum.biggestWin  = bestWin;
  sum.biggestDrop = worstDrop;
  return sum;
}
