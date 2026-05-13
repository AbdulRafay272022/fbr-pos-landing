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
import { pickBestKeyword, slugifyKeyword, clusterToIndustry } from "@/lib/keywordEngine";
import { validateContent } from "@/lib/agent/qualityGate";
import { isSimilarToExisting, buildExistingTopicsList } from "@/lib/agent/duplicateDetector";
import { autoLink, injectRelatedPosts } from "@/lib/agent/autoLinker";
import { injectSchema } from "@/lib/agent/schemaGenerator";
import { getSiteConfig } from "@/lib/agent/siteConfig";
import { optimizeContent } from "@/lib/agent/performance";
import { injectCTA } from "@/lib/agent/ctaInjector";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const WA_NUMBER      = "923118366981";
const MIN_WORD_COUNT = 1200;
const BASE_URL       = "https://phelixerp.online";
void BASE_URL; // suppress unused warning

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

// ─── Hardcoded fallback topics ────────────────────────────────────────────────

const BLOG_TOPICS: TopicInput[] = [
  {
    keyword:      "FBR POS System for Pharmacies in Pakistan",
    slug:         "fbr-pos-system-pharmacies-pakistan-2026",
    industry:     "Pharmacy / Medical Retail",
    businessType: "pharmacy",
    keywords:     ["pharmacy POS Pakistan", "FBR POS pharmacy Pakistan", "medical store POS FBR"],
    internalTopics: ["FBR POS integration", "FBR invoice validation API", "FBR compliance checklist"],
  },
  {
    keyword:      "How to Generate FBR QR Invoices in Pakistan",
    slug:         "generate-fbr-qr-invoices-pakistan",
    industry:     "General Retail",
    businessType: "general",
    keywords:     ["FBR QR invoice Pakistan", "QR invoice generator Pakistan", "FBR invoice QR code"],
    internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR e-invoicing"],
  },
  {
    keyword:      "FBR POS System for Restaurants in Pakistan",
    slug:         "fbr-pos-system-restaurants-pakistan-2026",
    industry:     "Food & Beverage",
    businessType: "restaurant",
    keywords:     ["restaurant POS Pakistan", "FBR POS restaurant", "food business FBR compliance Pakistan"],
    internalTopics: ["FBR POS integration", "FBR compliance checklist", "FBR e-invoicing"],
  },
  {
    keyword:      "FBR Compliant POS System for Karachi Businesses",
    slug:         "fbr-pos-system-karachi-businesses",
    industry:     "Retail / General (Karachi)",
    businessType: "general",
    keywords:     ["POS system Karachi", "FBR POS Karachi", "Karachi retail POS software"],
    internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR compliance checklist"],
  },
  {
    keyword:      "FBR Compliant POS System for Lahore Retailers",
    slug:         "fbr-pos-system-lahore-retailers-2026",
    industry:     "Retail / General (Lahore)",
    businessType: "general",
    keywords:     ["POS system Lahore", "FBR POS Lahore", "Lahore retail POS software"],
    internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR compliance checklist"],
  },
  {
    keyword:      "How FBR POS Integration Simplifies Monthly Sales Tax Returns in Pakistan",
    slug:         "fbr-pos-integration-monthly-sales-tax-returns-pakistan",
    industry:     "General Business",
    businessType: "general",
    keywords:     ["FBR sales tax return Pakistan", "monthly tax filing Pakistan", "FBR POS tax filing"],
    internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR e-invoicing"],
  },
  {
    keyword:      "Retail Inventory Management with FBR POS System in Pakistan",
    slug:         "retail-inventory-management-fbr-pos-pakistan",
    industry:     "Retail",
    businessType: "retail",
    keywords:     ["retail inventory management Pakistan", "inventory tracking Pakistan", "POS inventory system Pakistan"],
    internalTopics: ["FBR POS integration", "multi-branch POS", "FBR compliance checklist"],
  },
  {
    keyword:      "FBR Compliance Checklist for Pakistani Businesses 2026",
    slug:         "fbr-compliance-checklist-pakistan-businesses-2026",
    industry:     "General Business",
    businessType: "general",
    keywords:     ["FBR compliance checklist Pakistan", "FBR requirements 2026", "FBR compliance Pakistan business"],
    internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR e-invoicing"],
  },
  {
    keyword:      "Multi-Branch POS System Pakistan with FBR Compliance",
    slug:         "multi-branch-pos-system-pakistan-fbr-compliance",
    industry:     "Retail Chains",
    businessType: "retail",
    keywords:     ["multi branch POS Pakistan", "chain store POS Pakistan", "FBR POS multiple branches"],
    internalTopics: ["FBR POS integration", "retail inventory management", "FBR compliance checklist"],
  },
  {
    keyword:      "Cloud-Based FBR POS System Benefits for Pakistani Businesses",
    slug:         "cloud-fbr-pos-system-benefits-pakistan",
    industry:     "General Business",
    businessType: "general",
    keywords:     ["cloud POS Pakistan", "cloud based POS FBR Pakistan", "online POS system Pakistan"],
    internalTopics: ["FBR POS integration", "FBR IRIS portal", "multi-branch POS"],
  },
  {
    keyword:      "FBR POS Compliance for Wholesale Distributors in Pakistan",
    slug:         "fbr-pos-compliance-wholesale-distributors-pakistan",
    industry:     "Wholesale / Distribution",
    businessType: "wholesale",
    keywords:     ["wholesale POS Pakistan", "FBR distributor compliance", "wholesale FBR invoicing Pakistan"],
    internalTopics: ["FBR POS integration", "FBR e-invoicing", "FBR IRIS portal"],
  },
  {
    keyword:      "FBR IRIS Portal Pakistan Complete Guide to POS Registration",
    slug:         "fbr-iris-portal-pakistan-pos-registration-guide",
    industry:     "General Business",
    businessType: "general",
    keywords:     ["FBR IRIS portal Pakistan", "IRIS POS registration", "FBR IRIS integration guide"],
    internalTopics: ["FBR POS integration", "FBR e-invoicing", "FBR compliance checklist"],
  },
];

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert SEO strategist, content writer, and conversion optimizer specializing in Pakistan business compliance, FBR POS systems, ERPNext integrations, and tax workflows.

