/**
 * GET /api/seo/find-gaps
 *
 * Finds content gaps vs competitors. Returns suggested keyword targets
 * that competitors rank for but we don't have content covering.
 *
 * Env required: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 */

import { NextRequest, NextResponse } from "next/server";
import { findContentGaps } from "@/lib/agent/seo/contentGap";
import { getSeoFeatures } from "@/lib/agent/seo/features";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { readJsonFromGitHub } from "@/lib/githubApi";

interface BlogIndexEntry { slug: string; title: string; keywords?: string[] }

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("Unauthorized: CRON_SECRET not configured", { status: 503 });
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const features = getSeoFeatures();
  if (!features.contentGaps) {
    return NextResponse.json({ success: false, skipped: true, reason: "DataForSEO not configured" });
  }

  const gh = getGitHubConfig();
  if (!gh) return NextResponse.json({ success: false, reason: "GitHub env not set" }, { status: 500 });

  const config = getSiteConfig();
  const index = await readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", gh.token, gh.owner, gh.repo);
  if (!index) {
    return NextResponse.json({ success: false, reason: "data/index.json missing" }, { status: 500 });
  }

  const seedFromQuery = req.nextUrl.searchParams.get("seeds");
  const seeds = seedFromQuery
    ? seedFromQuery.split(",").map((s) => s.trim()).filter(Boolean)
    : config.seedKeywords.slice(0, 5);

  const ourDomain = config.baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const locationCode = process.env.RANK_TRACK_LOCATION ? parseInt(process.env.RANK_TRACK_LOCATION, 10) : undefined;

  const result = await findContentGaps({
    seedKeywords:  seeds,
    ourDomain,
    ourContent:    index,
    locationCode,
    languageCode:  process.env.RANK_TRACK_LANGUAGE ?? "en",
    perKeyword:    5,
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });

  return NextResponse.json({
    success:    true,
    seeds,
    totalGaps:  result.gaps.length,
    cost:       result.cost,
    gaps:       result.gaps,
  });
}
