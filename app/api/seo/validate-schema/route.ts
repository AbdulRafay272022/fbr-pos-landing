/**
 * GET /api/seo/validate-schema
 *
 * Crawls all blog URLs and validates their JSON-LD schema blocks.
 * Returns a structured report and persists results.
 *
 * Always available (no external API keys needed).
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSchemaBatch, type SchemaAuditData, EMPTY_SCHEMA_AUDIT } from "@/lib/agent/seo/schemaValidator";
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
    readJsonFromGitHub<SchemaAuditData>("data/schema-audit.json", gh.token, gh.owner, gh.repo),
  ]);

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
  const homepage = config.baseUrl.replace(/\/$/, "");
  const urls = [
    homepage,
    ...((index ?? []).slice(0, limit).map((b) => `${homepage}/blog/${b.slug}`)),
  ];

  const state = current ?? { ...EMPTY_SCHEMA_AUDIT };
  const result = await validateSchemaBatch(urls, state);

  await atomicCommit(
    [{ path: "data/schema-audit.json", content: JSON.stringify(result.data, null, 2) }],
    `chore: schema audit (${result.checked} checked, ${result.failed} with errors)`,
    gh.token, gh.owner, gh.repo, gh.branch,
  );

  // Aggregate report
  const totalErrors = Object.values(result.data.checks).reduce(
    (s, c) => s + c.issues.filter((i) => i.level === "error").length, 0);
  const totalWarnings = Object.values(result.data.checks).reduce(
    (s, c) => s + c.issues.filter((i) => i.level === "warning").length, 0);
  const failingUrls = Object.entries(result.data.checks)
    .filter(([, c]) => !c.passes)
    .map(([url, c]) => ({ url, issues: c.issues.length, errors: c.issues.filter((i) => i.level === "error").length }));

  return NextResponse.json({
    success:    true,
    checked:    result.checked,
    failed:     result.failed,
    totalErrors,
    totalWarnings,
    failingUrls,
  });
}
