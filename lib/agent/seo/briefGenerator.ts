/**
 * lib/agent/seo/briefGenerator.ts
 *
 * Senior-SEO content brief generator.
 *
 * Most "AI blog tools" hallucinate from a keyword. A senior SEO writes
 * a brief by reverse-engineering the SERP:
 *   1. What does Google currently rank for this query? (top 10 SERP)
 *   2. What outline structure do winners share? (H2 extraction)
 *   3. What word-count floor is required? (max of top 10)
 *   4. What entities/topics do they all mention? (entity coverage)
 *   5. What questions do users ask? (PAA)
 *   6. What snippet is featured? (target it with a 50-word answer block)
 *
 * Result: a brief that, when followed, produces content competitive
 * enough to rank — instead of generic LLM filler.
 *
 * Cost: ~$0.005-0.01 per brief (1 SERP call + N on-page calls).
 */

import { getLiveSerp, getOnPageInstant } from "./dataforseo";

export interface ContentBrief {
  keyword:           string;
  intent:            "informational" | "commercial" | "transactional" | "navigational";
  /** Min word count to be competitive (max of top-10) */
  wordCountFloor:    number;
  /** Recommended target word count (median of top-10 + 20%) */
  wordCountTarget:   number;
  /** H2 outline derived from SERP winners */
  recommendedH2s:    string[];
  /** People Also Ask questions to address */
  peopleAlsoAsk:     string[];
  /** Featured-snippet target paragraph (write a 40-60 word answer for this) */
  featuredSnippetTarget?: { question: string; format: "paragraph" | "list" | "table" };
  /** Top 10 ranking URLs (for competitive reference) */
  topCompetitors:    Array<{ rank: number; url: string; title: string; wordCount: number }>;
  /** Entities frequently mentioned (must include in content for topical authority) */
  requiredEntities:  string[];
  /** Suggested internal-link anchors (slug + anchor text) */
  internalLinkSuggestions: Array<{ slug: string; anchor: string }>;
  /** Generated metadata */
  generatedAt:       string;
  /** Total cost spent generating this brief */
  cost:              number;
}

// ─── Intent classification ────────────────────────────────────────────────────

const TRANSACTIONAL_PATTERNS = /\b(buy|price|cost|pricing|hire|order|book|signup|free trial|discount|cheap|near me|for sale)\b/i;
const COMMERCIAL_PATTERNS    = /\b(best|top|review|vs|comparison|alternative|cheapest|software|tool|solution|services?)\b/i;
const NAVIGATIONAL_PATTERNS  = /\b(login|sign in|dashboard|portal|website)\b/i;
const INFORMATIONAL_PATTERNS = /\b(how|what|why|when|where|guide|tutorial|tips|examples?|definition|meaning)\b/i;

export function classifyIntent(keyword: string): ContentBrief["intent"] {
  if (TRANSACTIONAL_PATTERNS.test(keyword)) return "transactional";
  if (NAVIGATIONAL_PATTERNS.test(keyword))  return "navigational";
  if (COMMERCIAL_PATTERNS.test(keyword))    return "commercial";
  if (INFORMATIONAL_PATTERNS.test(keyword)) return "informational";
  return "informational"; // safe default
}

// ─── Entity / topic extraction ────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","of","to","in","on","at","for","with","by",
  "is","are","was","were","be","been","being","this","that","these","those","it",
  "as","from","you","your","we","our","their","they","i","me","my","not","can",
  "will","would","should","could","may","might","do","does","did","has","have","had",
]);

function extractEntitiesFromHeadings(headings: string[]): string[] {
  const counts = new Map<string, number>();
  for (const h of headings) {
    const tokens = h.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
    // bigrams + unigrams
    for (let i = 0; i < tokens.length; i++) {
      const uni = tokens[i];
      counts.set(uni, (counts.get(uni) ?? 0) + 1);
      if (i + 1 < tokens.length) {
        const bi = `${tokens[i]} ${tokens[i + 1]}`;
        counts.set(bi, (counts.get(bi) ?? 0) + 2); // weight bigrams 2x
      }
    }
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([phrase]) => phrase);
}

// ─── Common H2 detection ──────────────────────────────────────────────────────

