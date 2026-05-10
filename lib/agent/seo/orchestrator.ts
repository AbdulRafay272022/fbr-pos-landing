/**
 * lib/agent/seo/orchestrator.ts
 *
 * Master SEO orchestrator — runs the full senior-SEO loop in priority order:
 *
 *   1. Pull GSC query-level data (page + query)
 *   2. Track DataForSEO ranks for tracked keywords
 *   3. Detect striking-distance opportunities (page 2)
 *   4. Detect content decay (rank/impressions dropped)
 *   5. Detect cannibalization
 *   6. Audit Core Web Vitals on top URLs
 *   7. Validate schema on top URLs
 *   8. Find content gaps from competitor SERPs
 *
 * Each step is OPTIONAL — if env vars aren't set it's skipped silently.
 *
 * The orchestrator returns a "health report" object that the dashboard
 * renders directly. Raw data is persisted by the calling API route.
 */

import { getSeoFeatures } from "./features";
import { fetchGscQueries, type GscQueryRow } from "./gscQueries";
import { trackKeywords, summarizeRankings, type RankingsData, EMPTY_RANKINGS } from "./rankTracker";
import { findOpportunities, groupByPage, type Opportunity } from "./strikingDistance";
import { detectCannibalization, type CannibalCluster } from "./cannibalization";
import { auditBatch, summarizeCwv, type CwvData, EMPTY_CWV } from "./lighthouse";
import { validateSchemaBatch, type SchemaAuditData, EMPTY_SCHEMA_AUDIT } from "./schemaValidator";
import { findContentGaps, type ContentGap } from "./contentGap";
import { captureBacklinkSnapshot, summarizeBacklinks, type BacklinkData, EMPTY_BACKLINKS } from "./backlinkMonitor";

export interface SeoHealthReport {
  generatedAt: string;
  features:    ReturnType<typeof getSeoFeatures>;

  // GSC
  gsc?: {
    rows:       number;
    days:       number;
    error?:     string;
  };

  // Rankings
  rankings?: {
    summary:    ReturnType<typeof summarizeRankings>;
    cost:       number;
    newWins:    number;
    newDrops:   number;
    error?:     string;
  };

  // Striking distance
  opportunities?: {
    total:      number;
    page2:      number;
    page1Bottom:number;
    topPages:   ReturnType<typeof groupByPage>;
  };

  // Cannibalization
  cannibalization?: {
    clusters:   CannibalCluster[];
    flagged:    number;
  };

  // CWV
  cwv?: {
    summary:    ReturnType<typeof summarizeCwv>;
    audited:    number;
    failed:     number;
    error?:     string;
  };

  // Schema
  schema?: {
    checked:    number;
    failed:     number;
    issues:     number;
    error?:     string;
  };

  // Content gaps
  contentGaps?: {
    gaps:       ContentGap[];
    cost:       number;
    error?:     string;
  };

  // Backlinks
  backlinks?: {
    summary:    ReturnType<typeof summarizeBacklinks>;
    cost:       number;
    error?:     string;
  };

  /** Top action items, ranked */
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    title:    string;
    detail:   string;
    action:   string;
  }>;
}

export interface OrchestratorOptions {
  ourDomain:        string;
  baseUrl:          string;
  blogIndex:        Array<{ slug: string; title: string; keywords?: string[] }>;
  trackedKeywords?: string[];
  topUrls?:         string[];      // for CWV + schema audit
  seedKeywords?:    string[];      // for content gap analysis
  locationCode?:    number;
  languageCode?:    string;

  // Storage state (caller provides; orchestrator returns mutated copies)
  rankingsState?:   RankingsData;
  cwvState?:        CwvData;
  schemaState?:     SchemaAuditData;
  backlinksState?:  BacklinkData;

  // Granular run flags — let the caller skip expensive steps
  run?: {
    gsc?:           boolean;
    rankings?:      boolean;
    striking?:      boolean;
    cannibalization?:boolean;
    cwv?:           boolean;
    schema?:        boolean;
    contentGaps?:   boolean;
    backlinks?:     boolean;
  };

  // Cost guards
  maxKeywordsToTrack?: number;
  maxUrlsToAudit?:     number;
}