Your job is to generate HIGH-RANKING, PRACTICAL, NON-GENERIC blog content that ranks on Google and drives real business conversions for Phelix ERP.

STRICT RULES — NEVER BREAK THESE:
- NO generic AI phrases ("in today's world", "in conclusion", "it is worth noting", etc.)
- NO repetition across sections
- NO keyword stuffing — use keywords naturally
- NO vague explanations — every claim must be specific and actionable
- MUST include real-world examples from Pakistani businesses (pharmacy, retail, restaurant, textile)
- MUST mention at least 2 Pakistani cities (Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan)
- MUST include technical insights (API behavior, token expiry, sync issues, FBR IRIS quirks)
- MUST include practical implementation steps with real tools
- MUST include mistakes businesses actually make — not generic advice

MANDATORY CONTENT STRUCTURE (minimum 1500 words):
1. Introduction — hook with a real problem, compliance risk, or business impact (150–200 words)
2. What the law says — reference FBR rules and SROs specifically
3. Step-by-step implementation guide — numbered, 6–8 steps, real tools mentioned
4. Real-world example — show an actual workflow (pharmacy, retail, restaurant, SME in a named city)
5. Common mistakes — 5+ technical and operational mistakes with specific consequences
6. Technical implementation insights — API level: token refresh, offline queue, timestamp accuracy
7. Benefits of compliance — 5+ business-focused outcomes with quantified impact
8. FAQs — 5–8 high-intent questions with specific, actionable answers
9. Conclusion + CTA — trust-building, mentions Phelix ERP and WhatsApp demo

SEO RULES:
- Use main keyword in first 100 words and in 2–3 H2 headings
- Keep paragraphs under 4 lines
- Use bullet/numbered lists for 3+ items
- LSI keywords: use naturally throughout (IRIS, STRN, QR invoice, SRO, Tier-1, POS terminal)

