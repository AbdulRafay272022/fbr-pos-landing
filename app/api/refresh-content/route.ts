/**
 * GET /api/refresh-content
 *
 * GSC-driven Content Refresh Engine — triggered by agentBrain when
 * shouldRefresh decision is true.
 *
 * Flow:
 *  1. Auth check
 *  2. Read data/seo.json + data/index.json + data/costs.json
 *  3. Cost-guard check (abort if monthly token budget exceeded)
 *  4. Select up to MAX_REFRESHES_PER_RUN candidates via contentRefresher
 *  5. Load full blog JSON for each candidate
 *  6. Call Groq with refresh-type-specific prompts
 *  7. Inject schema, apply autoLink
 *  8. Atomic GitHub commit (all refreshed blogs + updated costs.json)
 *  9. Revalidate ISR caches
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import {
  selectRefreshCandidates,
  callGroqRefresh,
  extractTokenUsage,
} from "@/lib/agent/contentRefresher";
import { isUnderBudget, recordUsage, defaultCostData } from "@/lib/agent/costGuard";
import { injectSchema, stripSchemaMarkup } from "@/lib/agent/schemaGenerator";
import { autoLink } from "@/lib/agent/autoLinker";
import { getSiteConfig } from "@/lib/agent/siteConfig";
import type { BlogPost, SeoData, CostData } from "@/lib/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_REFRESHES_PER_RUN = 2;

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogIndex = Omit<BlogPost, "content">;

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts:    new Date().toISOString(),
    route: "refresh-content",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

// ─── Markdown → HTML ──────────────────────────────────────────────────────────

function markdownToHtml(md: string): string {
  function inlineFormat(text: string): string {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,         "<em>$1</em>")
      .replace(/`([^`]+)`/g,         "<code>$1</code>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" style="color:#F97316;font-weight:600;">$1</a>'
      );
  }

  const lines  = md.trim().split("\n");
  const output: string[] = [];
  let inUl = false;
  let inOl = false;

  function closeList() {
    if (inUl) { output.push("</ul>"); inUl = false; }
    if (inOl) { output.push("</ol>"); inOl = false; }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^#{4}\s+/.test(line)) { closeList(); output.push(`<h4>${inlineFormat(line.replace(/^#{4}\s+/, ""))}</h4>`); continue; }
    if (/^#{3}\s+/.test(line)) { closeList(); output.push(`<h3>${inlineFormat(line.replace(/^#{3}\s+/, ""))}</h3>`); continue; }
    if (/^#{2}\s+/.test(line)) { closeList(); output.push(`<h2>${inlineFormat(line.replace(/^#{2}\s+/, ""))}</h2>`); continue; }
    if (/^#{1}\s+/.test(line)) { closeList(); output.push(`<h2>${inlineFormat(line.replace(/^#{1}\s+/, ""))}</h2>`); continue; }

    const ulMatch = /^[-*+]\s+(.+)$/.exec(line);
    if (ulMatch) {
      if (inOl) { output.push("</ol>"); inOl = false; }
      if (!inUl) { output.push("<ul>"); inUl = true; }
      output.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      if (inUl) { output.push("</ul>"); inUl = false; }
      if (!inOl) { output.push("<ol>"); inOl = true; }
      output.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    if (line.trim() === "") { closeList(); continue; }
    closeList();
    if (/^<[a-z]/.test(line.trim())) {
      output.push(line);
    } else {
      output.push(`<p>${inlineFormat(line.trim())}</p>`);
    }
  }

  closeList();
  return output.join("\n");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("Unauthorized: CRON_SECRET not configured", { status: 503 });
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized refresh-content attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";
  const groqKey = process.env.GROQ_API_KEY;

  if (!token || !owner || !repo) {
    return NextResponse.json({ success: false, reason: "GitHub env vars not set" }, { status: 500 });
  }
  if (!groqKey) {
    return NextResponse.json({ success: false, reason: "GROQ_API_KEY not set" }, { status: 500 });
  }

  const config = getSiteConfig();
  log("info", "Content refresh started", { site: config.name });

  // ── Read state ─────────────────────────────────────────────────────────────
  const [seoData, blogIndex, costsData] = await Promise.all([
    readJsonFromGitHub<SeoData>("data/seo.json", token, owner, repo),
    readJsonFromGitHub<BlogIndex[]>("data/index.json", token, owner, repo),
    readJsonFromGitHub<CostData>("data/costs.json", token, owner, repo),
  ]);

  if (!seoData || !seoData.pages || seoData.pages.length === 0) {
    log("info", "No SEO data available — skipping refresh");
    return NextResponse.json({ success: true, refreshedCount: 0, reason: "no_seo_data" });
  }

  if (!blogIndex || blogIndex.length === 0) {
    log("info", "No blog index available");
    return NextResponse.json({ success: true, refreshedCount: 0, reason: "no_blogs" });
  }

  const costs = costsData ?? defaultCostData();

  // ── Cost guard ─────────────────────────────────────────────────────────────
  if (!isUnderBudget(costs)) {
    log("warn", "Monthly token budget exceeded — skipping refresh");
    return NextResponse.json({ success: false, reason: "budget_exceeded" }, { status: 429 });
  }

  // ── Select candidates ──────────────────────────────────────────────────────
  const allSlugs   = blogIndex.map((b) => b.slug);
  const candidates = selectRefreshCandidates(seoData, allSlugs, MAX_REFRESHES_PER_RUN);

  if (candidates.length === 0) {
    log("info", "No refresh candidates found");
    return NextResponse.json({ success: true, refreshedCount: 0, reason: "no_candidates" });
  }

  log("info", "Refresh candidates selected", {
    count: candidates.length,
    slugs: candidates.map((c) => c.slug),
  });

  // ── Load full blogs ────────────────────────────────────────────────────────
  const fullBlogs = await Promise.all(
    candidates.map((c) =>
      readJsonFromGitHub<BlogPost>(`data/blogs/${c.slug}.json`, token, owner, repo)
    )
  );

  const refreshedFiles: { path: string; content: string }[] = [];
  const updatedIndex = [...blogIndex];
  let updatedCosts   = { ...costs };
  let refreshedCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const blog      = fullBlogs[i];

    if (!blog) {
      log("warn", "Blog file not found", { slug: candidate.slug });
      continue;
    }

    log("info", "Refreshing blog", {
      slug:        candidate.slug,
      refreshType: candidate.refreshType,
      position:    candidate.metric?.position,
      ctr:         candidate.metric?.ctr,
    });

    try {
      const groqResult = await callGroqRefresh(
        blog,
        candidate,
        config.niche,
        config.name,
        groqKey,
        config.country  // enables SERP intel for refresh
      );

      // Convert markdown → HTML
      let html = markdownToHtml(groqResult.content_markdown ?? "");

      // Replace internal link placeholders
      html = html.replace(/\[INTERNAL_LINK:\s*([^\]]+)\]/g, (_, topic: string) => {
        const t     = topic.trim().toLowerCase();
        const match = blogIndex.find(
          (b) =>
            b.slug.includes(t.replace(/\s+/g, "-")) ||
            b.title.toLowerCase().includes(t) ||
            b.keywords.some((k) => k.toLowerCase().includes(t))
        );
        if (match) {
          return `<a href="/blog/${match.slug}" style="color:#F97316;font-weight:600;text-decoration:underline;">${match.title}</a>`;
        }
        return `<a href="/" style="color:#F97316;font-weight:600;text-decoration:underline;">${topic.trim()}</a>`;
      });

      // Auto-link deterministic links
      html = autoLink(html, blogIndex, blog.slug);

      // Strip old schema, inject fresh schema
      html = stripSchemaMarkup(html);
      html = injectSchema(html, {
        ...blog,
        title:           groqResult.title           ?? blog.title,
        metaDescription: groqResult.meta_description ?? blog.metaDescription,
        content:         html,
      }, config.baseUrl, config.name);

      // Merge FAQs: keep existing + add new non-duplicate ones
      const existingQs = new Set((blog.faqs ?? []).map((f) => f.question.toLowerCase()));
      const newFaqs    = (groqResult.faq ?? []).filter(
        (f) => !existingQs.has(f.question.toLowerCase())
      );
      const mergedFaqs = [...(blog.faqs ?? []), ...newFaqs];

      const updatedBlog: BlogPost = {
        ...blog,
        title:           groqResult.title           || blog.title,
        metaDescription: groqResult.meta_description || blog.metaDescription,
        content:         html,
        faqs:            mergedFaqs,
        keywords:        [
          ...new Set([
            ...blog.keywords,
            ...(groqResult.keywords_used ?? []),
          ]),
        ],
        lastUpdated: new Date().toISOString(),
        version:     (blog.version ?? 1) + 1,
      };

      refreshedFiles.push({
        path:    `data/blogs/${blog.slug}.json`,
        content: JSON.stringify(updatedBlog, null, 2),
      });

      // Update index entry
      const idxI = updatedIndex.findIndex((b) => b.slug === blog.slug);
      if (idxI !== -1) {
        updatedIndex[idxI] = {
          ...updatedIndex[idxI],
          title:           updatedBlog.title,
          metaDescription: updatedBlog.metaDescription,
          keywords:        updatedBlog.keywords,
          lastUpdated:     updatedBlog.lastUpdated,
          version:         updatedBlog.version,
        };
      }

      // Record token usage
      const tokens = extractTokenUsage({});  // Groq doesn't return usage in streaming
      updatedCosts = recordUsage(updatedCosts, {
        action:           "refresh",
        slug:             blog.slug,
        model:            "llama-3.3-70b-versatile",
        promptTokens:     tokens.promptTokens,
        completionTokens: tokens.completionTokens,
        totalTokens:      Math.max(tokens.totalTokens, 3000), // conservative estimate
      });

      refreshedCount++;
      log("info", "Blog refreshed", {
        slug:        blog.slug,
        refreshType: candidate.refreshType,
        version:     updatedBlog.version,
      });

    } catch (err) {
      log("error", "Refresh failed for blog", {
        slug:  candidate.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (refreshedCount === 0) {
    return NextResponse.json({ success: false, reason: "all_refreshes_failed", refreshedCount: 0 });
  }

  // ── Atomic commit ──────────────────────────────────────────────────────────
  const commitFiles = [
    ...refreshedFiles,
    { path: "data/index.json",  content: JSON.stringify(updatedIndex, null, 2)  },
    { path: "data/costs.json",  content: JSON.stringify(updatedCosts, null, 2)  },
  ];

  try {
    await atomicCommit(
      commitFiles,
      `feat(seo): refresh ${refreshedCount} blog(s) based on GSC performance data`,
      token, owner, repo, branch
    );

    log("info", "Refresh committed", { refreshedCount });

    // ── Revalidate ISR ───────────────────────────────────────────────────────
    for (const f of refreshedFiles) {
      const slug = f.path.replace("data/blogs/", "").replace(".json", "");
      try { revalidatePath(`/blog/${slug}`); } catch { /* non-fatal */ }
    }
    try { revalidatePath("/blog"); } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, refreshedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Commit failed", { error: message });
    return NextResponse.json({ success: false, reason: message }, { status: 500 });
  }
}
