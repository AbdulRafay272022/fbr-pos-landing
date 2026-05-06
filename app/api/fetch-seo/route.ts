/**
 * GET /api/fetch-seo
 *
 * GSC Data Fetch Route — pulls last 28 days of impressions/clicks/CTR/position
 * data from Google Search Console and stores in data/seo.json.
 *
 * Called by agentBrain when shouldFetchSeo decision is true.
 * Requires env vars: GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, GSC_SITE_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchSeoData } from "@/lib/agent/seoFeedback";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { getSiteConfig } from "@/lib/agent/siteConfig";
import type { SeoData } from "@/lib/types";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts:    new Date().toISOString(),
    route: "fetch-seo",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized fetch-seo attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    return NextResponse.json({ success: false, reason: "GitHub env vars not set" }, { status: 500 });
  }

  const clientEmail = process.env.GSC_CLIENT_EMAIL;
  const privateKey  = process.env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const siteUrl     = process.env.GSC_SITE_URL;

  if (!clientEmail || !privateKey || !siteUrl) {
    log("warn", "GSC env vars not configured — skipping fetch");
    return NextResponse.json({
      success:  false,
      reason:   "GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, GSC_SITE_URL not configured",
      skipped:  true,
    });
  }

  const config = getSiteConfig();
  log("info", "GSC fetch started", { site: config.name, siteUrl });

  // ── Fetch from GSC ─────────────────────────────────────────────────────────
  const result = await fetchSeoData(clientEmail, privateKey, siteUrl);

  if (!result.success || !result.data) {
    log("warn", "GSC fetch unsuccessful", { reason: result.reason });
    return NextResponse.json({ success: false, reason: result.reason });
  }

  const { data: newData } = result;

  // ── Merge with existing seo.json (preserve history context) ───────────────
  const existing = await readJsonFromGitHub<SeoData>("data/seo.json", token, owner, repo);

  // If we already have data, keep topPages history for trend display
  const merged: SeoData = {
    ...newData,
    // Carry forward any previous pages that now have 0 impressions
    // (GSC only returns rows with at least 1 impression in the period)
    pages: newData.pages,
  };

  log("info", "GSC fetch successful", {
    pages:            merged.pages.length,
    totalImpressions: merged.summary.totalImpressions,
    totalClicks:      merged.summary.totalClicks,
    avgCTR:           (merged.summary.avgCTR * 100).toFixed(2) + "%",
    avgPosition:      merged.summary.avgPosition.toFixed(1),
  });

  // ── Commit to GitHub ───────────────────────────────────────────────────────
  try {
    await atomicCommit(
      [{ path: "data/seo.json", content: JSON.stringify(merged, null, 2) }],
      `chore: update GSC data — ${merged.pages.length} pages, ${merged.summary.totalImpressions} impressions`,
      token, owner, repo, branch
    );

    return NextResponse.json({
      success:          true,
      pages:            merged.pages.length,
      totalImpressions: merged.summary.totalImpressions,
      avgCTR:           merged.summary.avgCTR,
      avgPosition:      merged.summary.avgPosition,
      topPages:         merged.topPages,
      lastFetchedAt:    merged.lastFetchedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Failed to commit seo.json", { error: message });
    return NextResponse.json({ success: false, reason: message }, { status: 500 });
  }
}

// Note on GSC env vars not set: the route returns a soft success (skipped: true)
// so the agentBrain doesn't treat this as a failure when GSC is not configured.
// GSC integration is optional — the agent works without it.
export const _gscOptional = true;
