/**
 * lib/agent/agentBrain.ts
 *
 * Central SEO Agent Orchestrator — the decision layer.
 *
 * This is what separates an "agent" from a "pipeline":
 *   - Reads current state before acting
 *   - Makes deliberate decisions based on rules
 *   - Prevents concurrent execution
 *   - Logs every decision
 *   - Calls the appropriate engine
 *   - Updates state after each action
 *
 * Decision rules:
 *
 *   SCRAPE keywords if:
 *     - never scraped before  OR  last scrape > scrapeIntervalDays ago
 *     - AND unused keywords < minUnusedKeywordsThreshold
 *
 *   GENERATE a blog if:
 *     - last generation > generateIntervalHours ago
 *     - AND unused keywords > 0
 *     - AND < maxBlogsPerDay generated in the last 24h
 *
 *   UPDATE blogs if:
 *     - last update > updateIntervalHours ago
 *     - AND there are eligible blogs (old enough, low quality)
 *
 * The agent calls each action via the same base URL (VERCEL_URL or
 * SITE_BASE_URL), so each action runs in its own serverless context
 * with fresh memory — preventing timeouts on the orchestrator function.
 */

import type { SiteConfig, MetaJson, KeywordsData, SeoData } from "@/lib/types";
import type { GitHubConfig } from "./siteConfig";
import { readMeta, isLocked, lockAgeSeconds, acquireLock, releaseLock } from "./jobLock";
import { readJsonFromGitHub } from "@/lib/githubApi";
import { createLogger } from "./logger";

// ── Phase 3 decision thresholds ───────────────────────────────────────────────
/** Fetch fresh GSC data once every 24h */
const GSC_FETCH_INTERVAL_HOURS   = 24;
/** Run content refresh once every 48h */
const REFRESH_INTERVAL_HOURS     = 48;
/** Run title optimisation once every 72h */
const TITLE_OPT_INTERVAL_HOURS   = 72;
/** Min impressions on a page before it becomes a refresh candidate */
const MIN_IMPRESSIONS_FOR_REFRESH = 50;

// ── Phase 5 decision thresholds ───────────────────────────────────────────────
/** Generate a landing page once every 48h */
const LANDING_GEN_INTERVAL_HOURS  = 48;
/** Optimise conversions once every 72h */
const CONV_OPT_INTERVAL_HOURS     = 72;
/** Run decay detection once every 24h (after GSC fetch) */
const DECAY_DETECT_INTERVAL_HOURS = 24;
/** Generate a programmatic page once every 36h */
const PROG_GEN_INTERVAL_HOURS     = 36;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentDecision {
  shouldScrape:               boolean;
  shouldGenerate:             boolean;
  shouldUpdate:               boolean;
  shouldFetchSeo:             boolean;
  shouldRefresh:              boolean;
  shouldOptimizeTitles:       boolean;
  // Phase 5
  shouldGenerateLanding:      boolean;
  shouldOptimizeConversion:   boolean;
  shouldDetectDecay:          boolean;
  shouldGenerateProgrammatic: boolean;
  reasons: {
    scrape:                 string;
    generate:               string;
    update:                 string;
    fetchSeo:               string;
    refresh:                string;
    optimizeTitles:         string;
    // Phase 5
    generateLanding:        string;
    optimizeConversion:     string;
    detectDecay:            string;
    generateProgrammatic:   string;
  };
}

export interface ActionResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  data?: Record<string, unknown>;
  durationMs: number;
}

