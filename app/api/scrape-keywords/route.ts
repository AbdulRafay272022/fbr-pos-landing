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
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import type { KeywordsData, Keyword } from "@/lib/types";
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
  const [existingData, blogIndex] = await Promise.all([
    readJsonFromGitHub<KeywordsData>("data/keywords.json", token, owner, repo),
    readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", token, owner, repo),
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

  // ── Generate new keywords (SiteConfig-aware) ─────────────────────────────
  let newKeywords: Keyword[];
  try {
    const config = getSiteConfig();
    newKeywords = generateKeywords(config, existingSet);
    log("info", "New keywords generated", { count: newKeywords.length, site: config.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Keyword generation failed", { error: message });
    return NextResponse.json({ success: false, reason: message }, { status: 500 });
  }

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
