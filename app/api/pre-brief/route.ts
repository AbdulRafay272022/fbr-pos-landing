/**
 * GET /api/pre-brief
 *
 * Stage 1 of the 2-stage blog generation pipeline.
 *
 * Schedule: 1:00 AM UTC daily — exactly 1 hour before /api/agent at 2:00 AM.
 *
 * Why this exists:
 *   /api/generate-blog used to run SERP intelligence + competitor scraping + Groq
 *   all inside one function. That consumed ~23s before Groq even started, leaving
 *   only 37s for Groq in a 60s window — which regularly caused timeouts and
 *   template fallbacks instead of real AI content.
 *
 * This route pre-computes the heavy work 1 hour in advance:
 *   Stage A → Serper SERP intelligence + entity graph (run IN PARALLEL, ~12s)
 *   Stage B → Competitor scraper (parallel internal fetching, ~8s)
 *   Stage C → Save compiled brief to data/briefs/pending.json on GitHub
 *
 * /api/generate-blog reads the cached brief at 2 AM (1s GitHub read) and
 * passes it straight to Groq — giving Groq its full 55s budget every time.
 *
 * Execution time: ~20s. maxDuration: 60s (safety margin).
 */

import { NextRequest, NextResponse } from "next/server";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import type { KeywordsData } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of data/briefs/pending.json — read by /api/generate-blog at 2 AM */
export interface PendingBrief {
  keyword:         string;
  seoBrief:        string;
  competitorUrls:  string[];
  createdAt:       string;   // ISO — generate-blog checks freshness (< 6h)
  serpDifficulty?: number;
  serpRankability?: string;
  serpIntent?:     string;
}

// ─── Logger ──────────────────────────────────────────────────────────────────

