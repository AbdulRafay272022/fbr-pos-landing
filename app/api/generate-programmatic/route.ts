/**
 * GET /api/generate-programmatic
 *
 * Programmatic SEO page generator — Phase 5.
 * Generates city × service × industry pages stored at:
 *   data/programmatic/{slug}.json       (full page)
 *   data/programmatic-index.json        (index)
 *
 * Auth: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { ProgrammaticPage, ProgrammaticPagesData, CostData } from "@/lib/types";
import { readJsonFromGitHub, atomicCommit, fileExistsOnGitHub } from "@/lib/githubApi";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";
import { defaultCostData } from "@/lib/agent/costGuard";
import {
  generateProgrammaticPage,
  getNextProgrammaticCombination,
  buildProgSlug,
} from "@/lib/agent/programmaticGenerator";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts:    new Date().toISOString(),
    route: "generate-programmatic",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

function defaultProgData(): ProgrammaticPagesData {
  return { pages: [], totalPublished: 0, lastGeneratedAt: null };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("Authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteConfig = getSiteConfig();
  const gh         = getGitHubConfig();
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!gh)         return NextResponse.json({ error: "GitHub not configured" }, { status: 500 });
  if (!groqApiKey) return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 500 });

  const { token, owner, repo } = gh;

  // ── Load existing state ──────────────────────────────────────────────────────
  const [progData, costsData] = await Promise.all([
    readJsonFromGitHub<ProgrammaticPagesData>("data/programmatic-index.json", token, owner, repo)
      .then((d) => d ?? defaultProgData()),
    readJsonFromGitHub<CostData>("data/costs.json", token, owner, repo)
      .then((d) => d ?? defaultCostData()),
  ]);

  const existingSlugs = progData.pages.map((p) => p.slug);

  // ── Determine combination ────────────────────────────────────────────────────
  const url        = new URL(req.url);
  const forceCity  = url.searchParams.get("city");
  const forceSvc   = url.searchParams.get("service");
  const forceInd   = url.searchParams.get("industry");

  let city: string, service: string, industry: string;

  if (forceCity && forceSvc && forceInd) {
    city = forceCity; service = forceSvc; industry = forceInd;
  } else {
    const next = getNextProgrammaticCombination(existingSlugs, siteConfig);
    if (!next) {
      log("info", "All programmatic combinations already generated");
      return NextResponse.json({
        success:        true,
        message:        "All programmatic pages generated",
        totalPublished: progData.totalPublished,
      });
    }
    city = next.city; service = next.service; industry = next.industry;
  }

  const slug = buildProgSlug(city, service, industry);

  // ── Skip if already exists ───────────────────────────────────────────────────
  if (existingSlugs.includes(slug)) {
    const exists = await fileExistsOnGitHub(`data/programmatic/${slug}.json`, token, owner, repo);
    if (exists) {
      log("info", "Programmatic page already exists — skipping", { slug });
      return NextResponse.json({ success: true, skipped: true, slug });
    }
  }

  log("info", "Generating programmatic page", { city, service, industry, slug });

  // ── Generate ─────────────────────────────────────────────────────────────────
  const genResult = await generateProgrammaticPage(city, service, industry, costsData, groqApiKey);

  if (!genResult.success || !genResult.page) {
    const reason = genResult.error ?? genResult.skippedReason ?? "unknown";
    log("warn", "Programmatic page generation failed", { reason });
    return NextResponse.json(
      { success: false, error: reason },
      { status: genResult.skippedReason ? 200 : 500 }
    );
  }

  const page         = genResult.page;
  const updatedCosts = genResult.costs!;

  // ── Update index ─────────────────────────────────────────────────────────────
  const updatedProgData: ProgrammaticPagesData = {
    pages: [
      ...progData.pages,
      { slug: page.slug, city, service, industry, publishedAt: page.publishedAt },
    ],
    totalPublished:  progData.totalPublished + 1,
    lastGeneratedAt: new Date().toISOString(),
  };

  // ── Commit ───────────────────────────────────────────────────────────────────
  const files = [
    {
      path:    `data/programmatic/${page.slug}.json`,
      content: JSON.stringify(page, null, 2),
    },
    {
      path:    "data/programmatic-index.json",
      content: JSON.stringify(updatedProgData, null, 2),
    },
    {
      path:    "data/costs.json",
      content: JSON.stringify(updatedCosts, null, 2),
    },
  ];

  try {
    await atomicCommit(
      files,
      `feat(programmatic): ${service} for ${industry} in ${city}`,
      token, owner, repo, gh.branch
    );
  } catch (err) {
    log("error", "GitHub commit failed", { error: String(err) });
    return NextResponse.json({ success: false, error: "GitHub commit failed" }, { status: 500 });
  }

  // ── Revalidate ───────────────────────────────────────────────────────────────
  try {
    revalidatePath("/sitemap.xml");
    revalidatePath(`/locations/${page.slug}`);
  } catch { /* non-fatal */ }

  log("info", "Programmatic page committed", { slug: page.slug, city, service, industry });

  return NextResponse.json({
    success:        true,
    slug:           page.slug,
    city,
    service,
    industry,
    totalPublished: updatedProgData.totalPublished,
  });
}
