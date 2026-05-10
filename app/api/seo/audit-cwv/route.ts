/**
 * GET /api/seo/audit-cwv
 *
 * Runs PageSpeed Insights audits on all blog URLs (or a subset if
 * ?limit=N) and stores time-series CWV data.
 *
 * Env optional: PAGESPEED_API_KEY (raises rate limit)
 */

import { NextRequest, NextResponse } from "next/server";
import { auditBatch, summarizeCwv, type CwvData, EMPTY_CWV } from "@/lib/agent/seo/lighthouse";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";

interface BlogIndexEntry { slug: string }

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const gh = getGitHubConfig();
  if (!gh) {
    return NextResponse.json({ success: false, reason: "GitHub env not set" }, { status: 500 });
  }

  const config = getSiteConfig();

  const [index, current] = await Promise.all([
    readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", gh.token, gh.owner, gh.repo),
    readJsonFromGitHub<CwvData>("data/cwv.json", gh.token, gh.owner, gh.repo),
  ]);

  const limit    = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);
  const strategy = (req.nextUrl.searchParams.get("strategy") as "mobile" | "desktop") ?? "mobile";

  const homepage = config.baseUrl.replace(/\/$/, "");
  const blogUrls = (index ?? []).slice(0, limit).map((b) => `${homepage}/blog/${b.slug}`);
  const urls = [homepage, ...blogUrls];

  const state = current ?? { ...EMPTY_CWV };

  const result = await auditBatch({ urls, strategy, throttleMs: 1100 }, state);

  await atomicCommit(
    [{ path: "data/cwv.json", content: JSON.stringify(result.data, null, 2) }],
    `chore: CWV audit (${result.audited} pages, ${result.failed} errors)`,
    gh.token, gh.owner, gh.repo, gh.branch,
  );

  return NextResponse.json({
    success:  true,
    audited:  result.audited,
    failed:   result.failed,
    summary:  summarizeCwv(result.data),
  });
}