function log(event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({
    ts:    new Date().toISOString(),
    route: "pre-brief",
    event,
    ...data,
  }));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startMs = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Env validation ────────────────────────────────────────────────────────
  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { success: false, reason: "Missing GitHub env vars" },
      { status: 500 }
    );
  }

  // ── Guard: nothing to pre-compute without Serper ─────────────────────────
  if (!process.env.SERPER_API_KEY) {
    log("skipped", { reason: "SERPER_API_KEY not configured — no brief to pre-compute" });
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:  "SERPER_API_KEY not configured",
    });
  }

  // ── Pick next keyword (cluster-diverse, skip pre-rejected) ──────────────
  // Mirror the same diversity logic as generate-blog's selectTopic so we brief
  // the keyword that is most likely to be picked at 2 AM.
  const kwData = await readJsonFromGitHub<KeywordsData>(
    "data/keywords.json", token, owner, repo
  );
  // Exclude used AND already-rejected keywords
  const unused = (kwData?.keywords ?? []).filter((k) => !k.used && !k.rejected);

  if (unused.length === 0) {
    log("skipped", { reason: "No unused non-rejected keywords in pool" });
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:  "No unused keywords",
    });
  }

  // Cluster-diverse sort: pick top-2 per cluster, same logic as generate-blog
  const clusterSeen = new Map<string, number>();
  const sortedUnused = [...unused].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const diversePool: typeof unused = [];
  for (const kw of sortedUnused) {
    const c = kw.cluster ?? "none";
    if ((clusterSeen.get(c) ?? 0) < 2) {
      diversePool.push(kw);
      clusterSeen.set(c, (clusterSeen.get(c) ?? 0) + 1);
      if (diversePool.length >= 10) break;
    }
  }

  // We'll try up to 3 candidates; mark impossible ones and move to the next
  const candidates = diversePool.slice(0, 3);
  let target = candidates[0];

  log("start", { keyword: target.keyword, unusedCount: unused.length });

  // ── Lazy imports ──────────────────────────────────────────────────────────
  const [
    { getCountryCode },
    { analyzeSerpIntelligence, buildIntelligentBrief },
    { getSiteConfig },
  ] = await Promise.all([
    import("@/lib/agent/keywordDiscovery"),
    import("@/lib/agent/serpIntelligence"),
    import("@/lib/agent/siteConfig"),
  ]);

  const country = process.env.SITE_COUNTRY ?? "Pakistan";
  const siteCfg = getSiteConfig();

  // ── Stage A: SERP intelligence + Entity graph — run IN PARALLEL ───────────
  // Try up to 3 candidates. If top candidate is "impossible" (government sites
  // dominate), mark it rejected in keywords.json and brief the next one instead.
  // This self-cleans the pool so impossible keywords never clog the queue again.

  let analysis:    Awaited<ReturnType<typeof analyzeSerpIntelligence>> = null;
  let entityBrief: string   = "";
  let seoBrief:    string   = "";
  let competitorUrls: string[] = [];
  const toMarkRejected: string[] = [];

  for (const candidate of candidates) {
    const [serpSettled, entitySettled] = await Promise.allSettled([
      analyzeSerpIntelligence(candidate.keyword, getCountryCode(country)),

      (async () => {
        try {
          const { buildEntityCoverage, buildEntityBrief } = await import("@/lib/agent/entityGraph");
          const coverage = await buildEntityCoverage(
            candidate.keyword, siteCfg.niche, siteCfg.seedKeywords
          );
          return buildEntityBrief(coverage);
        } catch {
          return "";
        }
      })(),
    ]);

    const candidateAnalysis = serpSettled.status === "fulfilled" ? serpSettled.value : null;

    // Fix 4: Mark impossible keywords so generate-blog skips them instantly
    if (candidateAnalysis?.rankability === "impossible") {
      log("rejection_mark", {
        keyword:    candidate.keyword,
        difficulty: candidateAnalysis.difficulty,
        reason:     "impossible — government/high-auth sites dominate SERP",
      });
      toMarkRejected.push(candidate.keyword);
      // Try next candidate
      continue;
    }

    // Found a winnable keyword — use it
    analysis    = candidateAnalysis;
    entityBrief = entitySettled.status === "fulfilled" ? (entitySettled.value ?? "") : "";
    target      = candidate;

    if (analysis) {
      seoBrief       = buildIntelligentBrief(analysis);
      competitorUrls = analysis.competitors.slice(0, 3).map((c) => c.url).filter(Boolean);
      log("serp_done", {
        keyword:     target.keyword,
        difficulty:  analysis.difficulty,
        rankability: analysis.rankability,
        intent:      analysis.intent,
        competitors: competitorUrls.length,
        elapsedMs:   Date.now() - startMs,
      });
    } else {
      log("serp_failed", { keyword: target.keyword, elapsedMs: Date.now() - startMs });
    }
    break; // Found our target
  }

  // Persist rejection marks to keywords.json (batch update)
  if (toMarkRejected.length > 0 && kwData) {
    try {
      const updatedKwData: KeywordsData = {
        ...kwData,
        keywords: kwData.keywords.map((k) =>
          toMarkRejected.includes(k.keyword)
            ? { ...k, rejected: true, rejectedReason: "impossible SERP difficulty — government sites dominate" }
            : k
        ),
      };
      await atomicCommit(
        [{ path: "data/keywords.json", content: JSON.stringify(updatedKwData, null, 2) }],
        `chore: mark ${toMarkRejected.length} impossible keywords as rejected`,
        token, owner, repo, branch
      );
      log("rejection_committed", { marked: toMarkRejected.length, keywords: toMarkRejected });
    } catch (err) {
      // Non-fatal — worst case these keywords get checked again next run
      log("rejection_commit_failed", { error: String(err) });
    }
  }

  // ── Stage B: Competitor scraper ───────────────────────────────────────────
  // Depends on SERP data for URLs — runs AFTER Stage A.
  // extractCompetitorProfiles already fetches 3 URLs in parallel → max ~8s.
  if (competitorUrls.length > 0) {
    try {
      const { extractCompetitorProfiles, buildCompetitorBrief } =
        await import("@/lib/agent/competitorScraper");

      const profile   = await extractCompetitorProfiles(competitorUrls, 3);
      const compBrief = buildCompetitorBrief(profile);
      if (compBrief) seoBrief += "\n\n" + compBrief;

      log("competitors_done", {
        scraped:   profile.competitors.length,
        avgWords:  profile.averageWordCount,
        elapsedMs: Date.now() - startMs,
      });
    } catch (err) {
      // Non-fatal — we still have the SERP brief
      log("competitors_failed", { error: String(err) });
    }
  }

  // ── Stage C: Append entity brief ──────────────────────────────────────────
  if (entityBrief) {
    seoBrief += "\n\n" + entityBrief;
  }

  seoBrief = seoBrief.trim();

  // ── Build and save the brief ──────────────────────────────────────────────
  const brief: PendingBrief = {
    keyword:        target.keyword,
    seoBrief,                         // generate-blog caps to 1000 chars in prompt
    competitorUrls,
    createdAt:      new Date().toISOString(),
    ...(analysis ? {
      serpDifficulty:  analysis.difficulty,
      serpRankability: analysis.rankability,
      serpIntent:      analysis.intent,
    } : {}),
  };

  try {
    await atomicCommit(
      [{ path: "data/briefs/pending.json", content: JSON.stringify(brief, null, 2) }],
      `chore: pre-brief for "${target.keyword}"`,
      token, owner, repo, branch
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("commit_failed", { error: msg });
    return NextResponse.json(
      { success: false, reason: `GitHub commit failed: ${msg}` },
      { status: 500 }
    );
  }

  const totalMs = Date.now() - startMs;
  log("complete", {
    keyword:         target.keyword,
    briefLength:     seoBrief.length,
    serpDifficulty:  analysis?.difficulty,
    serpRankability: analysis?.rankability,
    elapsedMs:       totalMs,
  });

  return NextResponse.json({
    success:         true,
    keyword:         target.keyword,
    briefLength:     seoBrief.length,
    serpDifficulty:  analysis?.difficulty,
    serpRankability: analysis?.rankability,
    serpIntent:      analysis?.intent,
    competitorUrls:  competitorUrls.length,
    elapsedMs:       totalMs,
  });
}
