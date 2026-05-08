/**
 * GET /api/optimize-titles
 *
 * Title Optimisation Engine — triggered by agentBrain when
 * shouldOptimizeTitles decision is true.
 *
 * Targets high-authority blogs whose current title scores below a threshold.
 * Generates 5 variants via Groq (or deterministic fallback), selects the
 * highest-scoring winner, and updates the blog + index in one atomic commit.
 *
 * Flow:
 *  1. Auth check
 *  2. Read index.json + costs.json
 *  3. Cost guard check
 *  4. Score existing titles; pick bottom MAX_OPTIMIZE_PER_RUN
 *  5. Generate variants (Groq / fallback)
 *  6. If winner scores > current title → update blog + index
 *  7. Atomic commit + ISR revalidate
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { optimizeTitle, scoreTitleVariant } from "@/lib/agent/titleOptimizer";
import { isUnderBudget, recordUsage, defaultCostData } from "@/lib/agent/costGuard";
import { getSiteConfig } from "@/lib/agent/siteConfig";
import type { BlogPost, CostData } from "@/lib/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_OPTIMIZE_PER_RUN = 3;
/** Only replace a title if the new score is this many points higher */
const MIN_SCORE_IMPROVEMENT = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogIndex = Omit<BlogPost, "content">;

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts:    new Date().toISOString(),
    route: "optimize-titles",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized optimize-titles attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    return NextResponse.json({ success: false, reason: "GitHub env vars not set" }, { status: 500 });
  }

  const config   = getSiteConfig();
  const groqKey  = process.env.GROQ_API_KEY;

  log("info", "Title optimisation started", { site: config.name });

  // ── Read state ─────────────────────────────────────────────────────────────
  const [blogIndex, costsData] = await Promise.all([
    readJsonFromGitHub<BlogIndex[]>("data/index.json", token, owner, repo),
    readJsonFromGitHub<CostData>("data/costs.json", token, owner, repo),
  ]);

  if (!blogIndex || blogIndex.length === 0) {
    return NextResponse.json({ success: true, optimizedCount: 0, reason: "no_blogs" });
  }

  const costs = costsData ?? defaultCostData();

  if (!isUnderBudget(costs)) {
    log("warn", "Token budget exceeded — skipping title optimization");
    return NextResponse.json({ success: false, reason: "budget_exceeded" }, { status: 429 });
  }

  // ── Select candidates: lowest-scoring titles (skip pinned blogs) ──────────
  const scored = blogIndex
    .filter((b) => !(b as unknown as Record<string, unknown>).pinnedTitle) // never touch pinned titles
    .map((b) => ({
      blog:  b,
      score: scoreTitleVariant(b.title, b.keywords[0] ?? b.title).ctrScore,
    }))
    .sort((a, b) => a.score - b.score) // ascending: lowest CTR score first
    .slice(0, MAX_OPTIMIZE_PER_RUN);

  log("info", "Title candidates selected", {
    count:       scored.length,
    titles:      scored.map((s) => ({ slug: s.blog.slug, score: s.score })),
  });

  const updatedIndex = [...blogIndex];
  const commitFiles: { path: string; content: string }[] = [];
  let   updatedCosts = { ...costs };
  let   optimizedCount = 0;

  for (const { blog, score: currentScore } of scored) {
    try {
      const result = await optimizeTitle({
        blog:       { slug: blog.slug, title: blog.title, keywords: blog.keywords },
        niche:      config.niche,
        groqApiKey: groqKey,
      });

      const { winner } = result;

      // Only apply if there's a meaningful improvement
      if (winner.ctrScore <= currentScore + MIN_SCORE_IMPROVEMENT) {
        log("info", "No improvement found for title", {
          slug:         blog.slug,
          currentScore,
          bestScore:    winner.ctrScore,
        });
        continue;
      }

      log("info", "Title winner selected", {
        slug:         blog.slug,
        oldTitle:     blog.title,
        newTitle:     winner.title,
        oldScore:     currentScore,
        newScore:     winner.ctrScore,
        signals:      winner.signals,
      });

      // ── Load full blog to update content ─────────────────────────────────
      const fullBlog = await readJsonFromGitHub<BlogPost>(
        `data/blogs/${blog.slug}.json`, token, owner, repo
      );

      if (!fullBlog) {
        log("warn", "Full blog not found", { slug: blog.slug });
        continue;
      }

      const updatedBlog: BlogPost = {
        ...fullBlog,
        title:       winner.title,
        lastUpdated: new Date().toISOString(),
        version:     (fullBlog.version ?? 1) + 1,
      };

      commitFiles.push({
        path:    `data/blogs/${blog.slug}.json`,
        content: JSON.stringify(updatedBlog, null, 2),
      });

      // Update index
      const idxI = updatedIndex.findIndex((b) => b.slug === blog.slug);
      if (idxI !== -1) {
        updatedIndex[idxI] = {
          ...updatedIndex[idxI],
          title:       winner.title,
          lastUpdated: updatedBlog.lastUpdated,
          version:     updatedBlog.version,
        };
      }

      // Record token usage (title gen is lightweight)
      updatedCosts = recordUsage(updatedCosts, {
        action:           "title_optimize",
        slug:             blog.slug,
        model:            groqKey ? "llama-3.3-70b-versatile" : "deterministic",
        promptTokens:     300,
        completionTokens: 100,
        totalTokens:      400,
      });

      optimizedCount++;
    } catch (err) {
      log("error", "Title optimization failed", {
        slug:  blog.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (optimizedCount === 0) {
    return NextResponse.json({ success: true, optimizedCount: 0, reason: "no_improvements_found" });
  }

  // ── Atomic commit ──────────────────────────────────────────────────────────
  const allFiles = [
    ...commitFiles,
    { path: "data/index.json", content: JSON.stringify(updatedIndex, null, 2) },
    { path: "data/costs.json", content: JSON.stringify(updatedCosts, null, 2) },
  ];

  try {
    await atomicCommit(
      allFiles,
      `feat(seo): optimise titles for ${optimizedCount} blog(s)`,
      token, owner, repo, branch
    );

    log("info", "Title optimisation committed", { optimizedCount });

    for (const f of commitFiles) {
      const slug = f.path.replace("data/blogs/", "").replace(".json", "");
      try { revalidatePath(`/blog/${slug}`); } catch { /* non-fatal */ }
    }
    try { revalidatePath("/blog"); } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, optimizedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Commit failed", { error: message });
    return NextResponse.json({ success: false, reason: message }, { status: 500 });
  }
}
