/**
 * lib/agent/decayDetector.ts
 *
 * Content decay detector — Phase 5.
 *
 * Detects pages where:
 *   - Impressions have dropped by >20% compared to a prior period
 *   - Average SERP position has worsened by >3 positions
 *   - Both signals together (strongest signal)
 *
 * Data source: data/seo.json (current GSC data).
 * We simulate "prior period" by comparing against the page's stored
 * impression/position baseline in data/decay.json. Each GSC fetch
 * rotates the current values into the prior-period slot.
 *
 * Action: trigger /api/refresh-content for affected pages.
 *
 * Architecture: pure functions. The API route handles I/O.
 */

import type { SeoData, DecaySignal, DecayData, PageMetric } from "@/lib/types";

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Minimum impressions to bother analysing */
const MIN_IMPRESSIONS = 50;
/** % drop in impressions that qualifies as decay */
const IMPRESSION_DROP_THRESHOLD = 20;
/** Positions worsened (higher number = worse rank) to qualify */
const POSITION_WORSE_THRESHOLD = 3;
/** Max pages to flag per run (avoid mass refreshes) */
const MAX_DECAY_FLAGS = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Baseline data we store between GSC fetches to compute drops */
export interface DecayBaseline {
  /** keyed by slug */
  pages: Record<string, {
    impressions: number;
    position:   number;
    recordedAt:  string;
  }>;
  lastRotatedAt: string | null;
}

export function defaultDecayBaseline(): DecayBaseline {
  return { pages: {}, lastRotatedAt: null };
}

export function defaultDecayData(): DecayData {
  return { signals: [], lastDetectedAt: null };
}

// ─── Baseline rotation ────────────────────────────────────────────────────────

/**
 * Rotate the current GSC data into the baseline for future comparisons.
 * Call this AFTER running decay detection, so detection sees the difference.
 */
export function rotateBaseline(
  seoData:  SeoData,
  existing: DecayBaseline
): DecayBaseline {
  const updated: DecayBaseline["pages"] = {};

  for (const page of seoData.pages) {
    if (page.impressions >= MIN_IMPRESSIONS) {
      updated[page.slug] = {
        impressions: page.impressions,
        position:    page.position,
        recordedAt:  page.fetchedAt ?? new Date().toISOString(),
      };
    }
  }

  return {
    pages:         updated,
    lastRotatedAt: new Date().toISOString(),
  };
}

// ─── Decay detection ──────────────────────────────────────────────────────────

/**
 * Compare current GSC data against the stored baseline.
 * Returns decay signals for pages showing significant drops.
 */
export function detectDecay(
  seoData:  SeoData,
  baseline: DecayBaseline,
  siteUrl:  string
): DecaySignal[] {
  const signals: DecaySignal[] = [];
  const baseUrl  = siteUrl.replace(/\/$/, "");

  for (const page of seoData.pages) {
    if (page.impressions < MIN_IMPRESSIONS) continue;

    const prior = baseline.pages[page.slug];
    if (!prior) continue; // no baseline yet — skip

    // Compute drops
    const impressionDrop =
      prior.impressions > 0
        ? ((prior.impressions - page.impressions) / prior.impressions) * 100
        : 0;

    // position: higher number = worse rank
    const positionDrop = page.position - prior.position; // positive = ranking fell

    const hasImpressionDecay = impressionDrop >= IMPRESSION_DROP_THRESHOLD;
    const hasPositionDecay   = positionDrop   >= POSITION_WORSE_THRESHOLD;

    if (!hasImpressionDecay && !hasPositionDecay) continue;

    signals.push({
      slug:             page.slug,
      url:              `${baseUrl}/blog/${page.slug}`,
      impressionsNow:   page.impressions,
      impressionsPrev:  prior.impressions,
      impressionsDrop:  Math.round(impressionDrop * 10) / 10,
      positionNow:      Math.round(page.position * 10) / 10,
      positionPrev:     Math.round(prior.position * 10) / 10,
      positionDrop:     Math.round(positionDrop * 10) / 10,
      detectedAt:       new Date().toISOString(),
      refreshTriggered: false,
    });
  }

  // Sort by severity: biggest impression drop first
  return signals
    .sort((a, b) => b.impressionsDrop - a.impressionsDrop)
    .slice(0, MAX_DECAY_FLAGS);
}

// ─── Merge signals ────────────────────────────────────────────────────────────

/**
 * Merge new signals into the existing decay data.
 * Deduplicates by slug — new signal overwrites old if same slug.
 * Trims to last 100 signals to prevent unbounded growth.
 */
export function mergeDecaySignals(
  existing:    DecayData,
  newSignals:  DecaySignal[]
): DecayData {
  const bySlug = new Map<string, DecaySignal>(
    existing.signals.map((s) => [s.slug, s])
  );

  for (const signal of newSignals) {
    bySlug.set(signal.slug, signal);
  }

  const all = [...bySlug.values()]
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, 100);

  return {
    signals:         all,
    lastDetectedAt:  new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return slugs that need refreshing (decayed and not yet refreshed).
 */
export function getSlugsNeedingRefresh(decayData: DecayData): string[] {
  return decayData.signals
    .filter((s) => !s.refreshTriggered)
    .map((s) => s.slug);
}

/**
 * Mark a signal as having triggered a refresh.
 */
export function markRefreshTriggered(
  decayData: DecayData,
  slug:      string
): DecayData {
  return {
    ...decayData,
    signals: decayData.signals.map((s) =>
      s.slug === slug ? { ...s, refreshTriggered: true } : s
    ),
  };
}

/**
 * Build a human-readable summary of decay signals for logging.
 */
export function summariseDecay(signals: DecaySignal[]): string {
  if (signals.length === 0) return "No decay detected";
  return signals
    .map(
      (s) =>
        `${s.slug}: −${s.impressionsDrop}% impressions, ` +
        `position ${s.positionPrev}→${s.positionNow}`
    )
    .join(" | ");
}