export interface AgentRunResult {
  runId: string;
  startedAt: string;
  durationMs: number;
  decision: AgentDecision;
  actions: {
    scrape?:               ActionResult;
    generate?:             ActionResult;
    update?:               ActionResult;
    fetchSeo?:             ActionResult;
    refresh?:              ActionResult;
    optimizeTitles?:       ActionResult;
    // Phase 5
    generateLanding?:      ActionResult;
    optimizeConversion?:   ActionResult;
    detectDecay?:          ActionResult;
    generateProgrammatic?: ActionResult;
  };
  error?: string;
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function hoursSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function daysSince(iso: string | null | undefined): number {
  return hoursSince(iso) / 24;
}

// ─── Decision engine ──────────────────────────────────────────────────────────

async function makeDecision(
  meta: MetaJson,
  config: SiteConfig,
  gh: GitHubConfig
): Promise<AgentDecision> {
  const decision: AgentDecision = {
    shouldScrape:               false,
    shouldGenerate:             false,
    shouldUpdate:               false,
    shouldFetchSeo:             false,
    shouldRefresh:              false,
    shouldOptimizeTitles:       false,
    shouldGenerateLanding:      false,
    shouldOptimizeConversion:   false,
    shouldDetectDecay:          false,
    shouldGenerateProgrammatic: false,
    reasons: {
      scrape:               "",
      generate:             "",
      update:               "",
      fetchSeo:             "",
      refresh:              "",
      optimizeTitles:       "",
      generateLanding:      "",
      optimizeConversion:   "",
      detectDecay:          "",
      generateProgrammatic: "",
    },
  };

  // ── Read keyword pool stats + SEO data in parallel ─────────────────────────
  const [kwData, seoData] = await Promise.all([
    readJsonFromGitHub<KeywordsData>("data/keywords.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<SeoData>("data/seo.json", gh.token, gh.owner, gh.repo),
  ]);

  const unusedCount  = (kwData?.keywords ?? []).filter((k) => !k.used).length;
  const lastScrape   = meta.stats.lastScrapeAt;
  const lastGenerate = meta.stats.lastGenerateAt;
  const lastUpdate   = meta.stats.lastUpdateAt;

  // ── Phase 3 + Phase 5 timestamps (from extended stats if available) ────────
  // meta.stats may have been extended with Phase 3/5 fields at runtime
  const statsExt         = meta.stats as unknown as Record<string, unknown>;
  const lastSeoFetch     = (statsExt.lastSeoFetchAt          as string | undefined) ?? null;
  const lastRefresh      = (statsExt.lastRefreshAt           as string | undefined) ?? null;
  const lastTitleOpt     = (statsExt.lastTitleOptimizeAt     as string | undefined) ?? null;
  // Phase 5
  const lastLandingGen   = (statsExt.lastLandingGenerateAt   as string | undefined) ?? null;
  const lastConvOpt      = (statsExt.lastConversionOptAt     as string | undefined) ?? null;
  const lastDecayDetect  = (statsExt.lastDecayDetectAt       as string | undefined) ?? null;
  const lastProgGen      = (statsExt.lastProgGenerateAt      as string | undefined) ?? null;

  // ── SCRAPE decision ────────────────────────────────────────────────────────
  const scrapeAgeOk   = daysSince(lastScrape) >= config.scrapeIntervalDays;
  const needsKeywords = unusedCount < config.minUnusedKeywordsThreshold;
  const neverScraped  = !lastScrape;

  if (neverScraped || (scrapeAgeOk && needsKeywords)) {
    decision.shouldScrape = true;
    decision.reasons.scrape = neverScraped
      ? "never scraped before"
      : `${daysSince(lastScrape).toFixed(1)}d since last scrape, only ${unusedCount} unused keywords`;
  } else {
    decision.reasons.scrape = `skipped: ${unusedCount} unused keywords available, last scrape ${daysSince(lastScrape).toFixed(1)}d ago`;
  }

  // ── GENERATE decision ──────────────────────────────────────────────────────
  const generateAgeOk = hoursSince(lastGenerate) >= config.generateIntervalHours;
  const hasKeywords   = unusedCount > 0;

  if (generateAgeOk && hasKeywords) {
    decision.shouldGenerate = true;
    decision.reasons.generate = `${hoursSince(lastGenerate).toFixed(1)}h since last generation, ${unusedCount} keywords available`;
  } else if (!generateAgeOk) {
    decision.reasons.generate = `skipped: last generation ${hoursSince(lastGenerate).toFixed(1)}h ago (min ${config.generateIntervalHours}h)`;
  } else {
    decision.reasons.generate = "skipped: no unused keywords in pool";
  }

  // ── UPDATE decision ────────────────────────────────────────────────────────
  const updateAgeOk = hoursSince(lastUpdate) >= config.updateIntervalHours;

  if (updateAgeOk) {
    decision.shouldUpdate = true;
    decision.reasons.update = `${hoursSince(lastUpdate).toFixed(1)}h since last update run`;
  } else {
    decision.reasons.update = `skipped: last update ${hoursSince(lastUpdate).toFixed(1)}h ago (min ${config.updateIntervalHours}h)`;
  }

  // ── FETCH SEO decision (Phase 3) ───────────────────────────────────────────
  const gscConfigured = !!(
    process.env.GSC_CLIENT_EMAIL &&
    process.env.GSC_PRIVATE_KEY  &&
    process.env.GSC_SITE_URL
  );

  if (gscConfigured) {
    const seoFetchAgeOk = hoursSince(lastSeoFetch) >= GSC_FETCH_INTERVAL_HOURS;
    if (seoFetchAgeOk) {
      decision.shouldFetchSeo = true;
      decision.reasons.fetchSeo = lastSeoFetch
        ? `${hoursSince(lastSeoFetch).toFixed(1)}h since last GSC fetch`
        : "first GSC fetch";
    } else {
      decision.reasons.fetchSeo = `skipped: last GSC fetch ${hoursSince(lastSeoFetch).toFixed(1)}h ago (min ${GSC_FETCH_INTERVAL_HOURS}h)`;
    }
  } else {
    decision.reasons.fetchSeo = "skipped: GSC env vars not configured";
  }

  // ── REFRESH decision (Phase 3) — requires GSC data ────────────────────────
  const refreshAgeOk      = hoursSince(lastRefresh) >= REFRESH_INTERVAL_HOURS;
  const hasSeoData        = seoData && seoData.pages.length > 0;
  const hasRefreshTargets = hasSeoData &&
    seoData!.pages.some(
      (p) => p.impressions >= MIN_IMPRESSIONS_FOR_REFRESH &&
             (p.ctr < seoData!.summary.avgCTR || p.position > 20)
    );

  if (refreshAgeOk && hasRefreshTargets) {
    decision.shouldRefresh = true;
    decision.reasons.refresh = lastRefresh
      ? `${hoursSince(lastRefresh).toFixed(1)}h since last refresh, low-performers detected`
      : "first refresh run, low-performers detected";
  } else if (!refreshAgeOk) {
    decision.reasons.refresh = `skipped: last refresh ${hoursSince(lastRefresh).toFixed(1)}h ago (min ${REFRESH_INTERVAL_HOURS}h)`;
  } else {
    decision.reasons.refresh = "skipped: no low-performing pages with sufficient impressions";
  }

  // ── OPTIMIZE TITLES decision (Phase 3) ────────────────────────────────────
  const titleOptAgeOk = hoursSince(lastTitleOpt) >= TITLE_OPT_INTERVAL_HOURS;

  if (titleOptAgeOk) {
    decision.shouldOptimizeTitles = true;
    decision.reasons.optimizeTitles = lastTitleOpt
      ? `${hoursSince(lastTitleOpt).toFixed(1)}h since last title optimization`
      : "first title optimization run";
  } else {
    decision.reasons.optimizeTitles = `skipped: last title opt ${hoursSince(lastTitleOpt).toFixed(1)}h ago (min ${TITLE_OPT_INTERVAL_HOURS}h)`;
  }

  // ── GENERATE LANDING PAGE decision (Phase 5) ───────────────────────────────
  const landingAgeOk = hoursSince(lastLandingGen) >= LANDING_GEN_INTERVAL_HOURS;

  if (landingAgeOk) {
    decision.shouldGenerateLanding = true;
    decision.reasons.generateLanding = lastLandingGen
      ? `${hoursSince(lastLandingGen).toFixed(1)}h since last landing page`
      : "first landing page generation";
  } else {
    decision.reasons.generateLanding = `skipped: last landing gen ${hoursSince(lastLandingGen).toFixed(1)}h ago (min ${LANDING_GEN_INTERVAL_HOURS}h)`;
  }

  // ── OPTIMISE CONVERSIONS decision (Phase 5) — requires GSC + conversion data
  const convOptAgeOk  = hoursSince(lastConvOpt) >= CONV_OPT_INTERVAL_HOURS;
  const hasTrafficData = hasSeoData && seoData!.summary.totalImpressions > 0;

  if (convOptAgeOk && hasTrafficData) {
    decision.shouldOptimizeConversion = true;
    decision.reasons.optimizeConversion = lastConvOpt
      ? `${hoursSince(lastConvOpt).toFixed(1)}h since last conversion opt`
      : "first conversion optimization run";
  } else if (!convOptAgeOk) {
    decision.reasons.optimizeConversion = `skipped: last conv opt ${hoursSince(lastConvOpt).toFixed(1)}h ago (min ${CONV_OPT_INTERVAL_HOURS}h)`;
  } else {
    decision.reasons.optimizeConversion = "skipped: no traffic data available yet";
  }

  // ── DETECT DECAY decision (Phase 5) — requires GSC data ───────────────────
  const decayAgeOk = hoursSince(lastDecayDetect) >= DECAY_DETECT_INTERVAL_HOURS;

  if (decayAgeOk && hasSeoData) {
    decision.shouldDetectDecay = true;
    decision.reasons.detectDecay = lastDecayDetect
      ? `${hoursSince(lastDecayDetect).toFixed(1)}h since last decay check`
      : "first decay detection run";
  } else if (!decayAgeOk) {
    decision.reasons.detectDecay = `skipped: last decay check ${hoursSince(lastDecayDetect).toFixed(1)}h ago (min ${DECAY_DETECT_INTERVAL_HOURS}h)`;
  } else {
    decision.reasons.detectDecay = "skipped: no GSC data to compare against";
  }

  // ── GENERATE PROGRAMMATIC PAGE decision (Phase 5) ─────────────────────────
  const progAgeOk = hoursSince(lastProgGen) >= PROG_GEN_INTERVAL_HOURS;

  if (progAgeOk) {
    decision.shouldGenerateProgrammatic = true;
    decision.reasons.generateProgrammatic = lastProgGen
      ? `${hoursSince(lastProgGen).toFixed(1)}h since last programmatic page`
      : "first programmatic page generation";
  } else {
    decision.reasons.generateProgrammatic = `skipped: last prog gen ${hoursSince(lastProgGen).toFixed(1)}h ago (min ${PROG_GEN_INTERVAL_HOURS}h)`;
  }

  return decision;
}

// ─── HTTP action caller ───────────────────────────────────────────────────────

async function callAction(
  path: string,
  baseUrl: string,
  secret: string
): Promise<ActionResult> {
  const start = Date.now();
  try {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal:  AbortSignal.timeout(55_000), // just under Vercel's 60s limit
    });

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;

    return {
      success:    res.ok && data.success === true,
      skipped:    false,
      data,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success:    false,
      skipped:    false,
      reason:     err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ─── Agent brain entry point ──────────────────────────────────────────────────

/**
 * Run the SEO agent for one cycle.
 *
 * @param config   - site configuration
 * @param gh       - GitHub connection details
 * @param baseUrl  - deployment base URL (e.g. https://phelixerp.vercel.app)
 * @param secret   - CRON_SECRET for calling sub-routes
 */
export async function runAgent(
  config:  SiteConfig,
  gh:      GitHubConfig,
  baseUrl: string,
  secret:  string
): Promise<AgentRunResult> {
  const runId     = `run-${Date.now().toString(36)}`;
  const startedAt = new Date().toISOString();
  const agentStart = Date.now();

  // ── Load existing logs for enriched logging ──────────────────────────────
  const logger = createLogger(config.name);

  logger.info("agent_start", { runId, site: config.name, baseUrl });

  const result: AgentRunResult = {
    runId,
    startedAt,
    durationMs: 0,
    decision: {
      shouldScrape:               false,
      shouldGenerate:             false,
      shouldUpdate:               false,
      shouldFetchSeo:             false,
      shouldRefresh:              false,
      shouldOptimizeTitles:       false,
      shouldGenerateLanding:      false,
      shouldOptimizeConversion:   false,
      shouldDetectDecay:          false,
      shouldGenerateProgrammatic: false,
      reasons: {
        scrape:               "",
        generate:             "",
        update:               "",
        fetchSeo:             "",
        refresh:              "",
        optimizeTitles:       "",
        generateLanding:      "",
        optimizeConversion:   "",
        detectDecay:          "",
        generateProgrammatic: "",
      },
    },
    actions: {},
  };

  // ── Read state & check lock ────────────────────────────────────────────────
  let meta: MetaJson;
  try {
    meta = await readMeta(gh);
  } catch (err) {
    result.error = `Failed to read meta: ${err instanceof Error ? err.message : String(err)}`;
    result.durationMs = Date.now() - agentStart;
    logger.error("agent_start", { runId, error: result.error });
    return result;
  }

  if (isLocked(meta)) {
    const age = lockAgeSeconds(meta);
    result.error = `Job locked by ${meta.agent.lockedBy} (${age}s ago)`;
    result.durationMs = Date.now() - agentStart;
    logger.warn("agent_locked", { runId, lockAge: age, lockedBy: meta.agent.lockedBy });
    return result;
  }

  // ── Make decisions ────────────────────────────────────────────────────────
  let decision: AgentDecision;
  try {
    decision = await makeDecision(meta, config, gh);
    result.decision = decision;
  } catch (err) {
    result.error = `Decision failed: ${err instanceof Error ? err.message : String(err)}`;
    result.durationMs = Date.now() - agentStart;
    return result;
  }

  const anyAction =
    decision.shouldScrape               ||
    decision.shouldGenerate             ||
    decision.shouldUpdate               ||
    decision.shouldFetchSeo             ||
    decision.shouldRefresh              ||
    decision.shouldOptimizeTitles       ||
    decision.shouldGenerateLanding      ||
    decision.shouldOptimizeConversion   ||
    decision.shouldDetectDecay          ||
    decision.shouldGenerateProgrammatic;

  logger.info("agent_decision", {
    runId,
    shouldScrape:               decision.shouldScrape,
    shouldGenerate:             decision.shouldGenerate,
    shouldUpdate:               decision.shouldUpdate,
    shouldFetchSeo:             decision.shouldFetchSeo,
    shouldRefresh:              decision.shouldRefresh,
    shouldOptimizeTitles:       decision.shouldOptimizeTitles,
    shouldGenerateLanding:      decision.shouldGenerateLanding,
    shouldOptimizeConversion:   decision.shouldOptimizeConversion,
    shouldDetectDecay:          decision.shouldDetectDecay,
    shouldGenerateProgrammatic: decision.shouldGenerateProgrammatic,
    reasons:                    decision.reasons as unknown as Record<string, unknown>,
    anyAction,
  });

  if (!anyAction) {
    result.durationMs = Date.now() - agentStart;
    logger.info("agent_complete", { runId, actions: "none", durationMs: result.durationMs });
    return result;
  }

  // ── Acquire lock ──────────────────────────────────────────────────────────
  try {
    meta = await acquireLock(meta, gh, runId);
  } catch (err) {
    result.error = `Failed to acquire lock: ${err instanceof Error ? err.message : String(err)}`;
    result.durationMs = Date.now() - agentStart;
    return result;
  }

  const statsUpdate: Record<string, unknown> = {};

  try {
    // ── Execute: SCRAPE ──────────────────────────────────────────────────────
    if (decision.shouldScrape) {
      logger.info("keyword_scraped", { runId, action: "starting scrape" });
      const r = await callAction("/api/scrape-keywords", baseUrl, secret);
      result.actions.scrape = r;
      if (r.success) statsUpdate.lastScrapeAt = new Date().toISOString();
      logger.info("keyword_scraped", {
        runId,
        success:    r.success,
        durationMs: r.durationMs,
        total:      (r.data?.totalKeywords as number) ?? 0,
      });
    }

    // ── Execute: GENERATE ────────────────────────────────────────────────────
    if (decision.shouldGenerate) {
      const r = await callAction("/api/generate-blog", baseUrl, secret);
      result.actions.generate = r;
      if (r.success) {
        statsUpdate.lastGenerateAt      = new Date().toISOString();
        statsUpdate.blogsGeneratedTotal = (meta.stats.blogsGeneratedTotal ?? 0) + 1;
      }
      logger.info("blog_generated", {
        runId,
        success: r.success,
        slug:    r.data?.slug as string,
        words:   r.data?.words as number,
        source:  r.data?.source as "groq" | "template",
        durationMs: r.durationMs,
      });
    }

    // ── Execute: UPDATE ──────────────────────────────────────────────────────
    if (decision.shouldUpdate) {
      const r = await callAction("/api/update-blogs", baseUrl, secret);
      result.actions.update = r;
      if (r.success) {
        statsUpdate.lastUpdateAt      = new Date().toISOString();
        statsUpdate.blogsUpdatedTotal =
          (meta.stats.blogsUpdatedTotal ?? 0) + ((r.data?.updatedCount as number) ?? 0);
      }
      logger.info("blog_updated", {
        runId,
        success:      r.success,
        updatedCount: r.data?.updatedCount as number,
        durationMs:   r.durationMs,
      });
    }

    // ── Execute: FETCH SEO (Phase 3) ─────────────────────────────────────────
    if (decision.shouldFetchSeo) {
      const r = await callAction("/api/fetch-seo", baseUrl, secret);
      result.actions.fetchSeo = r;
      if (r.success) {
        statsUpdate.lastSeoFetchAt    = new Date().toISOString();
        statsUpdate.totalImpressions  = (r.data?.totalImpressions as number) ?? 0;
        statsUpdate.avgCTR            = (r.data?.avgCTR as number) ?? 0;
        statsUpdate.topPages          = r.data?.topPages ?? [];
      }
      logger.info("seo_fetch_complete", {
        runId,
        success:          r.success,
        pages:            r.data?.pages as number,
        totalImpressions: r.data?.totalImpressions as number,
        durationMs:       r.durationMs,
      });
    }

    // ── Execute: REFRESH (Phase 3) ────────────────────────────────────────────
    if (decision.shouldRefresh) {
      const r = await callAction("/api/refresh-content", baseUrl, secret);
      result.actions.refresh = r;
      if (r.success) {
        const prevRefreshes = (meta.stats as unknown as Record<string, unknown>).refreshesTotal as number ?? 0;
        statsUpdate.lastRefreshAt  = new Date().toISOString();
        statsUpdate.refreshesTotal = prevRefreshes + ((r.data?.refreshedCount as number) ?? 0);
      }
      logger.info("content_refreshed", {
        runId,
        success:        r.success,
        refreshedCount: r.data?.refreshedCount as number,
        durationMs:     r.durationMs,
      });
    }

    // ── Execute: OPTIMIZE TITLES (Phase 3) ────────────────────────────────────
    if (decision.shouldOptimizeTitles) {
      const r = await callAction("/api/optimize-titles", baseUrl, secret);
      result.actions.optimizeTitles = r;
      if (r.success) {
        const prevTitleOpts = (meta.stats as unknown as Record<string, unknown>).titlesOptimizedTotal as number ?? 0;
        statsUpdate.lastTitleOptimizeAt  = new Date().toISOString();
        statsUpdate.titlesOptimizedTotal = prevTitleOpts + ((r.data?.optimizedCount as number) ?? 0);
      }
      logger.info("title_optimized", {
        runId,
        success:        r.success,
        optimizedCount: r.data?.optimizedCount as number,
        durationMs:     r.durationMs,
      });
    }

    // ── Execute: GENERATE LANDING PAGE (Phase 5) ──────────────────────────────
    if (decision.shouldGenerateLanding) {
      const r = await callAction("/api/generate-landing", baseUrl, secret);
      result.actions.generateLanding = r;
      if (r.success) {
        statsUpdate.lastLandingGenerateAt  = new Date().toISOString();
        const prev = (meta.stats as unknown as Record<string, unknown>).landingsGeneratedTotal as number ?? 0;
        statsUpdate.landingsGeneratedTotal = prev + 1;
      }
      logger.info("landing_generated", {
        runId,
        success:  r.success,
        slug:     r.data?.slug as string,
        pageType: r.data?.pageType as string,
        durationMs: r.durationMs,
      });
    }

    // ── Execute: OPTIMISE CONVERSIONS (Phase 5) ───────────────────────────────
    if (decision.shouldOptimizeConversion) {
      const r = await callAction("/api/optimize-conversions", baseUrl, secret);
      result.actions.optimizeConversion = r;
      if (r.success) {
        statsUpdate.lastConversionOptAt = new Date().toISOString();
        const prev = (meta.stats as unknown as Record<string, unknown>).conversionsOptimizedTotal as number ?? 0;
        statsUpdate.conversionsOptimizedTotal = prev + ((r.data?.optimizedCount as number) ?? 0);
      }
      logger.info("conversion_optimized", {
        runId,
        success:        r.success,
        optimizedCount: r.data?.optimizedCount as number,
        durationMs:     r.durationMs,
      });
    }

    // ── Execute: DETECT DECAY (Phase 5) ──────────────────────────────────────
    if (decision.shouldDetectDecay) {
      const r = await callAction("/api/detect-decay", baseUrl, secret);
      result.actions.detectDecay = r;
      if (r.success) {
        statsUpdate.lastDecayDetectAt = new Date().toISOString();
        const prev = (meta.stats as unknown as Record<string, unknown>).decaysDetectedTotal as number ?? 0;
        statsUpdate.decaysDetectedTotal = prev + ((r.data?.decaysFound as number) ?? 0);
      }
      logger.info("decay_detected", {
        runId,
        success:     r.success,
        decaysFound: r.data?.decaysFound as number,
        durationMs:  r.durationMs,
      });
    }

    // ── Execute: GENERATE PROGRAMMATIC PAGE (Phase 5) ────────────────────────
    if (decision.shouldGenerateProgrammatic) {
      const r = await callAction("/api/generate-programmatic", baseUrl, secret);
      result.actions.generateProgrammatic = r;
      if (r.success) {
        statsUpdate.lastProgGenerateAt = new Date().toISOString();
        const prev = (meta.stats as unknown as Record<string, unknown>).programmaticGeneratedTotal as number ?? 0;
        statsUpdate.programmaticGeneratedTotal = prev + 1;
      }
      logger.info("programmatic_generated", {
        runId,
        success:    r.success,
        slug:       r.data?.slug as string,
        city:       r.data?.city as string,
        service:    r.data?.service as string,
        durationMs: r.durationMs,
      });
    }
  } catch (err) {
    result.error = `Action execution error: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("agent_complete", { runId, error: result.error });
  } finally {
    // ── Always release lock ────────────────────────────────────────────────
    try {
      const logsData    = logger.flushToLogsData();
      const logFile     = { path: "data/logs.json", content: JSON.stringify(logsData, null, 2) };
      await releaseLock(meta, statsUpdate as Parameters<typeof releaseLock>[1], [logFile], gh,
        `chore: agent cycle ${runId} complete`);
    } catch (lockErr) {
      // Non-fatal — log to console but don't mask the original error
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        event: "lock_release_failed",
        error: String(lockErr),
      }));
    }
  }

  result.durationMs = Date.now() - agentStart;
  logger.info("agent_complete", {
    runId,
    durationMs: result.durationMs,
    actions:    Object.keys(result.actions).join(", ") || "none",
  });

  return result;
}
