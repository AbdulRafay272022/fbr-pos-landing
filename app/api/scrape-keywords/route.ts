/**
 * GET /api/scrape-keywords
 *
 * Keyword Discovery Engine — runs weekly via Vercel Cron.
 *
 * Flow:
 *  1. Auth check (CRON_SECRET Bearer token)
 *  2. Read existing keywords.json + index.json from GitHub
 *  3. Generate new keywords algorithmically (combinatorial expansion)
 *  4. Deduplicate, score, sort by priority
 *  5. Atomic GitHub commit → data/keywords.json
 *
 * No external APIs required — purely algorithmic expansion.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateKeywords } from "@/lib/keywordEngine";
import { discoverKeywordsFromMarket, generateSeedsFromNiche } from "@/lib/agent/keywordDiscovery";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import type { KeywordsData, Keyword, SeoData } from "@/lib/types";
import type { NicheConfig } from "@/lib/agent/keywordDiscovery";
import { getSiteConfig } from "@/lib/agent/siteConfig";

type BlogIndexEntry = { slug: string; title: string; keywords: string[] };

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts: new Date().toISOString(),
    route: "scrape-keywords",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("Unauthorized: CRON_SECRET not configured", { status: 503 });
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized scrape-keywords attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    log("error", "Missing GitHub env vars");
    return NextResponse.json({ success: false, reason: "GitHub env vars not set" }, { status: 500 });
  }

  log("info", "Keyword scraping started");

  // ── Read current state from GitHub ────────────────────────────────────────
  const [existingData, blogIndex, nicheConfigData, seoData] = await Promise.all([
    readJsonFromGitHub<KeywordsData>("data/keywords.json", token, owner, repo),
    readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", token, owner, repo),
    readJsonFromGitHub<NicheConfig>("data/niche-config.json", token, owner, repo),
    readJsonFromGitHub<SeoData>("data/seo.json", token, owner, repo),
  ]);

  const existing: KeywordsData = existingData ?? {
    keywords: [],
    lastScraped: null,
    totalGenerated: 0,
  };

  // Build lookup sets for deduplication
  const existingSet = new Set<string>(
    existing.keywords.map((k) => k.keyword.toLowerCase().trim())
  );

  const blogSlugs = (blogIndex ?? []).map((b) => b.slug);

  // Also include keywords already used in published blog posts
  if (blogIndex) {
    for (const blog of blogIndex) {
      for (const kw of blog.keywords ?? []) {
        existingSet.add(kw.toLowerCase().trim());
      }
    }
  }

  log("info", "Existing keywords loaded", {
    known: existingSet.size,
    previousPool: existing.keywords.length,
  });

  const config = getSiteConfig();

  // ── If niche-config.json exists, update seed keywords from AI ────────────
  if (nicheConfigData && nicheConfigData.niche) {
    try {
      const aiSeeds = await generateSeedsFromNiche(
        nicheConfigData.niche,
        nicheConfigData.country ?? config.country
      );
      // Merge AI seeds with existing config seeds
      config.seedKeywords = [...new Set([...aiSeeds, ...config.seedKeywords])].slice(0, 30);
      log("info", "AI seeds generated from niche config", {
        niche: nicheConfigData.niche,
        seeds: aiSeeds.length,
      });
    } catch (err) {
      log("warn", "AI seed generation failed, using config seeds", { error: String(err) });
    }
  }

  // ── Phase 1: Real market discovery (Google Autocomplete + Serper PAA + GSC)
  let marketKeywords: Keyword[] = [];
  try {
    const discovery = await discoverKeywordsFromMarket(
      config,
      seoData ?? undefined,
      blogSlugs,
      10  // expand top 10 seeds via market APIs
    );

    log("info", "Market discovery complete", discovery.stats);

    const now = new Date().toISOString();
    marketKeywords = discovery.keywords
      .filter((k) => !existingSet.has(k.keyword.toLowerCase().trim()))
      .map((k) => {
        const norm = k.keyword.toLowerCase().trim();
        existingSet.add(norm);
        return {
          keyword:     k.keyword,
          intent:      k.source === "paa" ? "informational" as const : "informational" as const,
          difficulty:  k.keyword.split(" ").length >= 5 ? "low" as const : "medium" as const,
          priority:    k.source === "paa" ? 85 : k.source === "gsc" ? 90 : 75,
          cluster:     `market-${k.source}`,
          used:        false,
          usedIn:      null,
          generatedAt: now,
        };
      });

    log("info", "Market keywords added to pool", { count: marketKeywords.length });
  } catch (err) {
    log("warn", "Market discovery failed, using combinatorial only", { error: String(err) });
  }

  // ── Phase 2: Combinatorial expansion (always runs as backup/supplement) ──
  let newKeywords: Keyword[];
  try {
    newKeywords = generateKeywords(config, existingSet);
    log("info", "Combinatorial keywords generated", { count: newKeywords.length, site: config.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Keyword generation failed", { error: message });
    return NextResponse.json({ success: false, reason: message }, { status: 500 });
  }

  // Merge: market-discovered (higher priority) + combinatorial
  newKeywords = [...marketKeywords, ...newKeywords];

  // ── Merge: preserve existing (with used/usedIn intact) + append new ───────
  const merged: Keyword[] = [
    ...existing.keywords,
    ...newKeywords.filter(
      (k) => !existingSet.has(k.keyword.toLowerCase().trim())
    ),
  ];

  // Sort: unused first, then by descending priority
  merged.sort((a, b) => {
    if (a.used !== b.used) return a.used ? 1 : -1;
    return b.priority - a.priority;
  });

  const unusedCount = merged.filter((k) => !k.used).length;

  const updatedData: KeywordsData = {
    keywords: merged,
    lastScraped: new Date().toISOString(),
    totalGenerated: merged.length,
  };

  // ── Commit to GitHub ──────────────────────────────────────────────────────
  try {
    await atomicCommit(
      [{ path: "data/keywords.json", content: JSON.stringify(updatedData, null, 2) }],
      `chore: refresh keyword pool (+${newKeywords.length} new, ${unusedCount} unused total)`,
      token, owner, repo, branch
    );

    log("info", "Keywords committed to GitHub", {
      total: merged.length,
      newAdded: newKeywords.length,
      unused: unusedCount,
    });

    return NextResponse.json({
      success: true,
      totalKeywords: merged.length,
      newKeywords: newKeywords.length,
      unusedKeywords: unusedCount,
      lastScraped: updatedData.lastScraped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Failed to commit keywords to GitHub", { error: message });
    return NextResponse.json({ success: false, reason: message }, { status: 500 });
  }
}
