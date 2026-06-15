/**
 * GET /api/seo/check-cannibalization
 *
 * Detects keyword cannibalization across all blogs. Combines:
 *   - Title similarity clustering
 *   - Shared keyword detection
 *   - GSC: same query → multiple pages getting impressions
 *
 * Returns ordered list of clusters with recommended actions
 * (merge / differentiate / redirect).
 */

import { NextRequest, NextResponse } from "next/server";
import { detectCannibalization } from "@/lib/agent/seo/cannibalization";
import { fetchGscQueries } from "@/lib/agent/seo/gscQueries";
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

  const gh = getGitHubConfig();
  if (!gh) return NextResponse.json({ success: false, reason: "GitHub env not set" }, { status: 500 });

  const index = await readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", gh.token, gh.owner, gh.repo);
  if (!index) return NextResponse.json({ success: false, reason: "data/index.json missing" }, { status: 500 });

  // Optional GSC enrichment for the highest-confidence detection
  let gscQueries: { query: string; page: string; impressions: number; position: number }[] | undefined;
  const features = getSeoFeatures();
  if (features.gsc) {
    const gsc = await fetchGscQueries({
      clientEmail: process.env.GSC_CLIENT_EMAIL!,
      privateKey:  process.env.GSC_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      siteUrl:     process.env.GSC_SITE_URL!,
      days:        90,
      rowLimit:    10_000,
    });
    if (gsc.ok) {
      gscQueries = gsc.rows.map((r) => ({ query: r.query, page: r.page, impressions: r.impressions, position: r.position }));
    }
  }

  const clusters = detectCannibalization(index, { gscQueries });

  return NextResponse.json({
    success:           true,
    flagged:           clusters.length,
    gscEnriched:       !!gscQueries,
    clusters,
  });
}
