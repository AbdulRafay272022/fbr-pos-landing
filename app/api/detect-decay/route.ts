/**
 * GET /api/detect-decay
 *
 * Content decay detection — Phase 5.
 * Compares current GSC data against stored baseline to find pages
 * with significant impression or ranking drops. Triggers refresh for
 * affected pages and rotates the baseline for next comparison.
 *
 * Auth: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import type { SeoData, DecayData } from "@/lib/types";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { getGitHubConfig, getSiteConfig } from "@/lib/agent/siteConfig";
import {
  detectDecay,
  mergeDecaySignals,
  rotateBaseline,
  getSlugsNeedingRefresh,
  markRefreshTriggered,
  summariseDecay,
  defaultDecayBaseline,
  defaultDecayData,
  type DecayBaseline,
} from "@/lib/agent/decayDetector";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts:    new Date().toISOString(),
    route: "detect-decay",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("Authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteConfig = getSiteConfig();
  const gh         = getGitHubConfig();
  if (!gh) return NextResponse.json({ error: "GitHub not configured" }, { status: 500 });

  const { token, owner, repo } = gh;

  // ── Load data in parallel ────────────────────────────────────────────────────
  const [seoData, decayData, baseline] = await Promise.all([
    readJsonFromGitHub<SeoData>("data/seo.json", token, owner, repo),
    readJsonFromGitHub<DecayData>("data/decay.json", token, owner, repo)
      .then((d) => d ?? defaultDecayData()),
    readJsonFromGitHub<DecayBaseline>("data/decay-baseline.json", token, owner, repo)
      .then((d) => d ?? defaultDecayBaseline()),
  ]);

  if (!seoData || seoData.pages.length === 0) {
    log("info", "No SEO data — skipping decay detection");
    return NextResponse.json({ success: true, decaysFound: 0, reason: "no SEO data" });
  }

  // First run: populate baseline without detecting (no prior data to compare)
  const isFirstRun = !baseline.lastRotatedAt || Object.keys(baseline.pages).length === 0;

  if (isFirstRun) {
    const newBaseline = rotateBaseline(seoData, baseline);
    const files = [
      { path: "data/decay-baseline.json", content: JSON.stringify(newBaseline, null, 2) },
    ];
    try {
      await atomicCommit(files, "data: initialise decay baseline", token, owner, repo, gh.branch);
    } catch (err) {
      log("error", "Failed to initialise baseline", { error: String(err) });
    }
    log("info", "First decay run — baseline initialised, no signals detected");
    return NextResponse.json({ success: true, decaysFound: 0, reason: "baseline initialised" });
  }

  // ── Detect decay signals ──────────────────────────────────────────────────────
  const siteUrl    = siteConfig.baseUrl;
  const newSignals = detectDecay(seoData, baseline, siteUrl);

  log("info", `Decay detection complete`, {
    found:   newSignals.length,
    summary: summariseDecay(newSignals),
  });

  // ── Merge into decay data ─────────────────────────────────────────────────────
  let updatedDecay = mergeDecaySignals(decayData, newSignals);

  // ── Trigger refresh for decayed pages ─────────────────────────────────────────
  const toRefresh = getSlugsNeedingRefresh(updatedDecay);
  const refreshed: string[] = [];
  const refreshBaseUrl = siteConfig.baseUrl.replace(/\/$/, "");
  const cronSecret     = process.env.CRON_SECRET ?? "";

  for (const slug of toRefresh.slice(0, 3)) {
    try {
      const res = await fetch(
        `${refreshBaseUrl}/api/refresh-content?slug=${encodeURIComponent(slug)}`,
        {
          headers: { Authorization: `Bearer ${cronSecret}` },
          signal:  AbortSignal.timeout(50_000),
        }
      );
      if (res.ok) {
        updatedDecay = markRefreshTriggered(updatedDecay, slug);
        refreshed.push(slug);
        log("info", "Decay refresh triggered", { slug });
      } else {
        log("warn", "Refresh returned non-OK", { slug, status: res.status });
      }
    } catch (err) {
      log("warn", "Refresh trigger failed", { slug, error: String(err) });
    }
  }

  // ── Rotate baseline for next run ──────────────────────────────────────────────
  const newBaseline = rotateBaseline(seoData, baseline);

  // ── Commit ───────────────────────────────────────────────────────────────────
  const files = [
    { path: "data/decay.json",          content: JSON.stringify(updatedDecay,  null, 2) },
    { path: "data/decay-baseline.json", content: JSON.stringify(newBaseline,   null, 2) },
  ];

  try {
    await atomicCommit(
      files,
      `data: decay detection — ${newSignals.length} signals, ${refreshed.length} refreshed`,
      token, owner, repo, gh.branch
    );
  } catch (err) {
    log("error", "Commit failed", { error: String(err) });
    return NextResponse.json({ success: false, error: "commit failed" }, { status: 500 });
  }

  return NextResponse.json({
    success:         true,
    decaysFound:     newSignals.length,
    refreshed,
    signals:         newSignals.map((s) => ({
      slug:             s.slug,
      impressionsDrop:  s.impressionsDrop,
      positionDrop:     s.positionDrop,
    })),
  });
}
