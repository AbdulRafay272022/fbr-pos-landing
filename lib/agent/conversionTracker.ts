/**
 * lib/agent/conversionTracker.ts
 *
 * Server-side conversion event tracking.
 *
 * Events are recorded via POST /api/track-conversion (client-side JS fires it).
 * Data is persisted to data/conversions.json via GitHub atomic commit.
 *
 * Client-side integration:
 *   Any element with [data-cta-id] automatically fires a tracking event
 *   when clicked. The inline tracking script in layout.tsx handles this.
 *
 * Server-side:
 *   This module provides the read/write helpers for data/conversions.json.
 */

import type { ConversionData, ConversionEvent, ConversionType } from "@/lib/types";

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultConversionData(): ConversionData {
  return {
    events: [],
    summary: {
      totalClicks:         0,
      totalFormSubmits:    0,
      totalWhatsAppClicks: 0,
      bySlug:              {},
    },
    lastTrimmedAt: null,
  };
}

// ─── Record a conversion event ────────────────────────────────────────────────

/**
 * Add a new conversion event to the ConversionData object.
 * Returns the updated object (caller persists to GitHub).
 */
export function recordConversion(
  data:  ConversionData,
  event: Omit<ConversionEvent, "id" | "ts">
): ConversionData {
  const id  = `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ts  = new Date().toISOString();
  const full: ConversionEvent = { id, ts, ...event };

  const events = [...data.events, full];

  // ── Update summary ──────────────────────────────────────────────────────
  const summary = { ...data.summary };

  if (full.type === "cta_click" || full.type === "email_click" || full.type === "phone_click") {
    summary.totalClicks++;
  }
  if (full.type === "form_submit") {
    summary.totalFormSubmits++;
    summary.totalClicks++;
  }
  if (full.type === "whatsapp_click") {
    summary.totalWhatsAppClicks++;
    summary.totalClicks++;
  }

  if (full.slug) {
    summary.bySlug = {
      ...summary.bySlug,
      [full.slug]: (summary.bySlug[full.slug] ?? 0) + 1,
    };
  }

  // ── Trim: keep last 5000 events ─────────────────────────────────────────
  let trimmedAt = data.lastTrimmedAt;
  let finalEvents = events;
  if (events.length > 5000) {
    finalEvents = events.slice(-5000);
    trimmedAt   = ts;
  }

  return { events: finalEvents, summary, lastTrimmedAt: trimmedAt };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the top N converting blog slugs.
 */
export function topConvertingPages(data: ConversionData, topN = 10): Array<{ slug: string; conversions: number }> {
  return Object.entries(data.summary.bySlug)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([slug, conversions]) => ({ slug, conversions }));
}

/**
 * Get conversion events for a specific slug.
 */
export function eventsForSlug(data: ConversionData, slug: string): ConversionEvent[] {
  return data.events.filter((e) => e.slug === slug);
}

/**
 * Conversion rate for a blog post given impression count.
 * Returns 0–100 percentage.
 */
export function conversionRate(data: ConversionData, slug: string, impressions: number): number {
  if (impressions === 0) return 0;
  const conversions = data.summary.bySlug[slug] ?? 0;
  return parseFloat(((conversions / impressions) * 100).toFixed(2));
}

/**
 * Validate that a conversion type string is a known type.
 */
export function isValidConversionType(type: string): type is ConversionType {
  const valid: ConversionType[] = [
    "cta_click", "whatsapp_click", "form_submit", "phone_click", "email_click",
  ];
  return valid.includes(type as ConversionType);
}
