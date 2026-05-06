/**
 * GET /api/agent-status
 *
 * Dashboard API — returns the current state of the autonomous SEO agent.
 *
 * Public endpoint (no auth required — read-only data).
 *
 * Response shape:
 * {
 *   agent: { isRunning, lockedBy, lockAgeSeconds }
 *   stats: { blogsGenerated, blogsUpdated, keywordsUsed, lastRunAt, ... }
 *   keywords: { total, unused, lastScraped }
 *   blogs: { total, recentlyUpdated }
 *   seo: { totalImpressions, avgCTR, avgPosition, topPages, lastFetchedAt }
 *   costs: { monthlyTokens, monthlyBudget, pctUsed, calls }
 *   logs: { recent: [...last 20 entries] }
 * }
 */

import { NextResponse } from "next/server";
import { readJsonFromGitHub } from "@/lib/githubApi";
import { getMonthlyBudget } from "@/lib/agent/costGuard";
import { topConvertingPages } from "@/lib/agent/conversionTracker";
import { topSignalledPages } from "@/lib/agent/backlinkSignal";
import type {
  MetaJson, KeywordsData, SeoData, CostData, LogsData,
  IndexingData, DistributionData, ConversionData,
  LandingPagesData, ProgrammaticPagesData, DecayData, EngagementData,
} from "@/lib/types";
import type { SignalData } from "@/lib/agent/backlinkSignal";

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogIndex = {
  slug:        string;
  title:       string;
  publishedAt: string;
  lastUpdated?: string;
  version?:    number;
  keywords:    string[];
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "GitHub env vars not configured" },
      { status: 500 }
    );
  }

  // ── Parallel reads ─────────────────────────────────────────────────────────
  const [
    meta, kwData, blogIndex, seoData, costsData, logsData,
    indexingData, distData, convData, signalData,
    landingData, progData, decayData, engData,
  ] = await Promise.all([
    readJsonFromGitHub<MetaJson>              ("data/meta.json",               token, owner, repo),
    readJsonFromGitHub<KeywordsData>          ("data/keywords.json",           token, owner, repo),
    readJsonFromGitHub<BlogIndex[]>           ("data/index.json",              token, owner, repo),
    readJsonFromGitHub<SeoData>               ("data/seo.json",                token, owner, repo),
    readJsonFromGitHub<CostData>              ("data/costs.json",              token, owner, repo),
    readJsonFromGitHub<LogsData>              ("data/logs.json",               token, owner, repo),
    readJsonFromGitHub<IndexingData>          ("data/indexing.json",           token, owner, repo),
    readJsonFromGitHub<DistributionData>      ("data/distribution.json",       token, owner, repo),
    readJsonFromGitHub<ConversionData>        ("data/conversions.json",        token, owner, repo),
    readJsonFromGitHub<SignalData>            ("data/signals.json",            token, owner, repo),
    readJsonFromGitHub<LandingPagesData>      ("data/landing-index.json",      token, owner, repo),
    readJsonFromGitHub<ProgrammaticPagesData> ("data/programmatic-index.json", token, owner, repo),
    readJsonFromGitHub<DecayData>             ("data/decay.json",              token, owner, repo),
    readJsonFromGitHub<EngagementData>        ("data/engagement.json",         token, owner, repo),
  ]);

  // ── Agent lock status ──────────────────────────────────────────────────────
  const isRunning  = meta?.agent?.isRunning ?? false;
  const lockedAt   = meta?.agent?.lockedAt  ?? null;
  const lockAgeSec = lockedAt
    ? Math.floor((Date.now() - new Date(lockedAt).getTime()) / 1000)
    : null;

  // ── Keyword stats ──────────────────────────────────────────────────────────
  const allKws    = kwData?.keywords ?? [];
  const unusedKws = allKws.filter((k) => !k.used).length;

  // ── Blog stats ─────────────────────────────────────────────────────────────
  const blogs          = blogIndex ?? [];
  const recentlyUpdated = blogs
    .filter((b) => b.lastUpdated)
    .sort((a, b) =>
      new Date(b.lastUpdated!).getTime() - new Date(a.lastUpdated!).getTime()
    )
    .slice(0, 5)
    .map((b) => ({
      slug:        b.slug,
      title:       b.title,
      lastUpdated: b.lastUpdated,
      version:     b.version ?? 1,
    }));

  // ── SEO stats ──────────────────────────────────────────────────────────────
  const seo = seoData
    ? {
        totalImpressions: seoData.summary.totalImpressions,
        totalClicks:      seoData.summary.totalClicks,
        avgCTR:           parseFloat((seoData.summary.avgCTR * 100).toFixed(2)),
        avgPosition:      parseFloat(seoData.summary.avgPosition.toFixed(1)),
        topPages:         seoData.topPages ?? [],
        lastFetchedAt:    seoData.lastFetchedAt,
        totalTrackedPages: seoData.pages.length,
      }
    : null;

  // ── Cost stats ─────────────────────────────────────────────────────────────
  const monthKey     = new Date().toISOString().slice(0, 7);
  const budget       = costsData?.monthlyTokenBudget ?? getMonthlyBudget();
  const monthTokens  = costsData?.monthly?.[monthKey]?.tokens ?? 0;
  const monthCalls   = costsData?.monthly?.[monthKey]?.calls  ?? 0;
  const pctUsed      = budget > 0 ? parseFloat(((monthTokens / budget) * 100).toFixed(1)) : 0;

  // ── Recent logs ────────────────────────────────────────────────────────────
  const recentLogs = (logsData?.entries ?? [])
    .slice(-20)
    .reverse()
    .map((e) => ({
      ts:    e.ts,
      event: e.event,
      level: e.level,
      slug:  e.slug,
      success: e.success,
      durationMs: e.durationMs,
    }));

  // ── Response ───────────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),

      agent: {
        isRunning,
        lockedBy:     meta?.agent?.lockedBy ?? null,
        lockAgeSeconds: lockAgeSec,
      },

      stats: {
        blogsGeneratedTotal: meta?.stats?.blogsGeneratedTotal ?? 0,
        blogsUpdatedTotal:   meta?.stats?.blogsUpdatedTotal   ?? 0,
        keywordsUsedTotal:   meta?.stats?.keywordsUsedTotal   ?? 0,
        lastScrapeAt:        meta?.stats?.lastScrapeAt        ?? null,
        lastGenerateAt:      meta?.stats?.lastGenerateAt      ?? null,
        lastUpdateAt:        meta?.stats?.lastUpdateAt        ?? null,
      },

      keywords: {
        total:       allKws.length,
        unused:      unusedKws,
        used:        allKws.length - unusedKws,
        lastScraped: kwData?.lastScraped ?? null,
      },

      blogs: {
        total:           blogs.length,
        recentlyUpdated,
      },

      seo,

      costs: {
        monthlyTokensUsed: monthTokens,
        monthlyBudget:     budget,
        pctUsed,
        monthlyCalls:      monthCalls,
        budgetExceeded:    monthTokens >= budget,
      },

      logs: {
        recent: recentLogs,
      },

      // ── Phase 4 additions ──────────────────────────────────────────────────
      indexing: {
        totalSubmitted:  indexingData?.totalSubmitted   ?? 0,
        lastSubmittedAt: indexingData?.lastSubmittedAt  ?? null,
        recentSubmissions: (indexingData?.records ?? [])
          .slice(-10)
          .reverse()
          .map((r) => ({ slug: r.slug, status: r.status, submittedAt: r.submittedAt })),
      },

      distribution: {
        totalDistributed:  distData?.totalDistributed   ?? 0,
        lastDistributedAt: distData?.lastDistributedAt  ?? null,
        recentPosts: (distData?.records ?? [])
          .slice(-5)
          .reverse()
          .map((r) => ({
            slug:          r.slug,
            title:         r.title,
            distributedAt: r.distributedAt,
            platforms:     r.posts.filter((p) => p.success).map((p) => p.platform),
          })),
      },

      conversions: {
        totalClicks:         convData?.summary?.totalClicks          ?? 0,
        totalWhatsAppClicks: convData?.summary?.totalWhatsAppClicks  ?? 0,
        totalFormSubmits:    convData?.summary?.totalFormSubmits     ?? 0,
        topPages:            convData ? topConvertingPages(convData, 5) : [],
      },

      signals: {
        total:    Object.values(signalData?.bySlug ?? {}).reduce((a, b) => a + b, 0),
        topPages: signalData ? topSignalledPages(signalData, 5) : [],
      },

      // ── Phase 5 additions ──────────────────────────────────────────────────
      landingPages: {
        total:           landingData?.totalPublished   ?? 0,
        lastGeneratedAt: landingData?.lastGeneratedAt  ?? null,
        recent: (landingData?.pages ?? [])
          .slice(-5)
          .reverse()
          .map((p) => ({ slug: p.slug, title: p.title, pageType: p.pageType })),
      },

      programmatic: {
        total:           progData?.totalPublished   ?? 0,
        lastGeneratedAt: progData?.lastGeneratedAt  ?? null,
        recent: (progData?.pages ?? [])
          .slice(-5)
          .reverse()
          .map((p) => ({ slug: p.slug, city: p.city, service: p.service, industry: p.industry })),
      },

      decay: {
        totalSignals:    decayData?.signals?.length     ?? 0,
        lastDetectedAt:  decayData?.lastDetectedAt      ?? null,
        pendingRefresh:  (decayData?.signals ?? []).filter((s) => !s.refreshTriggered).length,
        recentSignals: (decayData?.signals ?? [])
          .slice(-5)
          .map((s) => ({
            slug:            s.slug,
            impressionsDrop: s.impressionsDrop,
            positionDrop:    s.positionDrop,
            detectedAt:      s.detectedAt,
          })),
      },

      engagement: {
        totalSlugsTracked: Object.keys(engData?.summary ?? {}).length,
        topByScrollDepth: Object.entries(engData?.summary ?? {})
          .sort((a, b) => b[1].avgScrollDepth - a[1].avgScrollDepth)
          .slice(0, 5)
          .map(([slug, stats]) => ({ slug, avgScrollDepth: stats.avgScrollDepth, totalSessions: stats.totalSessions })),
        topByTimeOnPage: Object.entries(engData?.summary ?? {})
          .sort((a, b) => b[1].avgTimeOnPage - a[1].avgTimeOnPage)
          .slice(0, 5)
          .map(([slug, stats]) => ({ slug, avgTimeOnPage: stats.avgTimeOnPage, bounceRate: stats.bounceRate })),
      },
    },
    {
      headers: {
        // Cache for 60s — fresh enough for a dashboard, avoids hammering GitHub API
        "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
