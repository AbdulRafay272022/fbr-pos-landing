/**
 * GET /api/generate-blog
 *
 * Auto Blog Generation Engine — runs daily via Vercel Cron.
 *
 * Topic selection priority:
 *  1. Highest-priority unused keyword from data/keywords.json
 *  2. Falls back to hardcoded BLOG_TOPICS if keyword pool is empty/missing
 *
 * Content generation:
 *  - Groq LLM (llama-3.3-70b-versatile) with strict system prompt
 *  - Falls back to rich HTML template on LLM failure
 *  - Minimum 1200 words enforced
 *
 * Single atomic GitHub commit:
 *  data/blogs/{slug}.json + data/index.json + data/meta.json + data/keywords.json
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { countWords, type BlogPost } from "@/lib/blogStore";
import type { BlogFaq, KeywordsData, Keyword, MetaJson as FullMetaJson } from "@/lib/types";
import { fileExistsOnGitHub, readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import { slugifyKeyword, clusterToIndustry } from "@/lib/keywordEngine";
import { validateContent } from "@/lib/agent/qualityGate";
import { isSimilarToExisting, buildExistingTopicsList } from "@/lib/agent/duplicateDetector";
import { autoLink, injectRelatedPosts } from "@/lib/agent/autoLinker";
import { injectSchema } from "@/lib/agent/schemaGenerator";
import { getSiteConfig } from "@/lib/agent/siteConfig";
import { optimizeContent } from "@/lib/agent/performance";
import { injectCTA } from "@/lib/agent/ctaInjector";
import { getActivePack } from "@/lib/niche/registry";
import { buildSystemPrompt, buildUserInput } from "@/lib/niche/prompt";
import { isAdSense, injectAdSlots } from "@/lib/niche/monetization";
import { requireAuth } from "@/lib/auth";
import type { NichePack } from "@/lib/niche/types";
import { batchSubmitUrls, defaultIndexingData, wasRecentlySubmitted } from "@/lib/agent/indexing";
import { fetchHeroImage } from "@/lib/agent/imageProvider";
import type { IndexingData } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogIndex = Omit<BlogPost, "content">;
// MetaJson is imported from @/lib/types — alias for internal use
type MetaJson = Pick<FullMetaJson, "lastTopicIndex">;

interface GroqBlogJson {
  title: string;
  slug: string;
  meta_description: string;
  content_markdown: string;
  faq: { question: string; answer: string }[];
  internal_links: string[];
  keywords_used: string[];
}

/** Normalised topic shape — used whether source is keywords.json or BLOG_TOPICS */
interface TopicInput {
  keyword: string;
  slug: string;
  industry: string;
  businessType: string;
  keywords: string[];
  internalTopics: string[];
  /** Keyword cluster — used for CTA variant selection */
  cluster?: string;
}


// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = {
    ts: new Date().toISOString(),
    route: "generate-blog",
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn")  console.warn(JSON.stringify(entry));
  else                        console.log(JSON.stringify(entry));
}

// ─── Fallback topics (from the active niche pack) ─────────────────────────────
// Used only when the keyword pool is empty. No longer hardcoded — the active
// pack (fbr-pos, sports, …) supplies its own niche-correct fallback topics.

const BLOG_TOPICS: TopicInput[] = getActivePack().fallbackTopics;

// ─── System prompt ────────────────────────────────────────────────────────────
// The Groq system prompt is now composed from the active niche pack at call
// time via buildSystemPrompt(pack) — see lib/niche/prompt.ts. No niche string
// is hardcoded here, so the same engine writes FBR, sports, or any other niche.