function commonHeadings(allHeadings: string[][], minOccurrences = 2): string[] {
  const flat = allHeadings.flat().map((h) => h.trim()).filter(Boolean);
  const lowercaseFreq = new Map<string, { count: number; original: string }>();
  for (const h of flat) {
    const key = h.toLowerCase().replace(/\d{4}/g, "").trim();
    const existing = lowercaseFreq.get(key);
    if (existing) existing.count++;
    else lowercaseFreq.set(key, { count: 1, original: h });
  }
  return Array.from(lowercaseFreq.values())
    .filter((v) => v.count >= minOccurrences)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((v) => v.original);
}

// ─── PAA extraction from SERP items ───────────────────────────────────────────

interface SerpItemLike {
  type:           string;
  rank_absolute?: number;
  url?:           string;
  title?:         string;
  description?:   string;
  domain?:        string;
  items?:         Array<{ title?: string; question?: string; description?: string }>;
}

function extractPAA(items: SerpItemLike[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.type !== "people_also_ask") continue;
    const subs = it.items ?? [];
    for (const s of subs) {
      const q = s.title ?? s.question ?? "";
      if (q && !out.includes(q)) out.push(q);
    }
  }
  return out.slice(0, 8);
}

function extractFeaturedSnippet(items: SerpItemLike[], keyword: string):
  ContentBrief["featuredSnippetTarget"] | undefined {
  const fs = items.find((it) => it.type === "featured_snippet");
  if (!fs) return undefined;
  const desc = fs.description ?? "";
  const format: "paragraph" | "list" | "table" =
    /\d+\.|•|-/.test(desc) ? "list" : "paragraph";
  return { question: keyword, format };
}

// ─── Internal link suggestions (TF-IDF-lite) ──────────────────────────────────

interface BlogIndexEntry { slug: string; title: string; keywords?: string[] }

function suggestInternalLinks(
  keyword: string,
  blogIndex: BlogIndexEntry[],
  limit = 4,
): ContentBrief["internalLinkSuggestions"] {
  const kwTokens = new Set(keyword.toLowerCase().split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t)));
  const scored: Array<{ slug: string; anchor: string; score: number }> = [];
  for (const b of blogIndex) {
    const titleTokens = new Set(b.title.toLowerCase().split(/\s+/).filter((t) => t.length >= 3));
    let overlap = 0;
    for (const t of kwTokens) if (titleTokens.has(t)) overlap++;
    const kwOverlap = (b.keywords ?? []).filter((k) => kwTokens.has(k.toLowerCase())).length;
    const score = overlap * 2 + kwOverlap;
    if (score > 0) scored.push({ slug: b.slug, anchor: b.title, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ slug, anchor }) => ({ slug, anchor }));
}

// ─── Main brief generator ────────────────────────────────────────────────────

export interface BriefOptions {
  keyword:        string;
  blogIndex?:     BlogIndexEntry[];
  locationCode?:  number;
  languageCode?:  string;
  /** How many top URLs to fetch for outline extraction (default 5) */
  scrapeDepth?:   number;
  /** Skip on-page scraping (faster, only SERP titles) */
  shallow?:       boolean;
}

