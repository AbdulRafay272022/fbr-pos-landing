/**
 * GET /api/generate-landing
 *
 * Money page generator — Phase 5.
 * Generates a single high-converting landing page and stores it at:
 *   data/landing-pages/{slug}.json   (full page object)
 *   data/landing-index.json          (index of all landing pages)
 *
 * Triggered by the agent brain via callAction(), or manually via curl/Postman.
 *
 * Auth: Bearer CRON_SECRET
 * Rate limit: 1 page per run; respects cost guard.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { LandingPage, LandingPagesData, CostData } from "@/lib/types";
import { readJsonFromGitHub, atomicCommit, fileExistsOnGitHub } from "@/lib/githubApi";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { defaultCostData } from "@/lib/agent/costGuard";
import {
  generateLandingPage,
  getNextLandingPageSpec,
  computeCanonicalSlug,
  type LandingPageSpec,
} from "@/lib/agent/landingGenerator";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts:    new Date().toISOString(),
    route: "generate-landing",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

// ─── Default data structures ──────────────────────────────────────────────────

function defaultLandingData(): LandingPagesData {
  return {
    pages:           [],
    totalPublished:  0,
    lastGeneratedAt: null,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("Authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Config & credentials ────────────────────────────────────────────────────
  const siteConfig = getSiteConfig();
  const gh         = getGitHubConfig();
  const groqApiKey = process.env.OPENROUTER_API_KEY ?? process.env.GROQ_API_KEY;

  if (!gh) {
    return NextResponse.json({ error: "GitHub not configured" }, { status: 500 });
  }
  if (!groqApiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
  }

  const { token, owner, repo } = gh;

  // ── Load existing state in parallel ─────────────────────────────────────────
  const [landingData, costsData] = await Promise.all([
    readJsonFromGitHub<LandingPagesData>("data/landing-index.json", token, owner, repo)
      .then((d) => d ?? defaultLandingData()),
    readJsonFromGitHub<CostData>("data/costs.json", token, owner, repo)
      .then((d) => d ?? defaultCostData()),
  ]);

  const existingSlugs = landingData.pages.map((p) => p.slug);

  // ── Determine what to generate ───────────────────────────────────────────────
  // Allow custom spec via query params for manual testing
  const url        = new URL(req.url);
  const forceKw    = url.searchParams.get("keyword");
  const forceCity  = url.searchParams.get("city");
  const forceInd   = url.searchParams.get("industry");
  const forceSvc   = url.searchParams.get("service");
  const forceType  = url.searchParams.get("type") as LandingPageSpec["pageType"] | null;

  let spec: LandingPageSpec | null;

  if (forceKw) {
    const canonicalSlug = computeCanonicalSlug(forceKw);
    spec = {
      pageType:       (forceType ?? "service") as LandingPageSpec["pageType"],
      targetKeyword:  forceKw,
      targetCity:     forceCity ?? undefined,
      targetIndustry: forceInd  ?? undefined,
      targetService:  forceSvc  ?? undefined,
      cluster:        "fbr-compliance",
      canonicalSlug,
    };
  } else {
    // Load blog index to enrich landing page with related blog links
    const blogIndex = await readJsonFromGitHub<
      Array<{ slug: string; title: string; cluster?: string; keywords?: string[] }>
    >("data/index.json", token, owner, repo).then((d) => d ?? []);

    spec = getNextLandingPageSpec(existingSlugs, siteConfig);

    if (spec && blogIndex.length > 0) {
      // Attach related blogs from the same cluster
      const related = blogIndex
        .filter((b) => b.cluster === spec!.cluster)
        .slice(0, 3);
      spec.relatedBlogSlugs  = related.map((b) => b.slug);
      spec.relatedBlogTitles = related.map((b) =>
        (b as unknown as { title?: string }).title ?? b.slug.replace(/-/g, " ")
      );
    }
  }

  if (!spec) {
    log("info", "No new landing pages to generate — all specs already exist");
    return NextResponse.json({
      success: true,
      message: "All landing pages already generated",
      totalPublished: landingData.totalPublished,
    });
  }

  log("info", "Generating landing page", { keyword: spec.targetKeyword, type: spec.pageType });

  // ── Generate ─────────────────────────────────────────────────────────────────
  const genResult = await generateLandingPage(spec, costsData, groqApiKey);

  if (!genResult.success || !genResult.page) {
    const reason = genResult.error ?? genResult.skippedReason ?? "unknown";
    log("warn", "Landing page generation failed", { reason });
    return NextResponse.json({
      success: false,
      error:   reason,
    }, { status: genResult.skippedReason ? 200 : 500 });
  }

  const page        = genResult.page;
  const updatedCosts = genResult.costs!;

  // ── Guard: canonical slug must not already exist on GitHub ──────────────────
  // If it exists, the spec was already generated (the index may be stale).
  // Do NOT append a timestamp suffix — that was the original bug causing 13 dupes.
  // Instead: skip cleanly. The agent will call getNextLandingPageSpec() again
  // next run and move to the next ungenerated spec.
  const pageFilePath  = `data/landing-pages/${page.slug}.json`;
  const alreadyExists = await fileExistsOnGitHub(pageFilePath, token, owner, repo);

  if (alreadyExists) {
    log("warn", "Landing page already exists on GitHub — skipping (index may be stale)", {
      slug:  page.slug,
      fix:   "next run will pick the next ungenerated spec",
    });
    return NextResponse.json({
      success: false,
      skipped: true,
      reason:  `Landing page "${page.slug}" already exists — moving to next spec next run`,
    });
  }

  // ── Update landing index ──────────────────────────────────────────────────────
  const updatedLandingData: LandingPagesData = {
    pages: [
      ...landingData.pages,
      {
        slug:        page.slug,
        title:       page.title,
        cluster:     page.cluster,
        pageType:    page.pageType,
        publishedAt: page.publishedAt,
      },
    ],
    totalPublished:  landingData.totalPublished + 1,
    lastGeneratedAt: new Date().toISOString(),
  };

  // ── Commit to GitHub ──────────────────────────────────────────────────────────
  const files = [
    {
      path:    `data/landing-pages/${page.slug}.json`,
      content: JSON.stringify(page, null, 2),
    },
    {
      path:    "data/landing-index.json",
      content: JSON.stringify(updatedLandingData, null, 2),
    },
    {
      path:    "data/costs.json",
      content: JSON.stringify(updatedCosts, null, 2),
    },
  ];

  try {
    await atomicCommit(
      files,
      `feat(landing): generate "${page.title}" [${page.pageType}]`,
      token,
      owner,
      repo,
      gh.branch
    );
  } catch (err) {
    log("error", "GitHub commit failed", { error: String(err) });
    return NextResponse.json({ success: false, error: "GitHub commit failed" }, { status: 500 });
  }

  // ── Revalidate sitemap + landing page route ────────────────────────────────
  try {
    revalidatePath("/sitemap.xml");
    revalidatePath(`/services/${page.slug}`);
  } catch {
    // Non-fatal
  }

  log("info", "Landing page generated and committed", {
    slug:     page.slug,
    pageType: page.pageType,
    title:    page.title,
  });

  return NextResponse.json({
    success:        true,
    slug:           page.slug,
    title:          page.title,
    pageType:       page.pageType,
    cluster:        page.cluster,
    totalPublished: updatedLandingData.totalPublished,
  });
}
