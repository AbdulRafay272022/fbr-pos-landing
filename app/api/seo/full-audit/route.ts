/**
 * GET /api/seo/full-audit
 *
 * Master orchestrator endpoint — runs the full senior-SEO loop and
 * persists all data files. Designed to run weekly via cron.
 *
 * Each step is gracefully skipped if its env vars are absent.
 *
 * Returns a single SeoHealthReport object the dashboard renders.
 */

import { NextRequest, NextResponse } from "next/server";
import { runSeoOrchestrator } from "@/lib/agent/seo/orchestrator";
import {
  type RankingsData, EMPTY_RANKINGS,
} from "@/lib/agent/seo/rankTracker";
import { type CwvData, EMPTY_CWV } from "@/lib/agent/seo/lighthouse";
import { type SchemaAuditData, EMPTY_SCHEMA_AUDIT } from "@/lib/agent/seo/schemaValidator";
import { type BacklinkData, EMPTY_BACKLINKS } from "@/lib/agent/seo/backlinkMonitor";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";

interface BlogIndexEntry { slug: string; title: string; keywords?: string[] }
interface TrackedKeywordsFile { keywords: string[] }

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const gh = getGitHubConfig();
  if (!gh) return NextResponse.json({ success: false, reason: "GitHub env not set" }, { status: 500 });

  const config = getSiteConfig();

  // Load all state in parallel
  const [
    index, tracked,
    rankingsState, cwvState, schemaState, backlinksState,
  ] = await Promise.all([
    readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<TrackedKeywordsFile>("data/tracked-keywords.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<RankingsData>("data/rankings.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<CwvData>("data/cwv.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<SchemaAuditData>("data/schema-audit.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<BacklinkData>("data/backlinks.json", gh.token, gh.owner, gh.repo),
  ]);

  const blogIndex = index ?? [];
  const homepage  = config.baseUrl.replace(/\/$/, "");
  const topUrls   = [homepage, ...blogIndex.slice(0, 15).map((b) => `${homepage}/blog/${b.slug}`)];

  const ourDomain = config.baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const locationCode = process.env.RANK_TRACK_LOCATION ? parseInt(process.env.RANK_TRACK_LOCATION, 10) : undefined;

  let trackedKeywords = tracked?.keywords ?? [];
  if (trackedKeywords.length === 0) {
    const set = new Set<string>();
    for (const b of blogIndex) for (const kw of b.keywords ?? []) set.add(kw.toLowerCase().trim());
    trackedKeywords = Array.from(set).slice(0, 100);
  }

  const result = await runSeoOrchestrator({
    ourDomain,
    baseUrl:        config.baseUrl,
    blogIndex,
    trackedKeywords,
    topUrls,
    seedKeywords:   config.seedKeywords,
    locationCode,
    languageCode:   process.env.RANK_TRACK_LANGUAGE ?? "en",
    rankingsState:  rankingsState  ?? EMPTY_RANKINGS,
    cwvState:       cwvState       ?? EMPTY_CWV,
    schemaState:    schemaState    ?? EMPTY_SCHEMA_AUDIT,
    backlinksState: backlinksState ?? EMPTY_BACKLINKS,
    maxKeywordsToTrack: parseInt(process.env.RANK_TRACK_MAX_PER_RUN ?? "100", 10),
    maxUrlsToAudit:     parseInt(process.env.CWV_MAX_URLS ?? "10", 10),
  });

  // Persist all updated state in one atomic commit
  const filesToCommit: Array<{ path: string; content: string }> = [
    { path: "data/seo-report.json",  content: JSON.stringify(result.report,         null, 2) },
    { path: "data/rankings.json",    content: JSON.stringify(result.rankingsState,  null, 2) },
    { path: "data/cwv.json",         content: JSON.stringify(result.cwvState,       null, 2) },
    { path: "data/schema-audit.json",content: JSON.stringify(result.schemaState,    null, 2) },
    { path: "data/backlinks.json",   content: JSON.stringify(result.backlinksState, null, 2) },
  ];

  await atomicCommit(
    filesToCommit,
    `chore: seo full audit (${result.report.recommendations.length} recommendations)`,
    gh.token, gh.owner, gh.repo, gh.branch,
  );

  return NextResponse.json({ success: true, report: result.report });
}
