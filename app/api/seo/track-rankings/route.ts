/**
 * GET /api/seo/track-rankings
 *
 * Daily rank tracking via DataForSEO. Idempotent — only adds today's
 * snapshot once per day. Reads keywords from data/tracked-keywords.json
 * (or falls back to all blog keywords).
 *
 * Env required:
 *   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 * Env optional:
 *   CRON_SECRET, RANK_TRACK_LOCATION (numeric DataForSEO location code)
 */

import { NextRequest, NextResponse } from "next/server";
import { trackKeywords, type RankingsData, EMPTY_RANKINGS } from "@/lib/agent/seo/rankTracker";
import { getSeoFeatures } from "@/lib/agent/seo/features";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";

interface TrackedKeywordsFile { keywords: string[] }
interface BlogIndexEntry      { slug: string; keywords?: string[] }

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const features = getSeoFeatures();
  if (!features.rankTracking) {
    return NextResponse.json({
      success: false,
      skipped: true,
      reason:  "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set",
    });
  }

  const gh = getGitHubConfig();
  if (!gh) {
    return NextResponse.json({ success: false, reason: "GitHub env not set" }, { status: 500 });
  }

  const config = getSiteConfig();

  // 1. Load existing rankings + tracked keywords list
  const [existing, tracked, index] = await Promise.all([
    readJsonFromGitHub<RankingsData>("data/rankings.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<TrackedKeywordsFile>("data/tracked-keywords.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", gh.token, gh.owner, gh.repo),
  ]);

  const current = existing ?? { ...EMPTY_RANKINGS };

  // 2. Determine which keywords to track
  let keywords: string[] = tracked?.keywords ?? [];
  if (keywords.length === 0 && index) {
    const set = new Set<string>();
    for (const b of index) {
      for (const kw of b.keywords ?? []) set.add(kw.toLowerCase().trim());
    }
    keywords = Array.from(set);
  }
  if (keywords.length === 0) {
    return NextResponse.json({
      success: false,
      reason:  "No tracked keywords found (data/tracked-keywords.json missing and no blog keywords)",
    });
  }

  // 3. Track
  const ourDomain = config.baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const locationCode = process.env.RANK_TRACK_LOCATION
    ? parseInt(process.env.RANK_TRACK_LOCATION, 10)
    : undefined;

  const result = await trackKeywords({
    keywords,
    ourDomain,
    locationCode,
    languageCode: process.env.RANK_TRACK_LANGUAGE ?? "en",
    maxPerRun:    parseInt(process.env.RANK_TRACK_MAX_PER_RUN ?? "200", 10),
  }, current);

  // 4. Persist
  await atomicCommit(
    [{ path: "data/rankings.json", content: JSON.stringify(result.data, null, 2) }],
    `chore: rank-tracking snapshot (${result.tracked} kw, $${result.totalCost.toFixed(4)})`,
    gh.token, gh.owner, gh.repo, gh.branch,
  );

  return NextResponse.json({
    success:  true,
    tracked:  result.tracked,
    failed:   result.failed,
    newWins:  result.newWins,
    newDrops: result.newDrops,
    cost:     result.totalCost,
  });
}
