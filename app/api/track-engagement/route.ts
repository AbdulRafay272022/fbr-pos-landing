/**
 * POST /api/track-engagement
 *
 * Client-side engagement event receiver — Phase 5.
 * Receives scroll depth, time on page, and bounce signals from the browser.
 *
 * Payload: { type, slug, value, source? }
 * Storage: data/engagement.json (GitHub-backed, trimmed to 5000 events)
 *
 * Design:
 *  - Uses GitHub Contents API for atomic writes (same pattern as conversions)
 *  - Returns 200 immediately; heavy processing is skipped during high load
 *  - Trims old events when count > 5000
 *  - Recomputes per-slug summary on every write
 */

import { NextRequest, NextResponse } from "next/server";
import type { EngagementEvent, EngagementData, EngagementSlugSummary } from "@/lib/types";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { getGitHubConfig } from "@/lib/agent/siteConfig";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_EVENTS = 5_000;
const TRIM_TO    = 4_000;

// ─── Default state ────────────────────────────────────────────────────────────

function defaultEngagementData(): EngagementData {
  return { events: [], summary: {}, lastTrimmedAt: null };
}

// ─── Summary computation ──────────────────────────────────────────────────────

function recomputeSummary(
  events: EngagementEvent[]
): Record<string, EngagementSlugSummary> {
  const bySlug: Record<string, EngagementEvent[]> = {};

  for (const ev of events) {
    if (!bySlug[ev.slug]) bySlug[ev.slug] = [];
    bySlug[ev.slug].push(ev);
  }

  const summary: Record<string, EngagementSlugSummary> = {};

  for (const [slug, slugEvents] of Object.entries(bySlug)) {
    const scrollEvents = slugEvents.filter((e) => e.type === "scroll_depth");
    const timeEvents   = slugEvents.filter((e) => e.type === "time_on_page");
    const bounceEvents = slugEvents.filter((e) => e.type === "bounce");

    const avgScroll = scrollEvents.length
      ? scrollEvents.reduce((a, e) => a + e.value, 0) / scrollEvents.length
      : 0;

    const avgTime = timeEvents.length
      ? timeEvents.reduce((a, e) => a + e.value, 0) / timeEvents.length
      : 0;

    const bounceRate = bounceEvents.length
      ? bounceEvents.filter((e) => e.value === 1).length / bounceEvents.length
      : 0;

    // Approximate sessions: count scroll_depth events (one per page visit)
    const totalSessions = Math.max(scrollEvents.length, timeEvents.length, 1);

    summary[slug] = {
      avgScrollDepth: Math.round(avgScroll * 10) / 10,
      avgTimeOnPage:  Math.round(avgTime),
      bounceRate:     Math.round(bounceRate * 100) / 100,
      totalSessions,
    };
  }

  return summary;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate payload
  let body: { type?: string; slug?: string; value?: number; source?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, slug, value, source } = body;

  const VALID_TYPES = ["scroll_depth", "time_on_page", "bounce", "exit"] as const;
  type ValidType = typeof VALID_TYPES[number];

  if (!type || !VALID_TYPES.includes(type as ValidType)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!slug || typeof slug !== "string" || slug.length > 200) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  if (typeof value !== "number" || isNaN(value)) {
    return NextResponse.json({ error: "Invalid value" }, { status: 400 });
  }

  const gh = getGitHubConfig();
  if (!gh) {
    // Silently accept if GitHub not configured (dev mode)
    return NextResponse.json({ success: true });
  }

  const { token, owner, repo } = gh;

  // Read existing data
  let engData: EngagementData;
  try {
    engData = (await readJsonFromGitHub<EngagementData>(
      "data/engagement.json", token, owner, repo
    )) ?? defaultEngagementData();
  } catch {
    engData = defaultEngagementData();
  }

  // Build new event
  const event: EngagementEvent = {
    id:     `eng-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ts:     new Date().toISOString(),
    type:   type as ValidType,
    slug:   slug.slice(0, 100),
    value:  Math.round(value * 10) / 10,
    source: source?.slice(0, 100),
  };

  let events = [...engData.events, event];

  // Trim if over limit
  const needsTrim = events.length > MAX_EVENTS;
  if (needsTrim) {
    events = events.slice(-TRIM_TO);
  }

  // Recompute summary
  const summary = recomputeSummary(events);

  const updatedData: EngagementData = {
    events,
    summary,
    lastTrimmedAt: needsTrim ? new Date().toISOString() : engData.lastTrimmedAt,
  };

  // Commit (best-effort — don't fail the response on commit error)
  try {
    await atomicCommit(
      [{ path: "data/engagement.json", content: JSON.stringify(updatedData, null, 2) }],
      `data: track engagement ${type} on ${slug}`,
      token, owner, repo, gh.branch
    );
  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "engagement_commit_failed", error: String(err) }));
    // Still return success — don't break the user experience
  }

  return NextResponse.json({ success: true });
}
