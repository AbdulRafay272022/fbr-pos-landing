/**
 * GET /api/update-blogs
 *
 * Auto Blog Update Engine — runs daily via Vercel Cron.
 *
 * Secret weapon for SEO: regularly re-optimised content signals freshness
 * to Google and allows us to expand thin articles over time.
 *
 * Flow:
 *  1. Auth check
 *  2. Read index.json to find update candidates
 *     - Published more than UPDATE_AFTER_DAYS days ago
 *     - Not updated in the last SKIP_IF_UPDATED_WITHIN_DAYS days
 *  3. For each candidate (up to MAX_UPDATES_PER_RUN):
 *     a. Read full blog JSON from GitHub
 *     b. Call Groq with UPDATE_SYSTEM_PROMPT
 *     c. Parse improved content
 *     d. Increment version, set lastUpdated
 *  4. Commit ALL updated blogs in ONE atomic commit
 *  5. Revalidate ISR caches for each updated slug
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { countWords, type BlogPost } from "@/lib/blogStore";
import type { BlogFaq } from "@/lib/types";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { getUpdateCandidates } from "@/lib/agent/blogScorer";
import { autoLink, injectRelatedPosts } from "@/lib/agent/autoLinker";
import { refreshSchema } from "@/lib/agent/schemaGenerator";
import { getSiteConfig } from "@/lib/agent/siteConfig";

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_UPDATES_PER_RUN          = 2;   // max blogs updated per cron run
const UPDATE_AFTER_DAYS            = 30;  // blog must be at least 30 days old (was 7)
const SKIP_IF_UPDATED_WITHIN_DAYS  = 60;  // don't re-update within 60 days (was 30)
const MIN_WORD_COUNT               = 1400;
const WA_NUMBER                    = "923118366981";

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogIndex = Omit<BlogPost, "content">;

interface GroqUpdateJson {
  title: string;
  meta_description: string;
  content_markdown: string;
  faq: { question: string; answer: string }[];
  keywords_used: string[];
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts: new Date().toISOString(),
    route: "update-blogs",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

// ─── Markdown → HTML (same as generator — no external dep) ───────────────────

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

// ─── Internal link replacement ────────────────────────────────────────────────

function replaceInternalLinks(content: string, blogIndex: BlogIndex[]): string {
  return content.replace(/\[INTERNAL_LINK:\s*([^\]]+)\]/g, (_, topic: string) => {
    const t = topic.trim().toLowerCase();
    const match = blogIndex.find(
      (b) =>
        b.slug.includes(t.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")) ||
        b.title.toLowerCase().includes(t) ||
        b.keywords.some((k) => k.toLowerCase().includes(t))
    );
    if (match) {
      return `<a href="/blog/${match.slug}" style="color:#F97316;font-weight:600;text-decoration:underline;">${match.title}</a>`;
    }
    const href = t.includes("checker") || t.includes("compliance") ? "/fbr-checker" : "/";
    return `<a href="${href}" style="color:#F97316;font-weight:600;text-decoration:underline;">${topic.trim()}</a>`;
  });
}

// ─── Update system prompt ─────────────────────────────────────────────────────

const UPDATE_SYSTEM_PROMPT = `You are an expert SEO content editor improving existing blog posts about FBR compliance in Pakistan for Phelix ERP.

Your job: IMPROVE the existing blog — add depth, expand thin sections, add real Pakistani examples. Do NOT rewrite from scratch.

STRICT RULES:
- Keep the EXACT same slug (never change the URL)
- KEEP THE EXACT SAME TITLE — do not change it under any circumstances
- The "existing_content_text" field contains the current blog text — use it as your base
- MUST expand to minimum 1800 words total
- PRESERVE all existing sections — only add to them, never remove
- DO NOT repeat FAQs from "existing_faqs" — only add NEW ones
- NO generic AI phrases ("in conclusion", "in today's world", etc.)
- MUST add 2 NEW H2 sections with unique content not in existing_sections
- MUST include real Pakistani business examples with specific city names
- MUST include at least one technical FBR detail (IRIS, API, POSID, STRN, token)
- Use [INTERNAL_LINK: topic] placeholders 2+ times in paragraph text
- End with a strong CTA mentioning Phelix ERP and WhatsApp demo

WHAT TO ADD:
1. 2 new H2 sections (unique topics, complementary to existing)
2. Deeper Pakistani business examples with specific scenarios
3. Updated 2026 FBR compliance details where applicable
4. 3–5 new FAQs (questions your target business owner would ask)
5. A comparison table OR step-by-step checklist OR numbered process

OUTPUT FORMAT — JSON ONLY, no markdown fences:
{
  "title": "EXACT same title as provided — do not modify",
  "meta_description": "improved 150-char meta with primary keyword and clear value prop",
  "content_markdown": "FULL improved content in markdown — minimum 1800 words — preserving existing content and adding new sections",
  "faq": [{ "question": "...", "answer": "..." }],
  "keywords_used": ["keyword1", "keyword2"]
}`;

// ─── Groq update call ─────────────────────────────────────────────────────────

async function improveWithGroq(
  blog: BlogPost,
  allBlogs: BlogIndex[]
): Promise<{ title: string; metaDescription: string; content: string; faqs: BlogFaq[] } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  // ── Skip pinned-title blogs (human-curated, don't touch) ─────────────────
  if ((blog as unknown as Record<string, unknown>).pinnedTitle === true) {
    log("info", "Blog has pinnedTitle=true — skipping destructive rewrite, adding sections only", { slug: blog.slug });
  }

  const existingFaqQuestions = (blog.faqs ?? []).map((f) => f.question);

  // Strip HTML tags to get plain text for Groq (avoids token bloat from markup)
  const plainText = blog.content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 4000); // send first 4000 chars — enough context without exceeding limits

  // Extract h2 headings from HTML so Groq knows existing structure
  const existingSections = Array.from(
    blog.content.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi),
    (m) => m[1].replace(/[^a-zA-Z0-9 ,:\-–]/g, "").trim()
  );

  const userInput = JSON.stringify({
    blog_title:            blog.title,
    blog_slug:             blog.slug,
    target_keywords:       blog.keywords,
    published_at:          blog.publishedAt,
    current_version:       blog.version ?? 1,
    existing_faqs:         existingFaqQuestions,
    existing_sections:     existingSections.length > 0 ? existingSections : ["Introduction", "Who Must Comply", "How It Works"],
    existing_content_text: plainText,
    site_name:             "Phelix ERP",
    cta_whatsapp:          `https://wa.me/${WA_NUMBER}`,
    related_blogs:         allBlogs
      .filter((b) => b.slug !== blog.slug)
      .slice(0, 5)
      .map((b) => ({ slug: b.slug, title: b.title })),
    instructions: [
      "KEEP the exact title as provided — do not change it.",
      "Expand on existing_content_text — do not erase it, add to it.",
      "Add 2 NEW H2 sections not in existing_sections.",
      "Add 3–5 new FAQs not in existing_faqs.",
      "Include a real Pakistani business scenario with a specific city.",
      "Target minimum 1800 words in content_markdown.",
      "Return JSON ONLY — no markdown fences, no preamble.",
    ].join(" "),
  }, null, 2);

  let retries = 0;
  const maxRetries = 2;

  while (retries <= maxRetries) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model:       "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: UPDATE_SYSTEM_PROMPT },
            { role: "user",   content: userInput },
          ],
          max_tokens:  7000,
          temperature: 0.65,
        }),
        signal: AbortSignal.timeout(50_000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "unknown");
        throw new Error(`Groq ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
      };

      let rawContent = data.choices[0].message.content.trim();
      rawContent = rawContent
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

      const parsed: GroqUpdateJson = JSON.parse(rawContent);

      let htmlContent = markdownToHtml(parsed.content_markdown ?? "");
      htmlContent     = replaceInternalLinks(htmlContent, allBlogs);
      htmlContent     = autoLink(htmlContent, allBlogs, blog.slug);

      if (!htmlContent.includes("wa.me")) {
        htmlContent += `\n<div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;padding:24px;margin:32px 0;"><p style="font-weight:700;font-size:18px;margin:0 0 8px;">Get FBR compliant in 24 hours.</p><p style="margin:0 0 16px;color:#374151;">Our team handles complete FBR IRIS setup. Free demo on WhatsApp — we respond in minutes.</p><a href="https://wa.me/${WA_NUMBER}" style="background:#25D366;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">Start Free WhatsApp Demo</a></div>`;
      }

      // Merge: new FAQs only (don't lose existing ones)
      const newFaqs: BlogFaq[] = (parsed.faq ?? [])
        .filter((f) => !existingFaqQuestions.includes(f.question))
        .map((f) => ({ question: f.question, answer: f.answer }));

      // Always preserve the original title — never let the LLM change it
      const isPinned = (blog as unknown as Record<string, unknown>).pinnedTitle === true;
      const finalTitle = isPinned
        ? blog.title  // pinned: never touch the title
        : (parsed.title?.trim() || blog.title).slice(0, 70);

      return {
        title:           finalTitle,
        metaDescription: (parsed.meta_description?.slice(0, 155) || blog.metaDescription),
        content:         htmlContent,
        faqs:            [...(blog.faqs ?? []), ...newFaqs],
      };
    } catch (err) {
      retries++;
      const message = err instanceof Error ? err.message : String(err);
      log("warn", `Groq update attempt ${retries} failed`, { slug: blog.slug, error: message });
      if (retries > maxRetries) return null;
      // Brief delay before retry
      await new Promise((r) => setTimeout(r, 2000 * retries));
    }
  }

  return null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized update-blogs attempt");
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

  log("info", "Blog update engine started");

  // ── Load all full blog objects for quality-based candidate selection ───────
  const allIndexBlogs = await readJsonFromGitHub<BlogIndex[]>(
    "data/index.json", token, owner, repo
  ) ?? [];

  const eligibleIndex = allIndexBlogs.filter((b) => {
    const age         = daysSince(b.publishedAt);
    const sinceUpdate = b.lastUpdated ? daysSince(b.lastUpdated) : Infinity;
    const isPinned    = (b as unknown as Record<string, unknown>).pinnedTitle === true;
    // Pinned blogs still eligible for update (adding content) but must be ≥60 days old
    const minAge      = isPinned ? 60 : UPDATE_AFTER_DAYS;
    return age >= minAge && sinceUpdate >= SKIP_IF_UPDATED_WITHIN_DAYS;
  });

  if (eligibleIndex.length === 0) {
    log("info", "No blogs eligible for update yet");
    return NextResponse.json({
      success: true,
      message: "No blogs eligible for update",
      updatedCount: 0,
    });
  }

  // Load full content for eligible blogs (needed by quality scorer)
  const fullBlogsMaybeNull = await Promise.all(
    eligibleIndex.map((b) =>
      readJsonFromGitHub<BlogPost>(`data/blogs/${b.slug}.json`, token, owner, repo)
    )
  );
  const eligibleFullBlogs = fullBlogsMaybeNull.filter((b): b is BlogPost => b !== null);

  // ── Quality-based candidate selection (lowest quality = highest priority) ─
  const scoredCandidates = getUpdateCandidates(
    eligibleFullBlogs,
    UPDATE_AFTER_DAYS,
    SKIP_IF_UPDATED_WITHIN_DAYS,
    MAX_UPDATES_PER_RUN
  );

  const candidates = scoredCandidates.map((c) => c.blog);

  log("info", "Update candidates selected by quality score", {
    count:  candidates.length,
    scored: scoredCandidates.map((c) => ({ slug: c.blog.slug, score: c.score.score })),
  });

  // fullBlogs is the same as candidates (already loaded above)
  const fullBlogs = candidates;

  // ── Improve each blog with Groq (sequential to avoid rate limits) ─────────
  const updatedAt = new Date().toISOString();
  const commitFiles: Array<{ path: string; content: string }> = [];
  const updatedSlugs: string[] = [];
  const updatedIndexEntries = new Map<string, Partial<BlogIndex>>();

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const fullBlog  = fullBlogs[i];

    if (!fullBlog) {
      log("warn", "Blog JSON not found on GitHub", { slug: candidate.slug });
      continue;
    }

    log("info", `Improving blog ${i + 1}/${candidates.length}`, { slug: fullBlog.slug });

    const improved = await improveWithGroq(fullBlog, allIndexBlogs);

    if (!improved) {
      log("warn", "Groq improvement failed — skipping", { slug: fullBlog.slug });
      continue;
    }

    const words = countWords(improved.content);
    if (words < MIN_WORD_COUNT) {
      log("warn", "Updated content below minimum — skipping", { slug: fullBlog.slug, words });
      continue;
    }

    const siteConf = getSiteConfig();

    // Inject / refresh schema and related posts on every update
    const contentWithRelated = injectRelatedPosts(
      improved.content,
      { slug: fullBlog.slug, keywords: [...fullBlog.keywords] },
      allIndexBlogs
    );
    const contentWithSchema = refreshSchema(
      contentWithRelated,
      {
        ...fullBlog,
        title:           improved.title,
        metaDescription: improved.metaDescription,
        content:         contentWithRelated,
        faqs:            improved.faqs,
        lastUpdated:     updatedAt,
      },
      siteConf.baseUrl,
      siteConf.name
    );

    const updatedBlog: BlogPost = {
      ...fullBlog,
      title:           improved.title,
      metaDescription: improved.metaDescription,
      content:         contentWithSchema,
      faqs:            improved.faqs,
      lastUpdated:     updatedAt,
      readTime:        Math.max(1, Math.ceil(words / 200)),
      version:         (fullBlog.version ?? 1) + 1,
    };

    commitFiles.push({
      path:    `data/blogs/${updatedBlog.slug}.json`,
      content: JSON.stringify(updatedBlog, null, 2),
    });

    updatedSlugs.push(updatedBlog.slug);
    updatedIndexEntries.set(updatedBlog.slug, {
      title:           updatedBlog.title,
      metaDescription: updatedBlog.metaDescription,
      keywords:        updatedBlog.keywords,
      readTime:        updatedBlog.readTime,
      lastUpdated:     updatedAt,
    });

    log("info", "Blog improvement ready", {
      slug: updatedBlog.slug,
      words,
      version: updatedBlog.version,
      newFaqs: improved.faqs.length - (fullBlog.faqs?.length ?? 0),
    });
  }

  if (commitFiles.length === 0) {
    log("warn", "No improvements succeeded");
    return NextResponse.json({ success: true, updatedCount: 0, message: "No improvements succeeded" });
  }

  // ── Update index.json with new titles/meta/lastUpdated ────────────────────
  const updatedIndex: BlogIndex[] = allIndexBlogs.map((b) => {
    const patch = updatedIndexEntries.get(b.slug);
    return patch ? { ...b, ...patch } : b;
  });

  commitFiles.push({
    path:    "data/index.json",
    content: JSON.stringify(updatedIndex, null, 2),
  });

  // ── Single atomic commit for all updates ──────────────────────────────────
  try {
    await atomicCommit(
      commitFiles,
      `blog: update ${updatedSlugs.length} post${updatedSlugs.length > 1 ? "s" : ""} (${updatedSlugs.join(", ")})`,
      token, owner, repo, branch
    );

    log("info", "All updates committed", {
      updatedSlugs,
      filesCommitted: commitFiles.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "GitHub commit failed for updates", { error: message });
    return NextResponse.json(
      { success: false, reason: "GitHub commit failed", error: message },
      { status: 500 }
    );
  }

  // ── Revalidate ISR caches ─────────────────────────────────────────────────
  try {
    revalidatePath("/blog");
    revalidatePath("/sitemap.xml");
    for (const slug of updatedSlugs) {
      revalidatePath(`/blog/${slug}`);
    }
    log("info", "ISR caches revalidated");
  } catch (err) {
    log("warn", "revalidatePath failed (non-fatal)", { error: String(err) });
  }

  return NextResponse.json({
    success:      true,
    updatedCount: updatedSlugs.length,
    updatedSlugs,
    updatedAt,
  });
}
