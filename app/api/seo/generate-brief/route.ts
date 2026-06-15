/**
 * GET /api/seo/generate-brief?keyword=...
 *
 * Generate a senior-SEO content brief for a keyword by:
 *   1. Fetching live SERP top-10
 *   2. Scraping each top URL for word count + headings
 *   3. Extracting common H2 structure
 *   4. Pulling People Also Ask
 *   5. Suggesting internal links from existing blog index
 *
 * Output is dropped directly into the blog generation prompt.
 *
 * Env required: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 */

import { NextRequest, NextResponse } from "next/server";
import { generateBrief, briefToPrompt } from "@/lib/agent/seo/briefGenerator";
import { getSeoFeatures } from "@/lib/agent/seo/features";
import { getGitHubConfig } from "@/lib/agent/siteConfig";
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
  if (!features.serpAnalysis) {
    return NextResponse.json({ success: false, skipped: true, reason: "DataForSEO not configured" });
  }

  const keyword = req.nextUrl.searchParams.get("keyword");
  if (!keyword) {
    return NextResponse.json({ success: false, error: "keyword query param required" }, { status: 400 });
  }

  const shallow = req.nextUrl.searchParams.get("shallow") === "true";
  const scrapeDepth = parseInt(req.nextUrl.searchParams.get("depth") ?? "5", 10);

  let blogIndex: BlogIndexEntry[] = [];
  const gh = getGitHubConfig();
  if (gh) {
    const idx = await readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", gh.token, gh.owner, gh.repo);
    if (idx) blogIndex = idx;
  }

  const result = await generateBrief({
    keyword,
    blogIndex,
    locationCode:  process.env.RANK_TRACK_LOCATION ? parseInt(process.env.RANK_TRACK_LOCATION, 10) : undefined,
    languageCode:  process.env.RANK_TRACK_LANGUAGE ?? "en",
    shallow,
    scrapeDepth,
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });

  return NextResponse.json({
    success:        true,
    brief:          result.brief,
    promptReady:    briefToPrompt(result.brief),
  });
}
