/**
 * lib/agent/competitorScraper.ts
 *
 * Competitor Content Extraction — fetches the actual HTML of top-ranking
 * pages and extracts what makes them rank.
 *
 * Why this matters: SERP titles + snippets only tell you a fraction of the
 * story. To beat a page, you need to know:
 *   - Their actual word count
 *   - All their H2/H3 headings (the topics they cover)
 *   - Their content structure
 *   - What they cover that you should cover too
 *
 * Output: a structured "competitor profile" passed into the brief.
 */

export interface CompetitorContent {
  url:        string;
  domain:     string;
  title:      string;
  wordCount:  number;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  topics:     string[];     // distinctive phrases extracted from headings
  hasFaq:     boolean;
  hasTable:   boolean;
  hasList:    boolean;
}

export interface CompetitorProfile {
  competitors:     CompetitorContent[];
  averageWordCount: number;
  commonH2Topics:  string[];      // H2 themes appearing in 2+ competitors
  uniqueTopics:    string[];      // topics covered by ANY competitor
  contentSignals: {
    faqAdoption:   number;        // % of competitors with FAQ
    tableAdoption: number;        // % using comparison tables
    listAdoption:  number;        // % using ordered lists
  };
}

// ─── HTML fetcher (no external deps) ─────────────────────────────────────────

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PhelixSEOBot/1.0)",
        "Accept":     "text/html,application/xhtml+xml",
      },
      signal:  AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    const text = await res.text();
    // Cap to first 500KB to avoid huge pages
    return text.slice(0, 500_000);
  } catch {
    return null;
  }
}

// ─── HTML parsing (regex-based, no DOM) ──────────────────────────────────────

function extractTextBetween(html: string, openTag: string, closeTag: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(`<${openTag}[^>]*>([\\s\\S]*?)<\\/${closeTag}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text && text.length > 2 && text.length < 300) {
      results.push(text);
    }
  }
  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ");
}

function extractMainContent(html: string): string {
  // Prefer <article>, then <main>, then <body>
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

// ─── Single page parse ───────────────────────────────────────────────────────

function parseCompetitor(url: string, html: string): CompetitorContent {
  const main = extractMainContent(html);

  const h1All = extractTextBetween(main, "h1", "h1");
  const h2All = extractTextBetween(main, "h2", "h2");
  const h3All = extractTextBetween(main, "h3", "h3");

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title      = titleMatch ? stripHtml(titleMatch[1]).trim() : "";

  const plainText = stripHtml(main);
  const wordCount = plainText.split(/\s+/).filter((w) => w.length > 1).length;

  // Distinctive topic extraction from H2/H3
  const topics = [...h2All, ...h3All]
    .map((h) => h.toLowerCase())
    .filter((h) => h.length > 4 && h.length < 100);

  // Content feature signals
  const hasFaq   = /\b(faq|frequently asked|common questions)\b/i.test(main);
  const hasTable = /<table[\s>]/i.test(main);
  const hasList  = /<(ol|ul)[\s>]/i.test(main);

  return {
    url,
    domain:    extractDomain(url),
    title,
    wordCount,
    headings:  { h1: h1All, h2: h2All, h3: h3All },
    topics,
    hasFaq,
    hasTable,
    hasList,
  };
}

// ─── Main: scrape top N competitors ──────────────────────────────────────────

/**
 * Fetch and analyze the top N ranking pages for a keyword.
 *
 * @param urls - top URLs from SERP (already in ranking order)
 * @param max  - max number to actually scrape (default 3, costs network time)
 */
export async function extractCompetitorProfiles(
  urls: string[],
  max:  number = 3,
): Promise<CompetitorProfile> {
  const targets = urls.slice(0, max);
  const results = await Promise.all(targets.map(async (url) => {
    const html = await fetchHtml(url);
    if (!html) return null;
    try {
      return parseCompetitor(url, html);
    } catch {
      return null;
    }
  }));

  const competitors = results.filter((r): r is CompetitorContent => r !== null);

  if (competitors.length === 0) {
    return {
      competitors:      [],
      averageWordCount: 0,
      commonH2Topics:   [],
      uniqueTopics:     [],
      contentSignals:   { faqAdoption: 0, tableAdoption: 0, listAdoption: 0 },
    };
  }

  const avgWords = Math.round(
    competitors.reduce((s, c) => s + c.wordCount, 0) / competitors.length
  );

  // H2 topics appearing in 2+ competitors
  const h2Counts: Record<string, number> = {};
  for (const c of competitors) {
    const seen = new Set<string>();
    for (const h2 of c.headings.h2) {
      const key = normalizeHeading(h2);
      if (key && !seen.has(key)) {
        seen.add(key);
        h2Counts[key] = (h2Counts[key] ?? 0) + 1;
      }
    }
  }
  const commonH2Topics = Object.entries(h2Counts)
    .filter(([, n]) => n >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([t]) => t);

  // All unique topics across competitors
  const uniqueSet = new Set<string>();
  for (const c of competitors) for (const t of c.topics) uniqueSet.add(t);

  return {
    competitors,
    averageWordCount: avgWords,
    commonH2Topics,
    uniqueTopics:     [...uniqueSet].slice(0, 25),
    contentSignals: {
      faqAdoption:   Math.round((competitors.filter((c) => c.hasFaq).length   / competitors.length) * 100),
      tableAdoption: Math.round((competitors.filter((c) => c.hasTable).length / competitors.length) * 100),
      listAdoption:  Math.round((competitors.filter((c) => c.hasList).length  / competitors.length) * 100),
    },
  };
}

function normalizeHeading(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 3 && !["what", "when", "where", "with", "your", "this", "that", "from", "have", "does", "will"].includes(w))
    .slice(0, 6)
    .join(" ");
}

// ─── Build a competitor brief addendum ───────────────────────────────────────

export function buildCompetitorBrief(profile: CompetitorProfile): string {
  if (profile.competitors.length === 0) return "";

  const lines: string[] = [];
  lines.push("COMPETITOR CONTENT ANALYSIS (top 3 ranking pages):");
  for (const c of profile.competitors) {
    lines.push(`  • ${c.domain} — ${c.wordCount} words, ${c.headings.h2.length} H2s${c.hasFaq ? ", has FAQ" : ""}${c.hasTable ? ", has table" : ""}`);
  }
  lines.push("");
  lines.push(`Target word count: at least ${Math.max(profile.averageWordCount + 300, 1500)} (top-3 average + 300)`);
  lines.push("");

  if (profile.commonH2Topics.length > 0) {
    lines.push("TOPICS COVERED BY 2+ COMPETITORS (you MUST cover these):");
    profile.commonH2Topics.slice(0, 10).forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
    lines.push("");
  }

  const signals = profile.contentSignals;
  if (signals.faqAdoption >= 50)   lines.push(`→ ${signals.faqAdoption}% of competitors include FAQ — you must include 5-8 FAQs`);
  if (signals.tableAdoption >= 50) lines.push(`→ ${signals.tableAdoption}% include comparison tables — add at least one`);
  if (signals.listAdoption >= 70)  lines.push(`→ ${signals.listAdoption}% use ordered lists — structure with numbered steps`);

  return lines.join("\n");
}