FEATURED SNIPPET OPTIMISATION (mandatory):
- Start the introduction with a concise 40–60 word definition paragraph that directly answers "what is [keyword]" — Google uses this as the featured snippet
- After each H2 section, add a "Key Takeaway:" sentence summarising the section in under 25 words
- Include at least ONE comparison table (markdown pipe format) comparing options, tools, or tiers
- Include at least ONE numbered step-by-step process block (numbered list, 5+ steps)
- The FAQ section MUST have the question as the exact heading (##) and the answer as the first paragraph under it — this targets FAQ rich results

INTERNAL LINKING:
- Insert [INTERNAL_LINK: topic name] at least 3 times within paragraph text (not standalone)
- Topics to link: "FBR POS integration", "FBR compliance checklist", "FBR e-invoicing", "FBR IRIS portal"

CONTENT QUALITY GATES:
- Minimum 1500 words in content_markdown
- Must mention FBR IRIS at least twice
- Must mention at least one specific penalty amount (PKR)
- Must include at least one technical API detail
- Must include one comparison table
- Must include one numbered process (5+ steps)

OUTPUT FORMAT — RETURN JSON ONLY. NO text before or after. NO markdown code blocks:
{
  "title": "exact H1 title with keyword — keep under 70 chars",
  "slug": "url-slug-here",
  "meta_description": "155 chars max, includes keyword and clear value proposition",
  "content_markdown": "full blog content in markdown with [INTERNAL_LINK: topic] placeholders",
  "faq": [
    { "question": "...", "answer": "..." }
  ],
  "internal_links": ["topic1", "topic2", "topic3"],
  "keywords_used": ["keyword1", "keyword2", "keyword3"]
}`;

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

  function closeList() {
    if (inUl) { output.push("</ul>"); inUl = false; }
    if (inOl) { output.push("</ol>"); inOl = false; }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

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

// ─── Groq generation ──────────────────────────────────────────────────────────

async function generateWithGroq(
  topic: TopicInput,
  blogIndex: BlogIndex[]
): Promise<{ blog: Partial<BlogPost>; keywords: string[] }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const internalTopicSuggestions = topic.internalTopics.slice(0, 3).join('", "');

  // ── SERP-based brief (senior-SEO mode) ────────────────────────────────────
  // Priority 1: Serper SERP intelligence (real top-10 analysis)
  // Priority 2: DataForSEO brief (legacy)
  // Priority 3: keyword-only generation (no brief)
  let seoBrief = "";
  try {
    if (process.env.SERPER_API_KEY) {
      // PRIMARY: Serper-based SERP intelligence
      const { analyzeSerpIntelligence, buildIntelligentBrief } = await import("@/lib/agent/serpIntelligence");
      const { getCountryCode } = await import("@/lib/agent/keywordDiscovery");
      const country = process.env.SITE_COUNTRY ?? "Pakistan";
      const analysis = await analyzeSerpIntelligence(topic.keyword, getCountryCode(country));
      if (analysis) {
        seoBrief = buildIntelligentBrief(analysis);
        // Scrape top-3 competitors for deeper content brief
        try {
          const { extractCompetitorProfiles, buildCompetitorBrief } = await import("@/lib/agent/competitorScraper");
          const topUrls = analysis.competitors.slice(0, 3).map((c) => c.url).filter(Boolean);
          if (topUrls.length > 0) {
            const profile = await extractCompetitorProfiles(topUrls, 3);
            const compBrief = buildCompetitorBrief(profile);
            if (compBrief) seoBrief += "\n\n" + compBrief;
          }
        } catch { /* non-fatal */ }
        // Add semantic entity coverage from Wikidata + niche dictionary
        try {
          const { buildEntityCoverage, buildEntityBrief } = await import("@/lib/agent/entityGraph");
          const siteCfg = getSiteConfig();
          const coverage = await buildEntityCoverage(topic.keyword, siteCfg.niche, siteCfg.seedKeywords);
          const entityBrief = buildEntityBrief(coverage);
          if (entityBrief) seoBrief += "\n\n" + entityBrief;
        } catch { /* non-fatal */ }
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          event: "serp_intelligence_brief",
          keyword: topic.keyword,
          difficulty: analysis.difficulty,
          rankability: analysis.rankability,
          intent: analysis.intent,
          contentType: analysis.recommendedContentType,
        }));
      }
    } else {
      // FALLBACK: DataForSEO brief generator
      const { getSeoFeatures } = await import("@/lib/agent/seo/features");
      if (getSeoFeatures().serpAnalysis) {
        const { generateBrief, briefToPrompt } = await import("@/lib/agent/seo/briefGenerator");
        const briefResult = await generateBrief({
          keyword:      topic.keyword,
          blogIndex:    blogIndex.map((b) => ({ slug: b.slug, title: b.title })),
          locationCode: process.env.RANK_TRACK_LOCATION ? parseInt(process.env.RANK_TRACK_LOCATION, 10) : undefined,
          languageCode: process.env.RANK_TRACK_LANGUAGE ?? "en",
          scrapeDepth:  parseInt(process.env.BRIEF_SCRAPE_DEPTH ?? "3", 10),
        });
        if (briefResult.ok) {
          seoBrief = briefToPrompt(briefResult.brief);
        }
      }
    }
  } catch (err) {
    // Brief generation is optional — never block content creation
    console.warn(JSON.stringify({ ts: new Date().toISOString(), event: "brief_skipped", error: err instanceof Error ? err.message : String(err) }));
  }

  // Cap SEO brief to ~1000 chars to keep input tokens under control
  const cappedBrief = seoBrief ? seoBrief.slice(0, 1000) : undefined;

  const userInput = JSON.stringify({
    seo_brief: cappedBrief || undefined,
    keyword:         topic.keyword,
    target_slug:     topic.slug,
    industry:        topic.industry,
    region:          "Pakistan",
    site_name:       "Phelix ERP",
    cta_whatsapp:    `https://wa.me/${WA_NUMBER}`,
    cta_text:        "Get Phelix ERP set up in 24 hours — free WhatsApp demo, no commitment",
    internal_topics: topic.internalTopics,
    published_blogs: blogIndex.slice(0, 8).map((b) => ({ slug: b.slug, title: b.title })),
    note: [
      "Write minimum 1500 words.",
      `Use [INTERNAL_LINK: "${internalTopicSuggestions}"] naturally in paragraph text.`,
      "Mention Karachi, Lahore, or another Pakistani city with a real business scenario.",
      "Include a specific PKR penalty amount.",
      "Include one technical API detail about FBR IRIS.",
      "Return JSON ONLY — no markdown fences, no preamble.",
    ].join(" "),
  }, null, 2);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userInput },
      ],
      max_tokens:  8000,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(55_000),
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

  // Log token usage to help diagnose truncation
  console.warn(JSON.stringify({
    ts: new Date().toISOString(),
    event: "groq_usage",
    prompt_tokens:     data.usage?.prompt_tokens,
    completion_tokens: data.usage?.completion_tokens,
    raw_length:        rawContent.length,
    keyword:           topic.keyword,
  }));

  // Strip markdown code fences if model wrapped its output
  rawContent = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  // Escape ALL control characters (U+0000-U+001F) inside JSON string values.
  // Groq sometimes embeds raw newlines, tabs, form-feeds, etc. in HTML content.
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
    // Count open vs closed braces/brackets to close any unclosed structures
    let openBraces   = 0;
    let openBrackets = 0;
    let inString     = false;
    let escaped      = false;
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
    // Close any unclosed strings, arrays, objects
    if (inString)       repairedContent += '"';
    for (let i = 0; i < openBrackets; i++) repairedContent += "]";
    for (let i = 0; i < openBraces;   i++) repairedContent += "}";
    if (repairedContent !== rawContent) {
      console.warn(JSON.stringify({
        ts: new Date().toISOString(),
        event: "groq_json_repaired",
        original_tail: rawContent.slice(-120),
        repaired_tail: repairedContent.slice(-120),
      }));
    }
  }

  let parsed: GroqBlogJson;
  try {
    parsed = JSON.parse(repairedContent) as GroqBlogJson;
  } catch (parseErr) {
    // Log raw content tail for debugging then re-throw so outer catch uses template
    console.error(JSON.stringify({
      ts:    new Date().toISOString(),
      event: "groq_json_parse_failed",
      error: String(parseErr),
      raw_tail: rawContent.slice(-300),
    }));
    throw new Error(`Groq JSON parse failed: ${String(parseErr)}`);
  }

  const aiSlug  = parsed.slug && isValidSlug(parsed.slug) ? parsed.slug : topic.slug;

  let htmlContent = markdownToHtml(parsed.content_markdown ?? "");
  // Replace explicit placeholders first, then run the deterministic auto-linker
  htmlContent = replaceInternalLinks(htmlContent, blogIndex);
  htmlContent = autoLink(htmlContent, blogIndex, aiSlug);

  // Append WhatsApp CTA if not already present
  if (!htmlContent.includes("wa.me")) {
    htmlContent += `\n<div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;padding:24px;margin:32px 0;"><p style="font-weight:700;font-size:18px;margin:0 0 8px;">Get FBR compliant in 24 hours.</p><p style="margin:0 0 16px;color:#374151;">Our team handles the complete FBR IRIS setup. Free demo on WhatsApp — we respond in minutes.</p><a href="https://wa.me/${WA_NUMBER}" style="background:#25D366;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">Start Free WhatsApp Demo</a></div>`;
  }

  const faqs: BlogFaq[] = (parsed.faq ?? []).map((f) => ({
    question: f.question,
    answer:   f.answer,
  }));
  const aiTitle = parsed.title?.trim() || topic.keyword;
  const aiMeta  = parsed.meta_description?.slice(0, 155) ||
    `${topic.keyword} — complete FBR compliance guide for Pakistani businesses.`;

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