// ─── Markdown → HTML (no external dependency) ─────────────────────────────────

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
  let tableRows: string[] = [];

  function splitRow(line: string): string[] {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  }
  function isSeparatorRow(line: string): boolean {
    return /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-");
  }
  function flushTable() {
    if (tableRows.length === 0) return;
    const rows = tableRows.filter((r) => !isSeparatorRow(r));
    tableRows = [];
    if (rows.length === 0) return;
    const th = "padding:10px 14px;border:1px solid #E5E7EB;background:#FFF7ED;text-align:left;font-weight:700;";
    const td = "padding:10px 14px;border:1px solid #E5E7EB;";
    const header = splitRow(rows[0]);
    const thead = `<thead><tr>${header.map((h) => `<th style="${th}">${inlineFormat(h)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.slice(1).map((r) => {
      const cells = splitRow(r);
      return `<tr>${cells.map((c) => `<td style="${td}">${inlineFormat(c)}</td>`).join("")}</tr>`;
    }).join("")}</tbody>`;
    output.push(`<table style="border-collapse:collapse;width:100%;margin:24px 0;font-size:15px;">${thead}${tbody}</table>`);
  }

  function closeList() {
    if (inUl) { output.push("</ul>"); inUl = false; }
    if (inOl) { output.push("</ol>"); inOl = false; }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Table rows (markdown pipe tables) — buffer until the table ends
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    if (!isTableRow && tableRows.length) flushTable();
    if (isTableRow) {
      closeList();
      tableRows.push(line);
      continue;
    }

    // Headings (h1 → h2: page title is the only h1)
    if (/^#{4}\s+/.test(line)) { closeList(); output.push(`<h4>${inlineFormat(line.replace(/^#{4}\s+/, ""))}</h4>`); continue; }
    if (/^#{3}\s+/.test(line)) { closeList(); output.push(`<h3>${inlineFormat(line.replace(/^#{3}\s+/, ""))}</h3>`); continue; }
    if (/^#{2}\s+/.test(line)) { closeList(); output.push(`<h2>${inlineFormat(line.replace(/^#{2}\s+/, ""))}</h2>`); continue; }
    if (/^#{1}\s+/.test(line)) { closeList(); output.push(`<h2>${inlineFormat(line.replace(/^#{1}\s+/, ""))}</h2>`); continue; }

    // Unordered list
    const ulMatch = /^[-*+]\s+(.+)$/.exec(line);
    if (ulMatch) {
      if (inOl) { output.push("</ol>"); inOl = false; }
      if (!inUl) { output.push("<ul>"); inUl = true; }
      output.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      if (inUl) { output.push("</ul>"); inUl = false; }
      if (!inOl) { output.push("<ol>"); inOl = true; }
      output.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") { closeList(); continue; }

    // Regular paragraph (passthrough if already HTML)
    closeList();
    if (/^<[a-z]/.test(line.trim())) {
      output.push(line);
    } else {
      output.push(`<p>${inlineFormat(line.trim())}</p>`);
    }
  }

  flushTable();
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

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && slug.length > 5 && slug.length < 100;
}

// ─── Brief resolver — cache-first, parallel inline fallback ──────────────────
//
// Architecture: /api/pre-brief runs at 1 AM (Stage 1) and pre-computes the
// SEO brief using Serper + competitor scraper + entity graph.
// This function reads that cached brief at 2 AM (Stage 2) — a 1ms GitHub read
// instead of a 23s serial pipeline — leaving Groq its full 55s budget.
//
// Fallback: if the cache is stale/missing, run SERP + entity IN PARALLEL with
// a hard 12s cap. No competitor scraper in the fallback (no time budget for it).

interface PendingBrief {
  keyword:    string;
  seoBrief:   string;
  createdAt:  string;
}

async function resolveBrief(
  topic: TopicInput,
  token: string,
  owner: string,
  repo:  string
): Promise<string> {
  // ── 1. Cache hit: pre-brief from /api/pre-brief (1 AM) ───────────────────
  try {
    const cached = await readJsonFromGitHub<PendingBrief>(
      "data/briefs/pending.json", token, owner, repo
    );
    if (cached?.keyword && cached.seoBrief) {
      const ageHours    = (Date.now() - new Date(cached.createdAt).getTime()) / 3_600_000;
      const keywordMatch = cached.keyword.toLowerCase().trim() === topic.keyword.toLowerCase().trim();

      if (keywordMatch && ageHours < 6) {
        log("info", "SEO brief: cache HIT (pre-brief)", {
          keyword:     topic.keyword,
          ageHours:    +ageHours.toFixed(2),
          briefLength: cached.seoBrief.length,
        });
        return cached.seoBrief.slice(0, 1000);
      }

      log("info", "SEO brief: cache MISS", {
        keyword:      topic.keyword,
        cachedFor:    cached.keyword,
        ageHours:     +ageHours.toFixed(2),
        keywordMatch,
      });
    }
  } catch {
    /* non-fatal — proceed to inline fallback */
  }

  // ── 2. Cache miss: inline parallel SERP + entity (12s cap, no competitors) ─
  if (!process.env.SERPER_API_KEY) return "";

  log("info", "SEO brief: computing inline (parallel, 12s cap)");
  const t0 = Date.now();

  try {
    const [
      { analyzeSerpIntelligence, buildIntelligentBrief },
      { getCountryCode },
      { getSiteConfig: getSC },
    ] = await Promise.all([
      import("@/lib/agent/serpIntelligence"),
      import("@/lib/agent/keywordDiscovery"),
      import("@/lib/agent/siteConfig"),
    ]);

    const country = process.env.SITE_COUNTRY ?? "Pakistan";
    const siteCfg = getSC();

    // Both are fully independent — run concurrently
    const [serpSettled, entitySettled] = await Promise.allSettled([
      analyzeSerpIntelligence(topic.keyword, getCountryCode(country)),

      (async () => {
        const { buildEntityCoverage, buildEntityBrief } =
          await import("@/lib/agent/entityGraph");
        const entityPack = getActivePack();
        return buildEntityBrief(
          await buildEntityCoverage(topic.keyword, siteCfg.niche, siteCfg.seedKeywords, {
            allow: entityPack.prompt.entityAllow,
            deny:  entityPack.prompt.entityDeny,
          })
        );
      })(),
    ]);

    const analysis    = serpSettled.status   === "fulfilled" ? serpSettled.value   : null;
    const entityBrief = entitySettled.status === "fulfilled" ? (entitySettled.value ?? "") : "";

    let brief = "";
    if (analysis) {
      brief = buildIntelligentBrief(analysis);
      log("info", "SEO brief: SERP inline complete", {
        difficulty:  analysis.difficulty,
        rankability: analysis.rankability,
        intent:      analysis.intent,
        elapsedMs:   Date.now() - t0,
      });
    }
    if (entityBrief) brief += "\n\n" + entityBrief;

    // No competitor scraper here — no time budget when running inline
    return brief.slice(0, 1000);
  } catch (err) {
    log("warn", "SEO brief: inline fallback failed — proceeding without brief", {
      error: String(err),
    });
    return "";
  }
}

// ─── Groq generation ──────────────────────────────────────────────────────────

/** Count words in a markdown string (via the HTML renderer, matching countWords). */
function markdownWordCount(md: string): number {
  return countWords(markdownToHtml(md ?? ""));
}

/**
 * One Groq chat call that returns a parsed GroqBlogJson.
 * Handles code-fence stripping, control-char escaping, truncated-JSON repair,
 * and parse — throwing on failure so the caller can fall back to template.
 */
async function callGroqForBlog(
  systemPrompt: string,
  userInput:    string,
  apiKey:       string,
  keyword:      string,
): Promise<GroqBlogJson> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userInput },
      ],
      max_tokens:  8000,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`Groq ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  let rawContent = data.choices[0].message.content.trim();

  console.warn(JSON.stringify({
    ts: new Date().toISOString(),
    event: "groq_usage",
    prompt_tokens:     data.usage?.prompt_tokens,
    completion_tokens: data.usage?.completion_tokens,
    raw_length:        rawContent.length,
    keyword,
  }));

  // Strip markdown code fences if model wrapped its output
  rawContent = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  // Escape ALL control characters (U+0000-U+001F) inside JSON string values.
  rawContent = rawContent.replace(/"(?:[^"\\]|\\[\s\S])*"/g, (match) =>
    // eslint-disable-next-line no-control-regex
    match.replace(/[\x00-\x1F]/g, (ch) => {
      if (ch === "\n") return "\\n";
      if (ch === "\r") return "\\r";
      if (ch === "\t") return "\\t";
      return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    })
  );

  // Attempt to repair truncated JSON before parsing
  let repairedContent = rawContent;
  if (!rawContent.endsWith("}")) {
    let openBraces = 0, openBrackets = 0, inString = false, escaped = false;
    for (const ch of rawContent) {
      if (escaped)      { escaped = false; continue; }
      if (ch === "\\")  { escaped = true;  continue; }
      if (ch === '"')   { inString = !inString; continue; }
      if (inString)     { continue; }
      if (ch === "{")   openBraces++;
      if (ch === "}")   openBraces--;
      if (ch === "[")   openBrackets++;
      if (ch === "]")   openBrackets--;
    }
    if (inString)       repairedContent += '"';
    for (let i = 0; i < openBrackets; i++) repairedContent += "]";
    for (let i = 0; i < openBraces;   i++) repairedContent += "}";
  }

  try {
    return JSON.parse(repairedContent) as GroqBlogJson;
  } catch (parseErr) {
    console.error(JSON.stringify({
      ts:    new Date().toISOString(),
      event: "groq_json_parse_failed",
      error: String(parseErr),
      raw_tail: rawContent.slice(-300),
    }));
    throw new Error(`Groq JSON parse failed: ${String(parseErr)}`);
  }
}

/** System prompt for the expansion pass — turns a short draft into a full article. */
function buildExpandSystemPrompt(targetWords: number): string {
  return `You are an expert editor. You are given a draft article as JSON. EXPAND it to at least ${targetWords} words.

RULES:
- Keep the SAME JSON shape and the SAME headings, structure, and [INTERNAL_LINK: ...] placeholders.
- Add depth to EVERY section: concrete examples, specific numbers, step detail, and nuance.
- Add or lengthen FAQ answers (aim for 5–8 FAQs, each answer 40+ words).
- Keep any comparison table and numbered steps; make them richer.
- Do NOT remove content, do NOT shorten, do NOT change the title or slug.
- Return JSON ONLY — no markdown fences, no preamble.`;
}

async function generateWithGroq(
  pack:      NichePack,
  topic:     TopicInput,
  blogIndex: BlogIndex[],
  seoBrief = ""        // ← passed in from resolveBrief(); no brief computation here
): Promise<{ blog: Partial<BlogPost>; keywords: string[] }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  // System prompt + user input are now composed entirely from the active
  // niche pack — no hardcoded FBR/Pakistan strings.
  const systemPrompt = buildSystemPrompt(pack);
  const userInput = buildUserInput(pack, {
    keyword:        topic.keyword,
    slug:           topic.slug,
    industry:       topic.industry,
    internalTopics: topic.internalTopics,
    seoBrief,
    publishedBlogs: blogIndex.map((b) => ({ slug: b.slug, title: b.title })),
  });

  // ── Pass 1: generate ───────────────────────────────────────────────────────
  let parsed = await callGroqForBlog(systemPrompt, userInput, apiKey, topic.keyword);

  // ── Pass 2: expand (llama-3.3 frequently returns short drafts) ─────────────
  // If the draft is below target, ask Groq to EXPAND it rather than regenerate —
  // expansion is far more reliable at hitting length than a cold first attempt.
  // This is what stops short drafts from failing the gate and triggering the
  // duplicate template fallback. Wrapped so a failed expansion keeps pass-1.
  const expandTarget = Math.round(pack.thresholds.minWordCount * 1.4);
  const draftWords = markdownWordCount(parsed.content_markdown ?? "");
  if (draftWords < expandTarget) {
    try {
      const expandUser = JSON.stringify({
        target_words:  expandTarget,
        current_words: draftWords,
        keyword:       topic.keyword,
        article:       parsed,
      });
      const expanded = await callGroqForBlog(
        buildExpandSystemPrompt(expandTarget), expandUser, apiKey, `${topic.keyword} (expand)`
      );
      const expandedWords = markdownWordCount(expanded.content_markdown ?? "");
      if (expanded.content_markdown && expandedWords > draftWords) {
        parsed = {
          ...parsed,
          content_markdown: expanded.content_markdown,
          faq: (expanded.faq?.length ?? 0) >= (parsed.faq?.length ?? 0) ? expanded.faq : parsed.faq,
        };
        log("info", "Groq expansion applied", { draftWords, expandedWords, target: expandTarget });
      } else {
        log("info", "Groq expansion did not lengthen — keeping draft", { draftWords, expandedWords });
      }
    } catch (err) {
      log("warn", "Groq expansion failed — keeping first draft", { error: String(err), draftWords });
    }
  }

  const aiSlug  = parsed.slug && isValidSlug(parsed.slug) ? parsed.slug : topic.slug;

  let htmlContent = markdownToHtml(parsed.content_markdown ?? "");
  // Replace explicit placeholders first, then run the deterministic auto-linker
  htmlContent = replaceInternalLinks(htmlContent, blogIndex);
  htmlContent = autoLink(htmlContent, blogIndex, aiSlug);

  // Monetization (lead-gen CTA or AdSense slots) is injected later in the
  // request handler via the active pack's monetization strategy — not here.

  const faqs: BlogFaq[] = (parsed.faq ?? []).map((f) => ({
    question: f.question,
    answer:   f.answer,
  }));
  const aiTitle = parsed.title?.trim() || topic.keyword;
  const aiMeta  = parsed.meta_description?.slice(0, 155) ||
    `${topic.keyword} — a practical, up-to-date guide.`;

  return {
    blog: {
      slug:            aiSlug,
      title:           aiTitle,
      metaDescription: aiMeta,
      keywords:        [...topic.keywords],
      content:         htmlContent,
      faqs,
    },
    keywords: parsed.keywords_used ?? [],
  };
}

// ─── Template fallback (rich, always-valid content) ───────────────────────────

// Template fallback now comes from the active niche pack. Each pack ships a
// niche-safe template (FBR for fbr-pos, sports-safe for sports, …) so a failed
// LLM call never produces off-niche or duplicate-prone boilerplate.

function templateInputFor(topic: TopicInput) {
  return {
    keyword:        topic.keyword,
    primaryKeyword: topic.keywords[0] ?? topic.keyword,
    industry:       topic.industry,
  };
}

function generateTemplate(topic: TopicInput): string {
  return getActivePack().buildTemplate(templateInputFor(topic)).html;
}

function getTemplateFaqs(topic: TopicInput): BlogFaq[] {
  return getActivePack().buildTemplate(templateInputFor(topic)).faqs;
}

// ─── Topic selection: keywords.json → BLOG_TOPICS fallback ───────────────────

async function selectTopic(
  token: string,
  owner: string,
  repo: string
): Promise<{
  topic: TopicInput;
  nextTopicIndex: number;
  consumedKeyword: Keyword | null;
  keywordsData: KeywordsData | null;
}> {
  // Try keywords.json first
  const keywordsData = await readJsonFromGitHub<KeywordsData>(
    "data/keywords.json", token, owner, repo
  );

  if (keywordsData && keywordsData.keywords.length > 0) {
    // Build existing topics list for duplicate/cannibalization check
    const blogIdx = await readJsonFromGitHub<BlogIndex[]>("data/index.json", token, owner, repo) ?? [];
    const existingTopics = buildExistingTopicsList(blogIdx);

    // ── Cluster-aware topic selection ────────────────────────────────────────
    // Build topic clusters from current keyword pool, pick from cluster strategy
    let clusterPick: { keyword: string; clusterId: string; isPillar: boolean } | null = null;
    try {
      const { buildTopicClusters, pickNextClusterKeyword } = await import("@/lib/agent/topicCluster");
      const { decideSchedule } = await import("@/lib/agent/publishingSchedule");

      const indexForCluster = blogIdx.map((b) => ({
        slug: b.slug, keywords: b.keywords ?? [], title: b.title,
      }));
      const clustering = buildTopicClusters(keywordsData.keywords, indexForCluster);

      // Check schedule decision (rest day? burst protection?)
      const meta2 = await readJsonFromGitHub<{ stats?: { lastGenerateAt?: string } }>("data/meta.json", token, owner, repo);
      const lastPublishAt = meta2?.stats?.lastGenerateAt ?? null;
      const schedule = decideSchedule(clustering.clusters, lastPublishAt);

      log("info", "Schedule decision", {
        action:    schedule.action,
        reason:    schedule.reason,
        dayOfWeek: schedule.cadence.dayOfWeek,
      });

      if (schedule.action === "rest") {
        // Skip publishing today entirely
        throw new Error(`Schedule: ${schedule.reason}`);
      }
      if (schedule.action === "refresh-existing") {
        // Refresh-content cron handles this — skip blog generation
        throw new Error(`Schedule: ${schedule.reason}`);
      }

      // publish-pillar or publish-cluster → use the cluster-recommended keyword
      const next = pickNextClusterKeyword(clustering.clusters);
      if (next) {
        clusterPick = { keyword: next.keyword, clusterId: next.clusterId, isPillar: next.isPillar };
        log("info", "Cluster strategy picked next keyword", {
          keyword:   next.keyword,
          clusterId: next.clusterId,
          isPillar:  next.isPillar,
          status:    next.clusterContext.status,
          progress:  `${next.clusterContext.writtenCount}/${next.clusterContext.totalKeywords}`,
        });
      }
    } catch (err) {
      // Schedule rest is not an error per-se — propagate it as a skip
      const msg = String(err);
      if (msg.includes("Schedule:")) {
        throw err;
      }
      log("warn", "Cluster strategy unavailable, falling back to priority order", { error: msg });
    }

    // ── Priority -1: Pre-briefed keyword (highest priority) ─────────────────
    // The /api/pre-brief cron runs at 1 AM and:
    //   1. Discovers trending topics + picks the best keyword
    //   2. Runs SERP intelligence + competitor scraping for that keyword
    //   3. Saves the result to data/briefs/pending.json
    //
    // We MUST honour this choice as Priority -1 — it already has a full brief
    // ready, which gives Groq the richest possible context. If we pick a
    // DIFFERENT keyword here, the brief cache will miss and Groq gets an empty
    // brief → generic short content → template fallback.
    //
    // Guard: only use the brief if it is fresh (< 6 h) AND the slug hasn't
    // been published yet. If either check fails, fall through to Priority 0.
    let preBriefKeyword: Keyword | null = null;
    try {
      const pending = await readJsonFromGitHub<{
        keyword:    string;
        createdAt:  string;
        serpRankability?: string;
      }>("data/briefs/pending.json", token, owner, repo);

      if (pending?.keyword && pending.createdAt) {
        const ageHours  = (Date.now() - new Date(pending.createdAt).getTime()) / 3_600_000;
        const pendingSlug = slugifyKeyword(pending.keyword);
        const alreadyPublished = await fileExistsOnGitHub(
          `data/blogs/${pendingSlug}.json`, token, owner, repo
        );

        if (ageHours < 6 && !alreadyPublished) {
          preBriefKeyword = {
            keyword:         pending.keyword,
            intent:          "informational",
            difficulty:      pending.serpRankability === "hard" ? "high" : "low",
            priority:        110,          // above everything else
            cluster:         "pre-briefed",
            used:            false,
            usedIn:          null,
            generatedAt:     pending.createdAt,
            validated:       true,
            validationBoost: 2.5,          // pre-validated by live SERP data
          };
          log("info", "Pre-briefed keyword selected (Priority -1)", {
            keyword:  pending.keyword,
            ageHours: +ageHours.toFixed(2),
          });
        } else {
          log("info", "Pre-brief skipped", {
            keyword:   pending.keyword,
            ageHours:  +ageHours.toFixed(2),
            published: alreadyPublished,
          });
        }
      }
    } catch { /* non-fatal — fall through to Priority 0 */ }

    // ── Priority 0: Trending topics (pre-brief cached at 1 AM) ───────────────
    // Load data/trends/latest.json — pre-brief discovers trends every 48h and
    // saves them. These are the hottest topics RIGHT NOW on Google Pakistan.
    // Trending news = competitors haven't written yet = first-mover advantage.
    let trendKeywords: Keyword[] = [];
    try {
      const { readJsonFromGitHub: readJson } = await import("@/lib/githubApi");
      const trendsCache = await readJson<{ candidates: Array<{ keyword: string; source: string; score: number; freshnessHours: number; discoveredAt: string }>; expiresAt: string }>(
        "data/trends/latest.json", token, owner, repo
      );
      if (trendsCache && new Date(trendsCache.expiresAt) > new Date()) {
        trendKeywords = trendsCache.candidates.map((c, i) => ({
          keyword:         c.keyword,
          intent:          "informational" as const,
          difficulty:      c.freshnessHours <= 24 ? ("low" as const) : ("medium" as const),
          priority:        Math.max(70, 100 - i),
          cluster:         c.source === "news" ? "trending-news" : "trending-autocomplete",
          used:            false,
          usedIn:          null,
          generatedAt:     c.discoveredAt,
          validated:       true,
          validationBoost: c.source === "news" ? 2.0 : 1.5,
        }));
        log("info", "Trending candidates loaded", {
          count:       trendKeywords.length,
          top:         trendKeywords[0]?.keyword,
          expiresAt:   trendsCache.expiresAt,
        });
      }
    } catch { /* non-fatal — agent still works without trends */ }

    // ── Fix 1: GSC-first selection ─────────────────────────────────────────
    // Load seo.json and extract queries already ranking at positions 11–50.
    // These are guaranteed winnable — Google is already partially ranking us.
    let seoData: { pages?: Array<{ page: string; position: number; queries?: string[] }>; queries?: Array<{ query: string; impressions: number; clicks: number; ctr: number; position: number; fetchedAt: string }> } | null = null;
    try {
      const { readJsonFromGitHub: readJson } = await import("@/lib/githubApi");
      seoData = await readJson("data/seo.json", token, owner, repo);
    } catch { /* non-fatal */ }

    const unusedKeywords = keywordsData.keywords.filter((k) => !k.used && !k.rejected);

    // ── GSC queries at pos 11–50 → highest-priority candidates ────────────────
    // Two tiers:
    //   Tier A: Query already in keywords.json → matched directly (exact/partial)
    //   Tier B: Query NOT in keywords.json → synthesize as a Keyword and inject
    //           Google already considers us relevant for it — no keyword research needed.
    const gscPriorityKeywords: typeof unusedKeywords = [];
    if (seoData?.queries && seoData.queries.length > 0) {
      const strikingQueries = seoData.queries
        .filter((q) => q.position >= 11 && q.position <= 50 && q.impressions >= 3)
        .sort((a, b) => b.impressions - a.impressions); // highest impression opportunity first

      const usedKeywordStrings = new Set(
        keywordsData.keywords.filter((k) => k.used).map((k) => k.keyword.toLowerCase().trim())
      );

      for (const q of strikingQueries) {
        const norm = q.query.toLowerCase().trim();

        // Skip if we already published a blog for this query
        if (usedKeywordStrings.has(norm)) continue;

        // Tier A: exact/partial match in unused keyword pool
        const poolMatch = unusedKeywords.find(
          (k) => k.keyword.toLowerCase().trim() === norm ||
                 k.keyword.toLowerCase().includes(norm) ||
                 norm.includes(k.keyword.toLowerCase())
        );
        if (poolMatch && !gscPriorityKeywords.includes(poolMatch)) {
          gscPriorityKeywords.push(poolMatch);
          continue;
        }

        // Tier B: query not in keywords.json at all — synthesize from GSC data
        // Google already ranks us for this, so it's a guaranteed winnable topic.
        const synthesized: Keyword = {
          keyword:      q.query,
          intent:       "informational",
          difficulty:   q.position <= 20 ? "low" : "medium",
          priority:     Math.min(100, Math.round(q.impressions * 2 + (50 - q.position))),
          cluster:      "gsc-discovered",
          used:         false,
          usedIn:       null,
          generatedAt:  new Date().toISOString(),
          validated:    true,         // GSC data = real validation
          validationBoost: 1.8,       // strong boost — Google already approves
        };
        gscPriorityKeywords.push(synthesized);
      }

      if (gscPriorityKeywords.length > 0) {
        log("info", "GSC quick-win keywords found", {
          count:     gscPriorityKeywords.length,
          top:       gscPriorityKeywords[0]?.keyword,
          topImpressions: strikingQueries[0]?.impressions,
          topPos:    strikingQueries[0]?.position?.toFixed(1),
        });
      } else {
        log("info", "GSC data present but no striking-distance queries matched", {
          totalQueries: strikingQueries.length,
        });
      }
    }

    // ── Fix 2: Cluster-diverse sampling ─────────────────────────────────────
    // Old: slice(0, 15) — one cluster monopolises all slots.
    // New: top-2 per cluster, 30 total — every cluster gets representation.
    const clusterSeen = new Map<string, number>();
    const diverseCandidates: typeof unusedKeywords = [];

    // Track all seen keywords to avoid duplicates across priority tiers
    const seenKwSet = new Set<string>();

    // Priority -1: Pre-briefed keyword (1 AM pre-brief already ran SERP + wrote brief)
    if (preBriefKeyword) {
      const norm = preBriefKeyword.keyword.toLowerCase().trim();
      seenKwSet.add(norm);
      diverseCandidates.push(preBriefKeyword);
      clusterSeen.set("pre-briefed", 1);
    }

    // Priority 0: Trending topics (hottest signal, freshest, first-mover wins)
    for (const kw of trendKeywords) {
      const norm = kw.keyword.toLowerCase().trim();
      if (seenKwSet.has(norm)) continue;
      seenKwSet.add(norm);
      diverseCandidates.push(kw);
      const c = kw.cluster ?? "none";
      clusterSeen.set(c, (clusterSeen.get(c) ?? 0) + 1);
    }

    // Priority 1: GSC striking-distance keywords (Google already approves us)
    for (const kw of gscPriorityKeywords) {
      const norm = kw.keyword.toLowerCase().trim();
      if (seenKwSet.has(norm)) continue;
      seenKwSet.add(norm);
      diverseCandidates.push(kw);
      const c = kw.cluster ?? "none";
      clusterSeen.set(c, (clusterSeen.get(c) ?? 0) + 1);
    }

    // Priority 2: Cluster-diverse picks from the keyword pool
    for (const kw of unusedKeywords) {
      const norm = kw.keyword.toLowerCase().trim();
      if (seenKwSet.has(norm)) continue;
      const c = kw.cluster ?? "none";
      if ((clusterSeen.get(c) ?? 0) < 2) {
        seenKwSet.add(norm);
        diverseCandidates.push(kw);
        clusterSeen.set(c, (clusterSeen.get(c) ?? 0) + 1);
        if (diverseCandidates.length >= 30) break;
      }
    }

    // Put cluster-recommended keyword at the very front (after trending)
    let candidates = diverseCandidates;
    if (clusterPick) {
      const clusterKw = unusedKeywords.find(
        (k) => k.keyword.toLowerCase() === clusterPick!.keyword.toLowerCase()
      );
      if (clusterKw) {
        // Insert after trending keywords but before GSC/pool
        const trendCount = trendKeywords.length;
        const rest = candidates.filter((c) => c.keyword !== clusterKw.keyword);
        candidates = [...rest.slice(0, trendCount), clusterKw, ...rest.slice(trendCount)];
      }
    }

    log("info", "Candidate pool built", {
      total:               candidates.length,
      preBriefed:          preBriefKeyword ? 1 : 0,
      trending:            trendKeywords.length,
      gscPriority:         gscPriorityKeywords.length,
      clustersRepresented: clusterSeen.size,
    });

    // ── Fix 3: Fast checks only — no inline SERP call per keyword ───────────
    // SERP validation ran inside /api/pre-brief at 1 AM and stored results.
    // Per-keyword Serper calls (12s each × 15 = 180s) caused timeouts.
    // Now: only cheap checks — rejected flag + similarity + slug exists.
    for (const bestKw of candidates) {
      // Fix 4: Skip keywords pre-brief already marked impossible
      if (bestKw.rejected) {
        log("info", "Keyword skipped — pre-rejected", {
          keyword: bestKw.keyword,
          reason:  bestKw.rejectedReason ?? "impossible SERP",
        });
        continue;
      }

      // Similarity / cannibalization check (~1ms)
      const simResult = isSimilarToExisting(bestKw.keyword, existingTopics);
      if (simResult.isSimilar) {
        log("warn", "Keyword rejected — too similar to existing blog", {
          keyword:     bestKw.keyword,
          similarity:  simResult.score.toFixed(3),
          matchedWith: simResult.matchedWith.slice(0, 80),
        });
        continue;
      }

      // Slug existence check (~200ms GitHub read)
      const kwSlug = slugifyKeyword(bestKw.keyword);
      const exists = await fileExistsOnGitHub(`data/blogs/${kwSlug}.json`, token, owner, repo);
      if (exists) {
        log("info", "Keyword slug already published, trying next", { slug: kwSlug });
        continue;
      }

      // ✅ Passed — this is our keyword
      log("info", "Topic selected", {
        keyword:   bestKw.keyword,
        cluster:   bestKw.cluster,
        priority:  bestKw.priority,
        gscBoost:  gscPriorityKeywords.includes(bestKw),
      });
      const activePack = getActivePack();
      return {
        topic: {
          keyword:        bestKw.keyword,
          slug:           kwSlug,
          industry:       clusterToIndustry(bestKw.cluster),
          businessType:   bestKw.cluster,
          keywords:       [bestKw.keyword, `${bestKw.keyword} ${activePack.country.toLowerCase()}`.trim(), activePack.niche.toLowerCase()],
          internalTopics: activePack.prompt.internalTopics,
        },
        nextTopicIndex: -1,
        consumedKeyword: bestKw,
        keywordsData,
      };
    }
  }

  // ── Fix 5: BLOG_TOPICS with resurrection — never throws dead ────────────────
  // First: try each BLOG_TOPIC that hasn't been published yet.
  // Then: if all 12 are published, resurrect the oldest as a refreshed guide
  // (new slug + updated year) instead of dying permanently.
  log("info", "Falling back to BLOG_TOPICS");
  const meta = await readJsonFromGitHub<MetaJson>("data/meta.json", token, owner, repo);
  const startIndex = ((meta?.lastTopicIndex ?? -1) + 1) % BLOG_TOPICS.length;

  for (let i = 0; i < BLOG_TOPICS.length; i++) {
    const idx       = (startIndex + i) % BLOG_TOPICS.length;
    const candidate = BLOG_TOPICS[idx];
    const exists    = await fileExistsOnGitHub(
      `data/blogs/${candidate.slug}.json`, token, owner, repo
    );
    if (!exists) {
      log("info", "Topic selected from BLOG_TOPICS", { slug: candidate.slug, idx });
      return {
        topic: candidate,
        nextTopicIndex: idx,
        consumedKeyword: null,
        keywordsData,
      };
    }
    log("info", "BLOG_TOPICS slug exists, skipping", { slug: candidate.slug });
  }

  // ── Resurrection: all 12 BLOG_TOPICS are published ───────────────────────
  // Rotate daily through the list so we don't repeat the same one twice.
  // Each resurrection creates a fresh slug so it doesn't overwrite the original.
  log("warn", "All BLOG_TOPICS exhausted — resurrecting as refreshed guide");
  const year           = new Date().getFullYear();
  const dayRotation    = Math.floor(Date.now() / 86_400_000) % BLOG_TOPICS.length;
  const base           = BLOG_TOPICS[dayRotation];
  // Strip existing year suffix (e.g. -2026) then re-append current year
  const baseSlug       = base.slug.replace(/-\d{4}$/, "");
  const resurrectedSlug = `${baseSlug}-complete-guide-${year}`;

  const resurrectedExists = await fileExistsOnGitHub(
    `data/blogs/${resurrectedSlug}.json`, token, owner, repo
  );

  if (!resurrectedExists) {
    log("info", "Resurrected topic", { slug: resurrectedSlug, base: base.slug });
    return {
      topic: {
        ...base,
        slug:    resurrectedSlug,
        keyword: `${base.keyword} — Complete ${year} Guide`,
      },
      nextTopicIndex: dayRotation,
      consumedKeyword: null,
      keywordsData,
    };
  }

  // Absolute last resort — should never reach here with 2665+ keywords in pool
  throw new Error("All topics already published — keyword pool may be fully exhausted");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth (fail-closed) ──────────────────────────────────────────────────────
  const denied = requireAuth(req);
  if (denied) {
    log("warn", "Unauthorized blog generation attempt");
    return denied;
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    log("error", "Missing GitHub env vars");
    return NextResponse.json({ success: false, reason: "GitHub env vars not set" }, { status: 500 });
  }

  log("info", "Blog generation started");

  // ── Select topic ──────────────────────────────────────────────────────────
  let selectedTopic: TopicInput;
  let nextTopicIndex: number;
  let consumedKeyword: Keyword | null;
  let keywordsData: KeywordsData | null;

  try {
    ({ topic: selectedTopic, nextTopicIndex, consumedKeyword, keywordsData } =
      await selectTopic(token, owner, repo));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", message);
    return NextResponse.json({ success: false, reason: message });
  }

  // ── Fetch blog index for internal link resolution ─────────────────────────
  const blogIndex = await readJsonFromGitHub<BlogIndex[]>(
    "data/index.json", token, owner, repo
  ) ?? [];

  // ── Resolve SEO brief (cache-first from pre-brief, parallel inline fallback)
  // This is the key to Bug 1: brief computation was blocking Groq for 23s.
  // Now pre-brief does this at 1 AM; generate-blog just reads the cache (1s).
  const seoBrief = await resolveBrief(selectedTopic, token, owner, repo);

  // ── Active niche pack drives prompt, template, threshold, monetization ─────
  const pack = getActivePack();
  const minWords = pack.thresholds.minWordCount;

  // ── Generate content ──────────────────────────────────────────────────────
  // Title-case helper: uppercases niche acronyms (FBR, POS, …) where relevant.
  const ALWAYS_UPPER = new Set(["fbr","pos","erp","qr","iris","gst","strn","api","sro","pk"]);
  const toTitleCase = (s: string) =>
    s.replace(/\w+/g, (w) =>
      ALWAYS_UPPER.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );

  let content: string;
  let faqs: BlogFaq[];
  let finalSlug:  string = selectedTopic.slug;
  let finalTitle: string = toTitleCase(selectedTopic.keyword);
  let finalMeta:  string = `${toTitleCase(selectedTopic.keyword)} — a practical, up-to-date guide.`;
  let source: "groq" | "template";

  // Diagnostics surfaced in the response so we can see WHY a run fell back to
  // template without needing the Vercel function logs.
  const diag: Record<string, unknown> = {
    keyword:       selectedTopic.keyword,
    briefResolved: seoBrief.length > 0,
    minWords,
  };

  try {
    log("info", "Attempting Groq generation", {
      keyword:     selectedTopic.keyword,
      hasBrief:    seoBrief.length > 0,
      briefSource: seoBrief.length > 0 ? "resolved" : "none",
    });
    const result  = await generateWithGroq(pack, selectedTopic, blogIndex, seoBrief);
    content    = result.blog.content ?? "";
    faqs       = result.blog.faqs   ?? getTemplateFaqs(selectedTopic);
    finalSlug  = result.blog.slug   ?? selectedTopic.slug;
    finalTitle = result.blog.title  ?? toTitleCase(selectedTopic.keyword);
    finalMeta  = result.blog.metaDescription ?? finalMeta;

    const words = countWords(content);
    diag.groqWords = words;
    log("info", "Groq generation complete", { words });

    if (words < minWords) {
      diag.fallbackReason = "groq_short";
      log("warn", "Groq output below minimum — using template", { words, minimum: minWords });
      content = generateTemplate(selectedTopic);
      faqs    = getTemplateFaqs(selectedTopic);
      source  = "template";
    } else {
      source = "groq";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diag.fallbackReason = "groq_error";
    diag.groqError = message.slice(0, 300);
    log("warn", "Groq failed — using template fallback", { error: message, keyword: selectedTopic.keyword });
    console.error(JSON.stringify({
      ts:      new Date().toISOString(),
      event:   "groq_generation_failed",
      error:   message,
      keyword: selectedTopic.keyword,
    }));
    content = generateTemplate(selectedTopic);
    faqs    = getTemplateFaqs(selectedTopic);
    source  = "template";
  }

  const finalWords = countWords(content);

  // ── Quality gate ──────────────────────────────────────────────────────────
  const quality = validateContent(content, faqs, finalTitle, minWords);
  if (source === "groq") {
    diag.qualityScore    = quality.total;
    diag.qualityFailures = quality.failureReasons;
  }
  log("info", "Quality gate result", {
    score:          quality.total,
    passed:         quality.passed,
    words:          quality.wordCount,
    faqs:           quality.faqCount,
    internalLinks:  quality.internalLinkCount,
    failures:       quality.failureReasons,
  });

  if (!quality.passed) {
    // Attempt template as final fallback before rejecting
    if (source === "groq") {
      diag.fallbackReason = "quality_failed";
      log("warn", "Quality gate failed on Groq output — falling back to template", {
        score: quality.total, reasons: quality.failureReasons,
      });
      content = generateTemplate(selectedTopic);
      faqs    = getTemplateFaqs(selectedTopic);
      source  = "template";
      // Re-run quality check on template (template should always pass)
      const templateQuality = validateContent(content, faqs, finalTitle, minWords);
      if (!templateQuality.passed) {
        log("error", "Quality gate failed even on template fallback", { score: templateQuality.total });
        return NextResponse.json(
          { success: false, reason: "Content failed quality gate", score: templateQuality.total, failures: templateQuality.failureReasons },
          { status: 500 }
        );
      }
    } else {
      log("error", "Content below quality threshold", { score: quality.total, failures: quality.failureReasons });
      return NextResponse.json(
        { success: false, reason: "Content failed quality gate", score: quality.total, failures: quality.failureReasons },
        { status: 500 }
      );
    }
  }

  if (finalWords < minWords) {
    log("error", "Content below minimum after fallback", { words: finalWords });
    return NextResponse.json(
      { success: false, reason: "Content below minimum word count", words: finalWords },
      { status: 500 }
    );
  }

  // ── Build blog object ─────────────────────────────────────────────────────
  const siteConfig = getSiteConfig();

  // ── Fetch hero image (non-blocking — fails gracefully if API key missing) ──
  const heroImage = await fetchHeroImage(selectedTopic.keyword).catch(() => null);
  if (heroImage) {
    log("info", "Hero image fetched", { photographer: heroImage.photographer, query: selectedTopic.keyword });
  } else {
    log("info", "No hero image (PEXELS_API_KEY not set or fetch failed — continuing)");
  }

  // Inject related posts block + Schema.org markup before saving
  const contentWithRelated = injectRelatedPosts(
    content,
    { slug: finalSlug, keywords: [...selectedTopic.keywords] },
    blogIndex
  );

  const now = new Date().toISOString();
  const partialBlog = {
    slug:            finalSlug,
    title:           finalTitle,
    metaDescription: finalMeta.slice(0, 155),
    keywords:        [...selectedTopic.keywords],
    content:         contentWithRelated,
    publishedAt:     now,
    readTime:        Math.max(1, Math.ceil(finalWords / 200)),
    faqs,
    authorName:      siteConfig.authorName,
    ...(heroImage ? { heroImage } : {}),
  };

  const contentWithSchema = injectSchema(
    contentWithRelated,
    partialBlog,
    siteConfig.baseUrl,
    siteConfig.name,
    siteConfig.authorName
  );

  // ── Monetization (pack-driven) ────────────────────────────────────────────
  // AdSense packs get reader-first ad slots; lead-gen packs get the smart CTA.
  const contentWithCTA = isAdSense(pack)
    ? injectAdSlots(contentWithSchema, pack)
    : injectCTA(
        contentWithSchema,
        { cluster: selectedTopic.cluster, keywords: [...selectedTopic.keywords] },
        siteConfig
      );

  // ── Phase 4: HTML performance optimization ─────────────────────────────────
  const { html: optimizedContent } = optimizeContent(contentWithCTA);

  const blog: BlogPost = {
    slug:            finalSlug,
    title:           finalTitle,
    metaDescription: finalMeta.slice(0, 155),
    keywords:        [...selectedTopic.keywords],
    content:         optimizedContent,
    faqs,
    publishedAt:     now,
    readTime:        Math.max(1, Math.ceil(finalWords / 200)),
    version:         1,
    authorName:      siteConfig.authorName,
    ...(heroImage ? { heroImage } : {}),
  };

  // ── Build file set for atomic commit ──────────────────────────────────────
  const { content: _c, ...indexEntry } = blog;
  const currentIndex = blogIndex;
  const alreadyInIndex = currentIndex.some((b) => b.slug === blog.slug);
  const updatedIndex: BlogIndex[] = alreadyInIndex
    ? currentIndex
    : [indexEntry, ...currentIndex];

  const updatedMeta: MetaJson = {
    lastTopicIndex: nextTopicIndex === -1
      ? ((await readJsonFromGitHub<MetaJson>("data/meta.json", token, owner, repo))?.lastTopicIndex ?? -1)
      : nextTopicIndex,
  };

  const files: Array<{ path: string; content: string }> = [
    { path: `data/blogs/${blog.slug}.json`, content: JSON.stringify(blog,         null, 2) },
    { path: "data/index.json",             content: JSON.stringify(updatedIndex,  null, 2) },
    { path: "data/meta.json",              content: JSON.stringify(updatedMeta,   null, 2) },
  ];

  // Mark keyword as used in keywords.json (if we pulled from the pool)
  if (consumedKeyword && keywordsData) {
    const updatedKeywordsData: KeywordsData = {
      ...keywordsData,
      keywords: keywordsData.keywords.map((k) =>
        k.keyword === consumedKeyword!.keyword
          ? { ...k, used: true, usedIn: blog.slug }
          : k
      ),
    };
    files.push({
      path: "data/keywords.json",
      content: JSON.stringify(updatedKeywordsData, null, 2),
    });
  }

  // ── Single atomic commit ──────────────────────────────────────────────────
  try {
    await atomicCommit(
      files,
      `blog: add "${blog.title}"`,
      token, owner, repo, branch
    );
    log("info", "Blog committed to GitHub", {
      slug: blog.slug,
      source,
      words: finalWords,
      filesCommitted: files.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "GitHub commit failed", { slug: blog.slug, error: message });
    return NextResponse.json(
      { success: false, reason: "GitHub commit failed", error: message },
      { status: 500 }
    );
  }

  // ── Revalidate ISR caches ─────────────────────────────────────────────────
  try {
    revalidatePath("/blog");
    revalidatePath(`/blog/${blog.slug}`);
    revalidatePath("/sitemap.xml");
    log("info", "Revalidated ISR caches");
  } catch (err) {
    log("warn", "revalidatePath failed (non-fatal)", { error: String(err) });
  }

  // ── Phase 4: Google Indexing API (fire-and-forget) ─────────────────────────
  {
    const blogUrl = `${siteConfig.baseUrl.replace(/\/$/, "")}/blog/${blog.slug}`;
    const existingIndexData = (await readJsonFromGitHub<IndexingData>(
      "data/indexing.json", token, owner, repo
    )) ?? defaultIndexingData();

    if (!wasRecentlySubmitted(blogUrl, existingIndexData)) {
      batchSubmitUrls([blogUrl], existingIndexData).then(({ data: updatedIndex }) => {
        atomicCommit(
          [{ path: "data/indexing.json", content: JSON.stringify(updatedIndex, null, 2) }],
          `chore: submit "${blog.slug}" to Google Indexing API`,
          token, owner, repo, branch
        ).catch(() => { /* non-fatal */ });
      }).catch(() => { /* non-fatal */ });
      log("info", "Google Indexing API submission queued", { slug: blog.slug, url: blogUrl });
    }
  }

  // ── Phase 4: Social Distribution (fire-and-forget via /api/distribute) ─────
  {
    const baseUrl   = process.env.SITE_BASE_URL ?? process.env.VERCEL_URL ?? "";
    const publicUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
    const distUrl   = `${publicUrl.replace(/\/$/, "")}/api/distribute?slug=${blog.slug}`;
    const secret    = process.env.CRON_SECRET ?? "";

    fetch(distUrl, { headers: { Authorization: `Bearer ${secret}` } })
      .catch(() => { /* non-fatal */ });

    log("info", "Distribution triggered", { slug: blog.slug });
  }

  return NextResponse.json({
    success:  true,
    slug:     blog.slug,
    title:    blog.title,
    source,
    words:    finalWords,
    readTime: blog.readTime,
    fromKeywordPool: consumedKeyword !== null,
    diag:     { ...diag, fallbackReason: diag.fallbackReason ?? "none" },
  });
}
