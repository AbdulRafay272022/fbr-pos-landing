/**
 * GET /api/distribute?slug=<slug>
 *
 * Distribution endpoint — called after a blog is published.
 * Posts to Twitter and LinkedIn, records signals, fires webhook.
 *
 * Called by:
 *   - generate-blog/route.ts (fire-and-forget after commit)
 *   - agentBrain (shouldDistribute decision for undistributed posts)
 *
 * Flow:
 *   1. Auth check
 *   2. Load blog from data/blogs/<slug>.json
 *   3. Check it hasn't already been distributed (distribution.json)
 *   4. Generate social posts via distribution.ts
 *   5. Post to Twitter + LinkedIn in parallel
 *   6. Record in data/distribution.json + data/signals.json
 *   7. Fire webhook if SIGNAL_WEBHOOK_URL configured
 *   8. Atomic commit (distribution.json + signals.json)
 */

import { NextRequest, NextResponse } from "next/server";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { distributeBlog }               from "@/lib/agent/distribution";
import {
  defaultSignalData,
  recordDistributionSignals,
  notifyBlogPublished,
} from "@/lib/agent/backlinkSignal";
import { getSiteConfig }                from "@/lib/agent/siteConfig";
import type { BlogPost, DistributionData, DistributionRecord } from "@/lib/types";
import type { SignalData } from "@/lib/agent/backlinkSignal";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = { ts: new Date().toISOString(), route: "distribute", level, message, ...(data ? { data } : {}) };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// ─── Default DistributionData ─────────────────────────────────────────────────

function defaultDistributionData(): DistributionData {
  return { records: [], lastDistributedAt: null, totalDistributed: 0 };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("Unauthorized: CRON_SECRET not configured", { status: 503 });
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized distribute attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug query param required" }, { status: 400 });
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    return NextResponse.json({ success: false, reason: "GitHub env vars not set" }, { status: 500 });
  }

  const config = getSiteConfig();
  log("info", "Distribution started", { slug });

  // ── Load blog + existing distribution data ─────────────────────────────────
  const [blog, distData, signalData] = await Promise.all([
    readJsonFromGitHub<BlogPost>(`data/blogs/${slug}.json`, token, owner, repo),
    readJsonFromGitHub<DistributionData>("data/distribution.json", token, owner, repo),
    readJsonFromGitHub<SignalData>("data/signals.json", token, owner, repo),
  ]);

  if (!blog) {
    log("warn", "Blog not found", { slug });
    return NextResponse.json({ success: false, reason: "blog_not_found" }, { status: 404 });
  }

  const dist    = distData    ?? defaultDistributionData();
  const signals = signalData  ?? defaultSignalData();

  // ── Check if already distributed ──────────────────────────────────────────
  const alreadyDistributed = dist.records.some((r) => r.slug === slug);
  if (alreadyDistributed) {
    log("info", "Already distributed — skipping", { slug });
    return NextResponse.json({ success: true, skipped: true, reason: "already_distributed" });
  }

  // ── Post to social platforms ───────────────────────────────────────────────
  const hookIndex = dist.totalDistributed % 5; // cycle through hook variants
  const result    = await distributeBlog(
    {
      slug:            blog.slug,
      title:           blog.title,
      metaDescription: blog.metaDescription,
      keywords:        blog.keywords,
    },
    config.baseUrl,
    hookIndex
  );

  log("info", "Distribution result", {
    slug,
    twitter:  result.twitter?.success,
    linkedin: result.linkedin?.success,
    anySuccess: result.anySuccess,
  });

  // ── Build distribution record ──────────────────────────────────────────────
  const posts = [
    ...(result.twitter  ? [result.twitter]  : []),
    ...(result.linkedin ? [result.linkedin] : []),
  ];

  const record: DistributionRecord = {
    slug,
    title:         blog.title,
    blogUrl:       `${config.baseUrl.replace(/\/$/, "")}/blog/${slug}`,
    hook:          blog.title, // simplified; full hook is in the post text
    posts,
    distributedAt: new Date().toISOString(),
  };

  // ── Update distribution data ───────────────────────────────────────────────
  const updatedDist: DistributionData = {
    records:           [...dist.records, record],
    lastDistributedAt: new Date().toISOString(),
    totalDistributed:  dist.totalDistributed + (result.anySuccess ? 1 : 0),
  };

  // Keep last 200 records
  if (updatedDist.records.length > 200) {
    updatedDist.records = updatedDist.records.slice(-200);
  }

  // ── Record signals ─────────────────────────────────────────────────────────
  const updatedSignals = recordDistributionSignals(signals, slug, posts);

  // ── Fire webhook (non-blocking) ────────────────────────────────────────────
  notifyBlogPublished(
    slug,
    blog.title,
    `${config.baseUrl.replace(/\/$/, "")}/blog/${slug}`,
    config.baseUrl
  ).catch(() => { /* non-fatal */ });

  // ── Atomic commit ──────────────────────────────────────────────────────────
  try {
    await atomicCommit(
      [
        { path: "data/distribution.json", content: JSON.stringify(updatedDist,    null, 2) },
        { path: "data/signals.json",      content: JSON.stringify(updatedSignals, null, 2) },
      ],
      `chore: distribute "${blog.title}" to social media`,
      token, owner, repo, branch
    );

    return NextResponse.json({
      success:  true,
      slug,
      twitter:  result.twitter,
      linkedin: result.linkedin,
      anySuccess: result.anySuccess,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Commit failed", { error: message });
    return NextResponse.json({ success: false, reason: message }, { status: 500 });
  }
}