function generateTemplate(topic: TopicInput): string {
  const keyword = topic.keywords[0] ?? topic.keyword;
  return `<h2>Understanding ${topic.keyword}</h2>
<p>Pakistan's Federal Board of Revenue (FBR) has fundamentally changed how businesses must operate. With the mandatory POS integration requirement actively enforced across Karachi, Lahore, Islamabad, Rawalpindi, and Faisalabad, business owners who delay compliance face serious financial and legal consequences. This guide explains everything about ${topic.keyword.toLowerCase()}, helping you stay compliant, avoid penalties, and run your business more efficiently.</p>
<p>Whether you are a first-time entrepreneur or an established retailer, understanding your obligations under the FBR POS system is no longer optional. FBR inspections intensified significantly in 2025 and 2026, with non-compliant businesses facing fines, STRN suspension, and forced closures.</p>

<h2>What FBR Law Requires</h2>
<p>The FBR POS integration mandate was introduced under SRO 1006(I)/2019 and has been progressively expanded. Every sale must be submitted to FBR IRIS in real time, a QR-coded invoice must be generated for the customer, and sales tax must be calculated and submitted without manual intervention.</p>
<p>Businesses that operate outside this system are in violation of the Sales Tax Act. FBR has made clear that enforcement will continue to expand — if your business holds an STRN, assume POS integration is already required or will be soon.</p>

<h2>Who Must Comply</h2>
<ul>
<li><strong>Tier-1 Retailers</strong> – Businesses with annual turnover above the FBR threshold</li>
<li><strong>Chain Stores and Franchises</strong> – Any business operating from multiple locations</li>
<li><strong>Pharmacies and Medical Stores</strong> – Especially in Karachi, Lahore, Islamabad</li>
<li><strong>Restaurants and Food Businesses</strong> – Dine-in restaurants and fast food outlets registered for sales tax</li>
<li><strong>Wholesale Distributors</strong> – Distributors with an STRN supplying goods to retailers</li>
</ul>

<h2>Step-by-Step: Getting Compliant with ${topic.keyword}</h2>
<ol>
<li><strong>Verify your STRN</strong> — Log in to iris.fbr.gov.pk and confirm your Sales Tax Registration Number is active</li>
<li><strong>Choose FBR-compatible software</strong> — Not every POS supports IRIS integration; verify API compatibility before committing</li>
<li><strong>Register on IRIS POS portal</strong> — Enter your STRN, address, and number of terminals to receive API credentials</li>
<li><strong>Configure your integration</strong> — Phelix ERP handles API key setup, tax rate mapping, and real-time sync configuration</li>
<li><strong>Run test transactions</strong> — Verify at least five invoices appear in your IRIS dashboard before going live</li>
<li><strong>Configure offline sync</strong> — Set up local queue so transactions during internet outages are stamped correctly and sync automatically</li>
<li><strong>Train staff</strong> — Basic training takes 20–30 minutes; FBR compliance runs automatically in the background</li>
<li><strong>Monitor monthly</strong> — Review your IRIS dashboard at least once per month to catch any rejected invoices early</li>
</ol>

<h2>Real-World Example: A Lahore Pharmacy</h2>
<p>A pharmacy in Gulberg, Lahore integrated with FBR IRIS through Phelix ERP in under 24 hours. Before integration, they manually prepared monthly sales tax returns — a 2–3 day process involving spreadsheet compilation and accountant review. After integration, their monthly return is pre-filled from POS data and takes under 30 minutes to review and submit.</p>
<p>Beyond compliance, they discovered that 8% of monthly revenue was previously unrecorded due to staff-handled cash sales — the QR invoicing requirement eliminated this entirely. A similar pharmacy in Karachi's Saddar area reported a 12% reduction in accountant fees within the first quarter.</p>

<h2>Common Mistakes Businesses Make</h2>
<ul>
<li><strong>Using non-approved POS software</strong> — Generic apps from app stores are almost never IRIS-integrated. Always verify API connectivity before purchase.</li>
<li><strong>Ignoring offline sync</strong> — Transactions during internet outages must automatically sync to FBR when connectivity returns. Many businesses don't configure this correctly, leading to missing invoices.</li>
<li><strong>Wrong tax rate configuration</strong> — Applying standard 17% to exempt or zero-rated items results in overcharging and incorrect FBR submissions, triggering audits.</li>
<li><strong>Token expiry handling</strong> — FBR IRIS uses session tokens that expire every 60 minutes. POS systems that don't auto-refresh before expiry cause silent submission failures.</li>
<li><strong>Skipping test transactions</strong> — Going live without verifying IRIS receipt of test invoices means your first real customer sales may never reach FBR.</li>
<li><strong>Treating setup as one-time</strong> — FBR requirements evolve. Your POS provider must push regular updates. Software that hasn't updated in 12+ months is a compliance risk.</li>
<li><strong>Incorrect timestamp on offline sync</strong> — Batching queued invoices with the reconnection timestamp (rather than original sale timestamp) creates audit discrepancies that FBR flags automatically.</li>
</ul>

<h2>Technical Implementation Insights</h2>
<p>At the API level, FBR IRIS uses token-based authentication that expires every 60 minutes. A common failure point is POS systems that cache the initial token indefinitely — this causes silent invoice submission failures after the first hour. Proper implementation requires proactive token refresh 5 minutes before expiry, not on-failure retry.</p>
<p>During internet outages, invoices queued locally must be submitted in chronological order with correct original timestamps when connectivity returns. Systems that batch-submit with the reconnection timestamp create audit discrepancies that FBR's automated monitoring flags within 48 hours.</p>
<p>Another technical consideration: FBR IRIS has rate limits on its invoice submission API. High-volume businesses (200+ transactions/day) must implement request queuing with exponential backoff to prevent submission failures during peak hours.</p>

<h2>Benefits of Full FBR Compliance for ${keyword} Businesses</h2>
<ul>
<li><strong>Automated bookkeeping</strong> – Every transaction is digitally recorded; no manual entries or human error</li>
<li><strong>Simplified tax filing</strong> – Monthly sales tax returns are pre-filled from POS data, cutting accountant time by 70%+</li>
<li><strong>Real-time inventory tracking</strong> – Stock reduces automatically on every sale, preventing stockouts and overstocking</li>
<li><strong>Fraud elimination</strong> – QR invoicing makes unrecorded cash sales impossible; every transaction is tracked</li>
<li><strong>Audit readiness</strong> – Complete digital records mean FBR audits are resolved quickly with zero manual reconstruction</li>
<li><strong>Bank and investor credibility</strong> – Compliant digital records strengthen loan applications and investor confidence</li>
</ul>

<h2>FBR Penalties for Non-Compliance</h2>
<ul>
<li>First offense: PKR 10,000–25,000 fine + written warning</li>
<li>Repeated violations: PKR 100,000–1,000,000</li>
<li>Deliberate evasion: STRN suspension, business seal, criminal referral</li>
<li>Automatic audit trigger: non-integrated businesses are flagged in FBR's automated monitoring system</li>
</ul>

<h2>Frequently Asked Questions</h2>
<h3>Do I need special hardware for FBR POS integration?</h3>
<p>No. Phelix ERP runs on any Android phone, iPhone, tablet, or laptop. You do not need specialised POS terminals. A thermal printer is optional for physical receipts but not required for compliance — QR codes can be sent via WhatsApp or SMS.</p>
<h3>What happens if my internet goes down during billing?</h3>
<p>Phelix ERP stores transactions locally during outages and automatically syncs them to FBR IRIS with correct original timestamps when connectivity returns — maintaining full compliance without manual intervention.</p>
<h3>How long does the full setup take?</h3>
<p>Phelix ERP completes the full setup — IRIS registration, API integration, tax rate configuration, and staff training — within 24 hours of sign-up. Most businesses are live the same day.</p>
<h3>What are the FBR penalties for non-compliance?</h3>
<p>Fines start at PKR 10,000 for a first offense and can reach PKR 1,000,000 for repeated violations. Deliberate evasion results in STRN suspension, business closure, and potential criminal referral.</p>
<h3>Is Phelix ERP officially FBR approved?</h3>
<p>Phelix ERP integrates directly with the FBR IRIS API using official endpoints. Every invoice generated carries a valid FBR verification QR code, confirming proper submission to FBR.</p>

<h2>Get ${topic.keyword} Solved Today with Phelix ERP</h2>
<p>Phelix ERP serves 20+ businesses across Karachi, Lahore, Islamabad, Faisalabad, and Rawalpindi. Plans start at PKR 1,500/month — less than the cost of a single FBR fine. Our team handles the complete integration and you go live within 24 hours.</p>

<div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;padding:24px;margin:32px 0;">
<p style="font-weight:700;font-size:18px;margin:0 0 8px;">Ready to get compliant in 24 hours?</p>
<p style="margin:0 0 16px;color:#374151;">Our team handles FBR IRIS setup, QR invoicing, and staff training. Free WhatsApp demo — we respond in minutes.</p>
<a href="https://wa.me/${WA_NUMBER}" style="background:#25D366;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">Start Free WhatsApp Demo</a>
</div>`;
}