export async function generateBrief(opts: BriefOptions):
  Promise<{ ok: true; brief: ContentBrief } | { ok: false; error: string }>
{
  const serp = await getLiveSerp({
    keyword:      opts.keyword,
    locationCode: opts.locationCode,
    languageCode: opts.languageCode,
    depth:        20,
  });
  if (!serp.ok) return { ok: false, error: serp.error };

  const items = serp.data.items as SerpItemLike[];
  let totalCost = serp.cost;

  // Top 10 organic only
  const organicTop = items
    .filter((it) => it.type === "organic" && it.url)
    .slice(0, 10);

  // Optionally fetch on-page details for top N
  const scrapeN = opts.shallow ? 0 : Math.min(opts.scrapeDepth ?? 5, organicTop.length);
  const enriched: Array<{ rank: number; url: string; title: string; wordCount: number; h2: string[]; h3: string[] }> = [];

  for (let i = 0; i < scrapeN; i++) {
    const it = organicTop[i];
    if (!it.url) continue;
    const onPage = await getOnPageInstant({ url: it.url });
    if (!onPage.ok) continue;
    totalCost += onPage.cost;
    enriched.push({
      rank:      it.rank_absolute ?? i + 1,
      url:       it.url,
      title:     onPage.data.page_title || (it.title ?? ""),
      wordCount: onPage.data.word_count,
      h2:        onPage.data.h2 ?? [],
      h3:        onPage.data.h3 ?? [],
    });
  }

  // Fill remaining slots from SERP-only data
  for (let i = scrapeN; i < organicTop.length; i++) {
    const it = organicTop[i];
    enriched.push({
      rank:      it.rank_absolute ?? i + 1,
      url:       it.url ?? "",
      title:     it.title ?? "",
      wordCount: 0,
      h2:        [],
      h3:        [],
    });
  }

  const wordCounts = enriched.map((e) => e.wordCount).filter((w) => w > 0);
  const wordCountFloor  = wordCounts.length > 0 ? Math.max(...wordCounts) : 1500;
  const median = wordCounts.length > 0 ? [...wordCounts].sort()[Math.floor(wordCounts.length / 2)] : 1500;
  const wordCountTarget = Math.round(median * 1.2);

  const allH2 = enriched.map((e) => e.h2).filter((h) => h.length > 0);
  const recommendedH2s = commonHeadings(allH2, 2);

  const allHeadings = enriched.flatMap((e) => [...e.h2, ...e.h3]);
  const requiredEntities = extractEntitiesFromHeadings(allHeadings);

  const peopleAlsoAsk = extractPAA(items);
  const featuredSnippetTarget = extractFeaturedSnippet(items, opts.keyword);

  const internalLinkSuggestions = opts.blogIndex
    ? suggestInternalLinks(opts.keyword, opts.blogIndex)
    : [];

  return {
    ok: true,
    brief: {
      keyword:           opts.keyword,
      intent:            classifyIntent(opts.keyword),
      wordCountFloor,
      wordCountTarget,
      recommendedH2s,
      peopleAlsoAsk,
      featuredSnippetTarget,
      topCompetitors:    enriched.map((e) => ({
        rank: e.rank, url: e.url, title: e.title, wordCount: e.wordCount,
      })),
      requiredEntities,
      internalLinkSuggestions,
      generatedAt:       new Date().toISOString(),
      cost:              totalCost,
    },
  };
}

/**
 * Format a brief as a prompt-ready string for the LLM content generator.
 * Drop this directly into your existing generate-blog system prompt.
 */
export function briefToPrompt(brief: ContentBrief): string {
  return `
SEO BRIEF — KEYWORD: "${brief.keyword}"

Search intent: ${brief.intent.toUpperCase()}
Minimum word count: ${brief.wordCountFloor} (you MUST exceed this — top-10 floor)
Target word count: ${brief.wordCountTarget}

REQUIRED H2 STRUCTURE (these topics rank — cover them in your post):
${brief.recommendedH2s.map((h) => `  - ${h}`).join("\n")}

PEOPLE ALSO ASK (answer each in your FAQ section):
${brief.peopleAlsoAsk.map((q) => `  - ${q}`).join("\n")}

REQUIRED ENTITIES TO MENTION (for topical authority):
${brief.requiredEntities.map((e) => `  - ${e}`).join("\n")}

${brief.featuredSnippetTarget ? `
FEATURED SNIPPET OPPORTUNITY:
  Format: ${brief.featuredSnippetTarget.format}
  Write a ${brief.featuredSnippetTarget.format === "paragraph" ? "40-60 word direct answer paragraph" : "structured list/table"} immediately after H1.
` : ""}

${brief.internalLinkSuggestions.length > 0 ? `
INTERNAL LINKS (include 2-4 of these as natural in-paragraph anchors):
${brief.internalLinkSuggestions.map((l) => `  - /blog/${l.slug} → "${l.anchor}"`).join("\n")}
` : ""}

TOP 10 COMPETITORS (do NOT copy them — beat them):
${brief.topCompetitors.map((c) => `  ${c.rank}. ${c.title} (${c.wordCount}w) — ${c.url}`).join("\n")}
`.trim();
}
