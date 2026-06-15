/**
 * GET /api/seo/check-backlinks
 *
 * Captures a backlink snapshot via DataForSEO. Run weekly.
 *
 * Env required: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 */

import { NextRequest, NextResponse } from "next/server";
import { captureBacklinkSnapshot, summarizeBacklinks, type BacklinkData, EMPTY_BACKLINKS } from "@/lib/agent/seo/backlinkMonitor";
import { getSeoFeatures } from "@/lib/agent/seo/features";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";

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
  if (!features.backlinks) {
    return NextResponse.json({ success: false, skipped: true, reason: "DataForSEO not configured" });
  }

  const gh = getGitHubConfig();
  if (!gh) return NextResponse.json({ success: false, reason: "GitHub env not set" }, { status: 500 });

  const config = getSiteConfig();
  const target = config.baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const current = await readJsonFromGitHub<BacklinkData>("data/backlinks.json", gh.token, gh.owner, gh.repo)
    ?? { ...EMPTY_BACKLINKS };

  const result = await captureBacklinkSnapshot(target, current);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });

  await atomicCommit(
    [{ path: "data/backlinks.json", content: JSON.stringify(result.data, null, 2) }],
    `chore: backlink snapshot (${result.snapshot.totalBacklinks} links, $${result.cost.toFixed(4)})`,
    gh.token, gh.owner, gh.repo, gh.branch,
  );

  return NextResponse.json({
    success:  true,
    snapshot: result.snapshot,
    summary:  summarizeBacklinks(result.data),
    cost:     result.cost,
  });
}