function getTemplateFaqs(topic: TopicInput): BlogFaq[] {
  return [
    {
      question: `Do I need special hardware for ${topic.keyword}?`,
      answer:   "No. Phelix ERP runs on any Android phone, iPhone, tablet, or laptop. No specialised POS terminals required.",
    },
    {
      question: "What happens if my internet goes down during billing?",
      answer:   "Phelix ERP stores transactions locally during outages and automatically syncs them to FBR IRIS with correct timestamps when connectivity returns.",
    },
    {
      question: "How long does FBR POS setup take?",
      answer:   "Phelix ERP completes the full setup — IRIS registration, API integration, and staff training — within 24 hours of sign-up.",
    },
    {
      question: "What are the FBR penalties for non-compliance?",
      answer:   "Fines start at PKR 10,000 for a first offense and can reach PKR 1,000,000 for repeated violations, plus STRN suspension and forced business closure.",
    },
    {
      question: "Is Phelix ERP officially FBR approved?",
      answer:   "Phelix ERP integrates directly with the FBR IRIS API using official endpoints. Every invoice carries a valid FBR QR code confirming proper submission.",
    },
  ];
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

    // Load GSC data once for SERP-aware validation
    let seoData = null;
    try {
      const { readJsonFromGitHub: readJson } = await import("@/lib/githubApi");
      seoData = await readJson("data/seo.json", token, owner, repo);
    } catch { /* non-fatal */ }

    const useSerperValidation = !!process.env.SERPER_API_KEY;
    if (useSerperValidation) {
      log("info", "SERP validation enabled — picking winnable keywords");
    }

    // Try cluster-picked keyword first, then fall back to priority order
    const unusedKeywords = keywordsData.keywords.filter((k) => !k.used);
    let candidates = unusedKeywords.slice(0, 15);
    if (clusterPick) {
      const clusterKw = unusedKeywords.find(
        (k) => k.keyword.toLowerCase() === clusterPick!.keyword.toLowerCase()
      );
      if (clusterKw) {
        candidates = [clusterKw, ...candidates.filter((c) => c.keyword !== clusterKw.keyword)];
      }
    }
    for (const bestKw of candidates) {
      // Step 1: Duplicate / cannibalization check (cheap, do first)
      const simResult = isSimilarToExisting(bestKw.keyword, existingTopics);
      if (simResult.isSimilar) {
        log("warn", "Keyword rejected — too similar to existing blog", {
          keyword:     bestKw.keyword,
          similarity:  simResult.score.toFixed(3),
          matchedWith: simResult.matchedWith.slice(0, 80),
        });
        continue;
      }

      const kwSlug = slugifyKeyword(bestKw.keyword);
      const exists = await fileExistsOnGitHub(`data/blogs/${kwSlug}.json`, token, owner, repo);
      if (exists) {
        log("info", "Keyword slug already published, trying next", { slug: kwSlug });
        continue;
      }

      // Step 2: SERP-aware validation (only if Serper available)
      if (useSerperValidation) {
        try {
          const { validateKeyword } = await import("@/lib/agent/keywordValidator");
          const country = process.env.SITE_COUNTRY ?? "Pakistan";
          const validation = await validateKeyword(
            bestKw.keyword,
            country,
            seoData as Parameters<typeof validateKeyword>[2],
            blogIdx
          );

          if (validation.verdict === "skip") {
            log("warn", "Keyword skipped by SERP validator", {
              keyword:    bestKw.keyword,
              reason:     validation.reason,
              difficulty: validation.analysis?.difficulty,
            });
            continue;
          }

          if (validation.verdict === "refresh") {
            // Already ranking — refresh-content cron will handle this. Skip new post.
            log("info", "Keyword already ranking — refresh handled separately", {
              keyword:    bestKw.keyword,
              currentPos: validation.analysis?.yourCurrentRanking,
              refreshSlug: validation.refreshSlug,
            });
            continue;
          }

          // verdict = write
          log("info", "Keyword passed SERP validation — WRITE", {
            keyword:     bestKw.keyword,
            difficulty:  validation.analysis?.difficulty,
            rankability: validation.analysis?.rankability,
            intent:      validation.analysis?.intent,
            reason:      validation.reason,
          });
        } catch (err) {
          log("warn", "SERP validation failed, proceeding without", { error: String(err) });
        }
      }

      // Passed all gates — return this topic
      log("info", "Topic selected", {
        keyword:    bestKw.keyword,
        priority:   bestKw.priority,
        cluster:    bestKw.cluster,
      });
      return {
        topic: {
          keyword:        bestKw.keyword,
          slug:           kwSlug,
          industry:       clusterToIndustry(bestKw.cluster),
          businessType:   bestKw.cluster,
          keywords:       [bestKw.keyword, `${bestKw.keyword} pakistan`, "fbr compliance pakistan"],
          internalTopics: ["FBR POS integration", "FBR compliance checklist", "FBR e-invoicing"],
        },
        nextTopicIndex: -1,
        consumedKeyword: bestKw,
        keywordsData,
      };
    }
  }

  // Fall back to BLOG_TOPICS sequential rotation
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

  throw new Error("All topics already published");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized blog generation attempt");
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

  // ── Generate content ──────────────────────────────────────────────────────
  // Title-case helper: "best fbr pos" → "Best FBR POS"
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
  let finalMeta:  string = `${toTitleCase(selectedTopic.keyword)} — complete guide for Pakistani businesses.`;
  let source: "groq" | "template";

  try {
    log("info", "Attempting Groq generation", { keyword: selectedTopic.keyword });
    const result  = await generateWithGroq(selectedTopic, blogIndex);
    content    = result.blog.content ?? "";
    faqs       = result.blog.faqs   ?? getTemplateFaqs(selectedTopic);
    finalSlug  = result.blog.slug   ?? selectedTopic.slug;
    finalTitle = result.blog.title  ?? toTitleCase(selectedTopic.keyword);
    finalMeta  = result.blog.metaDescription ?? finalMeta;

    const words = countWords(content);
    log("info", "Groq generation complete", { words });

    if (words < MIN_WORD_COUNT) {
      log("warn", "Groq output below minimum — using template", { words, minimum: MIN_WORD_COUNT });
      content = generateTemplate(selectedTopic);
      faqs    = getTemplateFaqs(selectedTopic);
      source  = "template";
    } else {
      source = "groq";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
  const quality = validateContent(content, faqs, finalTitle, MIN_WORD_COUNT);
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
      log("warn", "Quality gate failed on Groq output — falling back to template", {
        score: quality.total, reasons: quality.failureReasons,
      });
      content = generateTemplate(selectedTopic);
      faqs    = getTemplateFaqs(selectedTopic);
      source  = "template";
      // Re-run quality check on template (template should always pass)
      const templateQuality = validateContent(content, faqs, finalTitle, MIN_WORD_COUNT);
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

  if (finalWords < MIN_WORD_COUNT) {
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

  // ── Phase 4: Inject smart CTAs ────────────────────────────────────────────
  const contentWithCTA = injectCTA(
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
  });
}