export interface OrchestratorResult {
  report:           SeoHealthReport;
  rankingsState:    RankingsData;
  cwvState:         CwvData;
  schemaState:      SchemaAuditData;
  backlinksState:   BacklinkData;
  /** Raw GSC rows for downstream tools (cannibalization, decay, etc.) */
  gscQueryRows?:    GscQueryRow[];
}

export async function runSeoOrchestrator(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const features  = getSeoFeatures();
  const run       = opts.run ?? {
    gsc: true, rankings: true, striking: true, cannibalization: true,
    cwv: true, schema: true, contentGaps: true, backlinks: true,
  };
  const recommendations: SeoHealthReport["recommendations"] = [];

  const report: SeoHealthReport = {
    generatedAt:      new Date().toISOString(),
    features,
    recommendations,
  };

  let rankingsState  = opts.rankingsState  ?? EMPTY_RANKINGS;
  let cwvState       = opts.cwvState       ?? EMPTY_CWV;
  let schemaState    = opts.schemaState    ?? EMPTY_SCHEMA_AUDIT;
  let backlinksState = opts.backlinksState ?? EMPTY_BACKLINKS;
  let gscRows: GscQueryRow[] | undefined;

  // 1. GSC queries
  if (run.gsc && features.gsc) {
    const gsc = await fetchGscQueries({
      // OAuth2 refresh token (preferred)
      clientId:     process.env.GSC_CLIENT_ID,
      clientSecret: process.env.GSC_CLIENT_SECRET,
      refreshToken: process.env.GSC_REFRESH_TOKEN,
      // Service account fallback
      clientEmail:  process.env.GSC_CLIENT_EMAIL,
      privateKey:   process.env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      siteUrl:      process.env.GSC_SITE_URL!,
      days:         28,
    });
    if (gsc.ok) {
      gscRows = gsc.rows;
      report.gsc = { rows: gsc.rows.length, days: gsc.days };
    } else {
      report.gsc = { rows: 0, days: 0, error: gsc.error };
    }
  }

  // 2. Rank tracking
  if (run.rankings && features.rankTracking && opts.trackedKeywords?.length) {
    try {
      const result = await trackKeywords({
        keywords:     opts.trackedKeywords,
        ourDomain:    opts.ourDomain,
        locationCode: opts.locationCode,
        languageCode: opts.languageCode,
        maxPerRun:    opts.maxKeywordsToTrack ?? 200,
      }, rankingsState);
      rankingsState = result.data;
      report.rankings = {
        summary:  summarizeRankings(rankingsState),
        cost:     result.totalCost,
        newWins:  result.newWins.length,
        newDrops: result.newDrops.length,
      };

      if (result.newDrops.length > 0) {
        recommendations.push({
          priority: "high",
          title:    `${result.newDrops.length} keywords dropped in rank`,
          detail:   `Biggest drop: "${result.newDrops[0].keyword}" from #${result.newDrops[0].from} → ${result.newDrops[0].to ?? "out of top 100"}.`,
          action:   "Refresh affected pages and add internal links from authoritative posts.",
        });
      }
    } catch (err) {
      report.rankings = {
        summary:  summarizeRankings(rankingsState),
        cost:     0, newWins: 0, newDrops: 0,
        error:    err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 3. Striking distance
  if (run.striking && gscRows) {
    const ops = findOpportunities(gscRows);
    const grouped = groupByPage(ops);
    report.opportunities = {
      total:        ops.length,
      page2:        ops.filter((o) => o.bucket === "page-2").length,
      page1Bottom:  ops.filter((o) => o.bucket === "page-1-bottom").length,
      topPages:     grouped.slice(0, 10),
    };
    if (ops.length > 0) {
      recommendations.push({
        priority: "high",
        title:    `${ops.length} striking-distance opportunities`,
        detail:   `Top opportunity: "${ops[0].query}" at position ${ops[0].position.toFixed(1)} — potential +${ops[0].potentialClicks} clicks/month.`,
        action:   ops[0].recommendedAction,
      });
    }
  }

  // 4. Cannibalization
  if (run.cannibalization) {
    const clusters = detectCannibalization(opts.blogIndex, { gscQueries: gscRows });
    report.cannibalization = { clusters, flagged: clusters.length };
    if (clusters.length > 0) {
      const c = clusters[0];
      recommendations.push({
        priority: c.recommendation === "redirect" ? "high" : "medium",
        title:    `Cannibalization: ${clusters.length} keyword clusters`,
        detail:   `"${c.primaryKeyword}" — ${c.pages.length} pages compete. ${c.reason}`,
        action:   c.recommendation === "merge"      ? "Merge into one canonical post."
                 : c.recommendation === "redirect"  ? `Keep /${c.keepPage}, 301-redirect the rest.`
                 : "Differentiate intent — assign each post a unique long-tail variant.",
      });
    }
  }

  // 5. CWV
  if (run.cwv && opts.topUrls?.length) {
    const urls = opts.topUrls.slice(0, opts.maxUrlsToAudit ?? 10);
    try {
      const result = await auditBatch({ urls, strategy: "mobile" }, cwvState);
      cwvState = result.data;
      const sum = summarizeCwv(cwvState);
      report.cwv = { summary: sum, audited: result.audited, failed: result.failed };

      if (sum.failingCwv > 0) {
        recommendations.push({
          priority: "medium",
          title:    `${sum.failingCwv} pages fail Core Web Vitals`,
          detail:   sum.worstOffenders.map((w) => `${w.url}: ${w.failureReason}`).slice(0, 3).join(" | "),
          action:   "Optimise LCP (lazy-load images, server response time) and reduce CLS (set width/height on images).",
        });
      }
    } catch (err) {
      report.cwv = {
        summary: summarizeCwv(cwvState),
        audited: 0, failed: 0,
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 6. Schema validation
  if (run.schema && opts.topUrls?.length) {
    try {
      const result = await validateSchemaBatch(opts.topUrls.slice(0, 20), schemaState);
      schemaState = result.data;
      const totalIssues = Object.values(schemaState.checks).reduce((s, c) => s + c.issues.filter((i) => i.level === "error").length, 0);
      report.schema = { checked: result.checked, failed: result.failed, issues: totalIssues };
      if (result.failed > 0) {
        recommendations.push({
          priority: "high",
          title:    `${result.failed} pages have invalid structured data`,
          detail:   `${totalIssues} schema errors detected — these block rich-result eligibility.`,
          action:   "Fix structured data — see schema audit page.",
        });
      }
    } catch (err) {
      report.schema = { checked: 0, failed: 0, issues: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // 7. Content gaps
  if (run.contentGaps && features.contentGaps && opts.seedKeywords?.length) {
    try {
      const result = await findContentGaps({
        seedKeywords:  opts.seedKeywords.slice(0, 5),
        ourDomain:     opts.ourDomain,
        ourContent:    opts.blogIndex,
        locationCode:  opts.locationCode,
        languageCode:  opts.languageCode,
        perKeyword:    5,
      });
      if (result.ok) {
        report.contentGaps = { gaps: result.gaps, cost: result.cost };
        if (result.gaps.length > 0) {
          recommendations.push({
            priority: "medium",
            title:    `${result.gaps.length} content gaps vs competitors`,
            detail:   `Top opportunity: "${result.gaps[0].suggestedKeyword}" (vol ${result.gaps[0].searchVolume}, ${result.gaps[0].competitorPages.length} competitors).`,
            action:   "Generate a brief and create a post for each high-score gap.",
          });
        }
      } else {
        report.contentGaps = { gaps: [], cost: 0, error: result.error };
      }
    } catch (err) {
      report.contentGaps = { gaps: [], cost: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // 8. Backlinks
  if (run.backlinks && features.backlinks) {
    const target = opts.baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    try {
      const result = await captureBacklinkSnapshot(target, backlinksState);
      if (result.ok) {
        backlinksState = result.data;
        report.backlinks = { summary: summarizeBacklinks(backlinksState), cost: result.cost };
        const flags = report.backlinks.summary.flags;
        if (flags.length > 0) {
          recommendations.push({
            priority: "low",
            title:    "Backlink profile flags",
            detail:   flags.join(" · "),
            action:   "Reach out to high-authority sites in your niche; fix broken backlinks.",
          });
        }
      } else {
        report.backlinks = {
          summary: summarizeBacklinks(backlinksState),
          cost:    0,
          error:   result.error,
        };
      }
    } catch (err) {
      report.backlinks = {
        summary: summarizeBacklinks(backlinksState),
        cost:    0,
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Sort recommendations by priority
  const order = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => order[a.priority] - order[b.priority]);

  return {
    report,
    rankingsState,
    cwvState,
    schemaState,
    backlinksState,
    gscQueryRows: gscRows,
  };
}
