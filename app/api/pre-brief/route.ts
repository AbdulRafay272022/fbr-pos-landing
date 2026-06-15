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
import type { TrendsCache } from "@/lib/agent/trendDiscovery";

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
  if (!cronSecret) return new Response("Unauthorized: CRON_SECRET not configured", { status: 503 });
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

  // ── Stage 0: Discover trends + load keyword data in parallel ────────────
  // Trend discovery (~8s) runs at the same time as GitHub reads (~1s each).
  // This adds zero wall-clock cost since GitHub reads dominate the first few ms.
  const [kwData, seoData, existingTrendsCache] = await Promise.all([
    readJsonFromGitHub<KeywordsData>("data/keywords.json", token, owner, repo),
    readJsonFromGitHub<{ queries?: Array<{ query: string; impressions: number; position: number; fetchedAt: string; clicks: number; ctr: number }> }>("data/seo.json", token, owner, repo).catch(() => null),
    readJsonFromGitHub<TrendsCache>("data/trends/latest.json", token, owner, repo).catch(() => null),
  ]);

  // ── Discover or reuse trend candidates ───────────────────────────────────
  const { discoverTrends, buildTrendsCache, isCacheValid, toKeywordCandidates } =
    await import("@/lib/agent/trendDiscovery");

  let trendCandidates: ReturnType<typeof toKeywordCandidates> = [];
  let freshTrendsCache: TrendsCache | null = null;

  if (existingTrendsCache && isCacheValid(existingTrendsCache)) {
    // Cache still valid (< 48h) — reuse it without another API call
    trendCandidates = toKeywordCandidates(existingTrendsCache.candidates);
    log("trends_cached", {
      count:       existingTrendsCache.candidates.length,
      expiresAt:   existingTrendsCache.expiresAt,
    });
  } else {
    // Cache stale or missing — run fresh discovery
    try {
      const discovered = await discoverTrends(process.env.SERPER_API_KEY);
      trendCandidates  = toKeywordCandidates(discovered);
      freshTrendsCache = buildTrendsCache(discovered);
      log("trends_discovered", {
        count:    discovered.length,
        news:     discovered.filter((c) => c.source === "news").length,
        autocomplete: discovered.filter((c) => c.source === "autocomplete").length,
        top:      discovered[0]?.keyword,
      });
    } catch (err) {
      // Non-fatal — agent still works without trends
      log("trends_failed", { error: String(err) });
    }
  }

  // ── Build GSC striking-distance candidates ────────────────────────────────
  // Mirror what generate-blog does: pos 11–50 queries = highest ROI
  const gscCandidates: ReturnType<typeof toKeywordCandidates> = [];
  if (seoData?.queries) {
    const strikingQueries = seoData.queries
      .filter((q) => q.position >= 11 && q.position <= 50 && q.impressions >= 3)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    for (const q of strikingQueries) {
      gscCandidates.push({
        keyword:         q.query,
        intent:          "informational" as const,
        difficulty:      q.position <= 20 ? ("low" as const) : ("medium" as const),
        priority:        Math.min(100, Math.round(q.impressions * 2 + (50 - q.position))),
        cluster:         "gsc-discovered",
        used:            false,
        usedIn:          null,
        generatedAt:     q.fetchedAt,
        validated:       true,
        validationBoost: 1.8,
      });
    }
  }

  // Exclude used AND already-rejected keywords from the keyword pool
  const unused = (kwData?.keywords ?? []).filter((k) => !k.used && !k.rejected);

  if (unused.length === 0 && trendCandidates.length === 0 && gscCandidates.length === 0) {
    log("skipped", { reason: "No unused non-rejected keywords in pool" });
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:  "No unused keywords",
    });
  }

  // ── Build candidate list: Trending → GSC → cluster-diverse pool ───────────
  // Trending topics get Priority 0 — freshest news wins.
  // GSC striking-distance keywords are Priority 1 — Google-validated.
  // Cluster-diverse keywords from the pool fill the rest.
  const clusterSeen = new Map<string, number>();
  const diversePool: typeof unused = [];
  const sortedUnused = [...unused].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const kw of sortedUnused) {
    const c = kw.cluster ?? "none";
    if ((clusterSeen.get(c) ?? 0) < 2) {
      diversePool.push(kw);
      clusterSeen.set(c, (clusterSeen.get(c) ?? 0) + 1);
      if (diversePool.length >= 10) break;
    }
  }

  // Merge: trending first, then GSC, then diverse pool
  // Deduplicate by keyword string
  const seen = new Set<string>();
  const mergedCandidates = [...trendCandidates, ...gscCandidates, ...diversePool]
    .filter((kw) => {
      const norm = kw.keyword.toLowerCase().trim();
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

  // We'll try up to 5 candidates; mark impossible ones and move to the next
  const candidates = mergedCandidates.slice(0, 5);

  if (candidates.length === 0) {
    log("skipped", { reason: "No candidates after merge" });
    return NextResponse.json({ success: true, skipped: true, reason: "No candidates" });
  }

  let target = candidates[0];

  log("start", {
    keyword:      target.keyword,
    source:       (target as { cluster?: string }).cluster ?? "pool",
    unusedCount:  unused.length,
    trendCount:   trendCandidates.length,
    gscCount:     gscCandidates.length,
  });

  // ── Lazy imports ──────────────────────────────────────────────────────────
  const [
    { getCountryCode },
    { analyzeSerpIntelligence, buildIntelligentBrief },
    { getSiteConfig },
    { getActivePack },
  ] = await Promise.all([
    import("@/lib/agent/keywordDiscovery"),
    import("@/lib/agent/serpIntelligence"),
    import("@/lib/agent/siteConfig"),
    import("@/lib/niche/registry"),
  ]);

  const country = process.env.SITE_COUNTRY ?? "Pakistan";
  const siteCfg = getSiteConfig();
  const activePack = getActivePack();

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
            candidate.keyword, siteCfg.niche, siteCfg.seedKeywords,
            { allow: activePack.prompt.entityAllow, deny: activePack.prompt.entityDeny }
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

  // ── Build commit payload: brief + trends cache (one atomic commit) ────────
  const commitFiles: Array<{ path: string; content: string }> = [
    { path: "data/briefs/pending.json", content: JSON.stringify(brief, null, 2) },
  ];

  // Persist fresh trends cache if we just discovered them (not read from cache)
  if (freshTrendsCache) {
    commitFiles.push({
      path:    "data/trends/latest.json",
      content: JSON.stringify(freshTrendsCache, null, 2),
    });
  }

  try {
    await atomicCommit(
      commitFiles,
      `chore: pre-brief for "${target.keyword}"${freshTrendsCache ? ` + ${freshTrendsCache.candidates.length} trends` : ""}`,
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
    source:          (target as { cluster?: string }).cluster ?? "pool",
    briefLength:     seoBrief.length,
    serpDifficulty:  analysis?.difficulty,
    serpRankability: analysis?.rankability,
    trendCount:      freshTrendsCache?.candidates.length ?? existingTrendsCache?.candidates.length ?? 0,
    elapsedMs:       totalMs,
  });

  return NextResponse.json({
    success:         true,
    keyword:         target.keyword,
    keywordSource:   (target as { cluster?: string }).cluster ?? "pool",
    briefLength:     seoBrief.length,
    serpDifficulty:  analysis?.difficulty,
    serpRankability: analysis?.rankability,
    serpIntent:      analysis?.intent,
    competitorUrls:  competitorUrls.length,
    trendCount:      freshTrendsCache?.candidates.length ?? 0,
    elapsedMs:       totalMs,
  });
}
