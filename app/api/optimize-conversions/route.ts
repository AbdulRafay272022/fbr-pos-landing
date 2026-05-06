/**
 * GET /api/optimize-conversions
 *
 * Conversion optimizer — Phase 5.
 * Reads SEO + conversion + engagement data, identifies underperforming pages,
 * rewrites their CTA HTML, and commits updated blog files.
 *
 * Auth: Bearer CRON_SECRET
 * Rate limit: max 3 pages per run
 */

import { NextRequest, NextResponse } from "next/server";
import type { SeoData, ConversionData, EngagementData, CostData } from "@/lib/types";
import type { BlogPost } from "@/lib/blogStore";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { defaultCostData, isUnderBudget, recordUsage } from "@/lib/agent/costGuard";
import {
  detectOptimizationCandidates,
  applyOptimizedCTA,
} from "@/lib/agent/conversionOptimizer";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts:    new Date().toISOString(),
    route: "optimize-conversions",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("Authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteConfig = getSiteConfig();
  const gh         = getGitHubConfig();
  if (!gh) return NextResponse.json({ error: "GitHub not configured" }, { status: 500 });

  const { token, owner, repo } = gh;

  // ── Load data in parallel ────────────────────────────────────────────────────
  const [seoData, convData, engData, costsData] = await Promise.all([
    readJsonFromGitHub<SeoData>("data/seo.json", token, owner, repo),
    readJsonFromGitHub<ConversionData>("data/conversions.json", token, owner, repo),
    readJsonFromGitHub<EngagementData>("data/engagement.json", token, owner, repo),
    readJsonFromGitHub<CostData>("data/costs.json", token, owner, repo)
      .then((d) => d ?? defaultCostData()),
  ]);

  if (!seoData || seoData.pages.length === 0) {
    log("info", "No SEO data available — skipping conversion optimization");
    return NextResponse.json({ success: true, optimizedCount: 0, reason: "no SEO data" });
  }

  if (!isUnderBudget(costsData)) {
    return NextResponse.json({ success: true, optimizedCount: 0, reason: "budget exceeded" });
  }

  // ── Detect candidates ────────────────────────────────────────────────────────
  const candidates = detectOptimizationCandidates(
    seoData,
    convData ?? { events: [], summary: { totalClicks: 0, totalFormSubmits: 0, totalWhatsAppClicks: 0, bySlug: {} }, lastTrimmedAt: null },
    engData,
    3 // max candidates per run
  );

  if (candidates.length === 0) {
    log("info", "No conversion optimization candidates found");
    return NextResponse.json({ success: true, optimizedCount: 0, reason: "no candidates" });
  }

  log("info", `Found ${candidates.length} conversion optimization candidates`, {
    slugs: candidates.map((c) => c.slug),
  });

  // ── Load + update blog files ──────────────────────────────────────────────────
  const filesToCommit: Array<{ path: string; content: string }> = [];
  const optimizedSlugs: string[] = [];
  let updatedCosts = costsData;

  for (const candidate of candidates) {
    // Load the blog content
    let blog: BlogPost | null = null;
    try {
      blog = await readJsonFromGitHub<BlogPost>(
        `data/blogs/${candidate.slug}.json`, token, owner, repo
      );
    } catch {
      log("warn", `Could not read blog for slug: ${candidate.slug}`);
      continue;
    }

    if (!blog) continue;

    // Apply optimized CTA
    const optimizedContent = applyOptimizedCTA(blog.content, candidate, siteConfig);
    if (optimizedContent === blog.content) {
      log("info", "No CTA changes needed", { slug: candidate.slug });
      continue;
    }

    const updatedBlog: BlogPost = {
      ...blog,
      content:     optimizedContent,
      lastUpdated: new Date().toISOString(),
      version:     (blog.version ?? 1) + 1,
    };

    filesToCommit.push({
      path:    `data/blogs/${candidate.slug}.json`,
      content: JSON.stringify(updatedBlog, null, 2),
    });

    optimizedSlugs.push(candidate.slug);

    // Record a tiny cost entry (no Groq call — pure HTML rewrite)
    updatedCosts = recordUsage(updatedCosts, {
      action:           "optimize_conversion",
      slug:             candidate.slug,
      model:            "none",
      promptTokens:     0,
      completionTokens: 0,
      totalTokens:      0,
    });
  }

  if (filesToCommit.length === 0) {
    return NextResponse.json({ success: true, optimizedCount: 0, reason: "no changes needed" });
  }

  // Add costs file to commit
  filesToCommit.push({
    path:    "data/costs.json",
    content: JSON.stringify(updatedCosts, null, 2),
  });

  // ── Commit ───────────────────────────────────────────────────────────────────
  try {
    await atomicCommit(
      filesToCommit,
      `perf(cta): optimize conversions for ${optimizedSlugs.join(", ")}`,
      token, owner, repo, gh.branch
    );
  } catch (err) {
    log("error", "GitHub commit failed", { error: String(err) });
    return NextResponse.json({ success: false, error: "commit failed" }, { status: 500 });
  }

  log("info", "Conversion optimization complete", { optimizedSlugs });

  return NextResponse.json({
    success:        true,
    optimizedCount: optimizedSlugs.length,
    slugs:          optimizedSlugs,
  });
}
