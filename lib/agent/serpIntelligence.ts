/**
 * lib/agent/serpIntelligence.ts
 *
 * SERP Intelligence — what a senior SEO specialist actually does.
 *
 * For any keyword, this engine:
 *   1. Pulls live top-10 Google results (via Serper)
 *   2. Detects SERP intent (informational/commercial/transactional/local)
 *   3. Scores realistic ranking difficulty (based on competitor authority)
 *   4. Identifies SERP features (PAA, featured snippet, video, etc.)
 *   5. Extracts content patterns competitors use to rank
 *   6. Decides: WRITE this keyword, REFRESH existing post, or SKIP
 *
 * This is what separates a pro SEO agent from a content spammer.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SerpIntent = "informational" | "commercial" | "transactional" | "local" | "navigational";

export type Rankability = "easy" | "medium" | "hard" | "impossible";

export type Verdict = "write" | "refresh" | "skip";

export interface SerpFeature {
  type:    "featured_snippet" | "paa" | "video" | "image_pack" | "knowledge_panel" | "local_pack" | "shopping" | "site_links";
  present: boolean;
}

export interface CompetitorPage {
  position:  number;
  url:       string;
  domain:    string;
  title:     string;
  snippet:   string;
  authority: "high" | "medium" | "low";    // rough estimate from domain heuristics
  type:      "blog" | "product" | "homepage" | "directory" | "forum" | "video" | "news" | "gov" | "wiki";
}

export interface SerpAnalysis {
  keyword:        string;
  intent:         SerpIntent;
  rankability:    Rankability;
  difficulty:     number;              // 0-100
  competitors:    CompetitorPage[];
  features:       SerpFeature[];
  paaQuestions:   string[];
  commonTitleWords: string[];
  recommendedContentType: "blog_guide" | "blog_listicle" | "comparison" | "tool_page" | "local_landing";
  recommendedWordCount:   number;
  yourCurrentRanking?:    number | null;  // if known from GSC
  verdict:        Verdict;
  verdictReason:  string;
}

interface SerperOrganic {
  position?: number;
  link?:     string;
  title?:    string;
  snippet?:  string;
  domain?:   string;
}

interface SerperResponse {
  organic?:        SerperOrganic[];
  peopleAlsoAsk?:  Array<{ question: string; snippet?: string }>;
  answerBox?:      { answer?: string; title?: string };
  knowledgeGraph?: unknown;
  videos?:         unknown[];
  images?:         unknown[];
  shopping?:       unknown[];
  places?:         unknown[];
  siteLinks?:      unknown[];
}

// ─── 1. Fetch SERP from Serper ────────────────────────────────────────────────

async function fetchSerp(keyword: string, country: string): Promise<SerperResponse | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method:  "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify({ q: keyword, gl: country, hl: "en", num: 10 }),
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.json() as SerperResponse;
  } catch {
    return null;
  }
}

// ─── 2. Domain authority heuristics (no API needed) ──────────────────────────

const HIGH_AUTHORITY_DOMAINS = new Set([
  "wikipedia.org", "youtube.com", "linkedin.com", "facebook.com", "twitter.com", "x.com",
  "reddit.com", "quora.com", "medium.com", "amazon.com", "microsoft.com", "apple.com",
  "google.com", "github.com", "stackoverflow.com", "forbes.com", "bloomberg.com",
  "nytimes.com", "wsj.com", "techcrunch.com", "wired.com",
]);

const GOV_TLDS  = [".gov", ".gov.pk", ".gov.in", ".gov.uk", ".gov.ae"];
const EDU_TLDS  = [".edu", ".edu.pk", ".ac.uk", ".edu.au"];

function classifyDomain(domain: string): "high" | "medium" | "low" {
  const d = domain.toLowerCase();
  if (HIGH_AUTHORITY_DOMAINS.has(d)) return "high";
  if (GOV_TLDS.some((tld) => d.endsWith(tld))) return "high";
  if (EDU_TLDS.some((tld) => d.endsWith(tld))) return "high";
  // Subdomain of well-known site
  for (const known of HIGH_AUTHORITY_DOMAINS) {
    if (d.endsWith(`.${known}`)) return "high";
  }
  // Common platform/marketplace patterns
  if (/(shopify|wordpress|wixsite|blogspot|tumblr)\.com$/.test(d)) return "low";
  // Subjective: if it has "blog" or "journal" or "news" in name
  if (/(news|journal|blog)/.test(d)) return "medium";
  // Default unknown small/mid sites
  return "low";
}

function classifyPageType(url: string, title: string, domain: string): CompetitorPage["type"] {
  const u = url.toLowerCase();
  const t = title.toLowerCase();
  const d = domain.toLowerCase();

  if (GOV_TLDS.some((tld) => d.endsWith(tld))) return "gov";
  if (d.includes("wikipedia"))                 return "wiki";
  if (d.includes("youtube") || /\/watch/.test(u)) return "video";
  if (/(news|times|tribune|post|gazette)/.test(d)) return "news";
  if (/\/product|\/shop|\/buy|\/store/.test(u))    return "product";
  if (/\/blog|\/article|\/post|\/guide|\/how-to/.test(u)) return "blog";
  if (/\/directory|\/listing|\/companies/.test(u))       return "directory";
  if (/(forum|community|discussion)/.test(d))            return "forum";
  if (/^https?:\/\/[^\/]+\/?$/.test(u))                  return "homepage";
  // Title-based fallback
  if (/\b(buy|shop|price|cost)\b/.test(t)) return "product";
  return "blog"; // default assumption for content
}

// ─── 3. Detect SERP intent ────────────────────────────────────────────────────

function detectIntent(keyword: string, competitors: CompetitorPage[]): SerpIntent {
  const k = keyword.toLowerCase();

  // Strong signals from keyword itself
  if (/\b(near me|in [a-z]+|city|location)\b/.test(k))             return "local";
  if (/\b(login|sign in|portal|website|official)\b/.test(k))       return "navigational";
  if (/\b(buy|order|book|hire|cost|price|cheap|deal|coupon)\b/.test(k)) return "transactional";
  if (/\b(best|top|review|compare|vs|alternative|recommended)\b/.test(k)) return "commercial";

  // Infer from SERP makeup
  const productHits = competitors.filter((c) => c.type === "product").length;
  const blogHits    = competitors.filter((c) => c.type === "blog" || c.type === "wiki").length;

  if (productHits >= 5) return "transactional";
  if (productHits >= 3) return "commercial";
  if (blogHits >= 5)    return "informational";
  return "informational";
}

// ─── 4. Difficulty score (0-100) ──────────────────────────────────────────────

function calculateDifficulty(competitors: CompetitorPage[], features: SerpFeature[]): number {
  let score = 30; // base difficulty

  // High-authority competitors in top 10 → harder
  const highAuth   = competitors.filter((c) => c.authority === "high").length;
  const mediumAuth = competitors.filter((c) => c.authority === "medium").length;
  score += highAuth * 7;     // each big brand = +7 difficulty
  score += mediumAuth * 3;   // each mid site = +3 difficulty

  // SERP type: gov/wiki dominating = very hard
  const govWikiCount = competitors.filter((c) => c.type === "gov" || c.type === "wiki").length;
  score += govWikiCount * 8;

  // Big-brand SERP features eat clicks
  if (features.find((f) => f.type === "knowledge_panel" && f.present)) score += 12;
  if (features.find((f) => f.type === "shopping" && f.present))         score += 8;
  if (features.find((f) => f.type === "local_pack" && f.present))       score += 6;

  // Featured snippet present = harder unless it's a small-site one
  if (features.find((f) => f.type === "featured_snippet" && f.present)) {
    const fsHasHighAuth = highAuth >= 3;
    score += fsHasHighAuth ? 8 : -3;  // small-site FS = opportunity
  }

  // PAA present = MORE opportunities (positive signal)
  if (features.find((f) => f.type === "paa" && f.present)) score -= 5;

  // Video pack with no big brands = opportunity for blog post
  if (features.find((f) => f.type === "video" && f.present)) {
    if (highAuth < 3) score -= 4;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreToRankability(score: number): Rankability {
  if (score >= 75) return "impossible";
  if (score >= 60) return "hard";
  if (score >= 40) return "medium";
  return "easy";
}

// ─── 5. Recommended content type ──────────────────────────────────────────────

function recommendContentType(
  intent: SerpIntent,
  competitors: CompetitorPage[],
  keyword: string,
): SerpAnalysis["recommendedContentType"] {
  const k = keyword.toLowerCase();
  const types = competitors.map((c) => c.type);

  if (intent === "local") return "local_landing";
  if (intent === "transactional") return "tool_page";
  if (intent === "commercial") return "comparison";

  // Look at what's actually winning
  const blogCount  = types.filter((t) => t === "blog").length;
  const listicleSignal = competitors.filter((c) => /^\d+|top \d+|best \d+/i.test(c.title)).length;

  if (listicleSignal >= 3 || /^(best|top) \d/.test(k)) return "blog_listicle";
  if (blogCount >= 4) return "blog_guide";
  return "blog_guide";
}

function recommendedWordCount(competitors: CompetitorPage[]): number {
  // Without scraping each competitor, estimate from snippet density
  // Rule of thumb: 1.5x the average competitor depth
  const baseline = 1500;
  const govWikiBoost = competitors.filter((c) => c.type === "gov" || c.type === "wiki").length * 200;
  return baseline + govWikiBoost;
}

// ─── 6. The verdict — should we write this? ───────────────────────────────────

function decideVerdict(
  rankability:        Rankability,
  yourCurrentRanking: number | null | undefined,
  features:           SerpFeature[],
): { verdict: Verdict; reason: string } {
  // Already ranking — refresh, don't duplicate
  if (yourCurrentRanking != null && yourCurrentRanking <= 30) {
    return {
      verdict: "refresh",
      reason:  `Already ranking at position ${yourCurrentRanking}. Refresh existing post for stronger signal.`,
    };
  }

  if (rankability === "impossible") {
    return { verdict: "skip", reason: "Top 10 dominated by high-authority sites (gov/wiki/big brands). Not winnable as a small site." };
  }

  if (rankability === "hard") {
    const hasPaa = features.find((f) => f.type === "paa" && f.present);
    if (hasPaa) {
      return {
        verdict: "write",
        reason:  "Hard but PAA present — target featured snippet via Q&A format.",
      };
    }
    return { verdict: "skip", reason: "High difficulty without PAA opportunity. Skip for now." };
  }

  return { verdict: "write", reason: `Rankability: ${rankability}. Worth writing.` };
}

// ─── 7. Main analysis ─────────────────────────────────────────────────────────

export async function analyzeSerpIntelligence(
  keyword:    string,
  country:    string  = "us",
  yourRanking?: number | null,
): Promise<SerpAnalysis | null> {
  const serp = await fetchSerp(keyword, country);
  if (!serp) return null;

  const organic = serp.organic ?? [];
  const competitors: CompetitorPage[] = organic.slice(0, 10).map((item, idx) => {
    const url    = item.link  ?? "";
    const title  = item.title ?? "";
    const domain = item.domain ?? extractDomain(url);
    return {
      position:  item.position ?? idx + 1,
      url,
      domain,
      title,
      snippet:   item.snippet ?? "",
      authority: classifyDomain(domain),
      type:      classifyPageType(url, title, domain),
    };
  });

  const features: SerpFeature[] = [
    { type: "featured_snippet", present: !!serp.answerBox },
    { type: "paa",              present: (serp.peopleAlsoAsk?.length ?? 0) > 0 },
    { type: "video",            present: (serp.videos?.length ?? 0) > 0 },
    { type: "image_pack",       present: (serp.images?.length ?? 0) > 0 },
    { type: "knowledge_panel",  present: !!serp.knowledgeGraph },
    { type: "local_pack",       present: (serp.places?.length ?? 0) > 0 },
    { type: "shopping",         present: (serp.shopping?.length ?? 0) > 0 },
    { type: "site_links",       present: (serp.siteLinks?.length ?? 0) > 0 },
  ];

  const paaQuestions = (serp.peopleAlsoAsk ?? []).map((p) => p.question).filter(Boolean);

  const intent      = detectIntent(keyword, competitors);
  const difficulty  = calculateDifficulty(competitors, features);
  const rankability = scoreToRankability(difficulty);

  const commonTitleWords = extractCommonTitleWords(competitors);
  const contentType      = recommendContentType(intent, competitors, keyword);
  const wordCount        = recommendedWordCount(competitors);

  const { verdict, reason } = decideVerdict(rankability, yourRanking, features);

  return {
    keyword,
    intent,
    rankability,
    difficulty,
    competitors,
    features,
    paaQuestions,
    commonTitleWords,
    recommendedContentType:  contentType,
    recommendedWordCount:    wordCount,
    yourCurrentRanking:      yourRanking ?? null,
    verdict,
    verdictReason:           reason,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "best", "top", "your", "you", "how"]);

function extractCommonTitleWords(competitors: CompetitorPage[]): string[] {
  const counts: Record<string, number> = {};
  for (const c of competitors) {
    const words = c.title.toLowerCase().split(/[\s\-|–:,]+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    for (const w of words) counts[w] = (counts[w] ?? 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, n]) => n >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([w]) => w);
}

// ─── Build a SERP-aware brief for the content writer ──────────────────────────

export function buildIntelligentBrief(analysis: SerpAnalysis): string {
  const lines: string[] = [];
  lines.push(`SERP INTELLIGENCE BRIEF for "${analysis.keyword}"`);
  lines.push(`Search intent: ${analysis.intent}`);
  lines.push(`Recommended content type: ${analysis.recommendedContentType}`);
  lines.push(`Target word count: ${analysis.recommendedWordCount}+ words`);
  lines.push(`Difficulty: ${analysis.difficulty}/100 (${analysis.rankability})`);
  lines.push("");

  lines.push("WHO YOU MUST BEAT (current top-5):");
  analysis.competitors.slice(0, 5).forEach((c) => {
    lines.push(`  ${c.position}. [${c.authority}] ${c.domain} — "${c.title}"`);
  });
  lines.push("");

  if (analysis.paaQuestions.length > 0) {
    lines.push("PEOPLE ALSO ASK (cover ALL of these as H2 sub-headings):");
    analysis.paaQuestions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    lines.push("");
  }

  if (analysis.commonTitleWords.length > 0) {
    lines.push(`Words appearing in 3+ top-10 titles: ${analysis.commonTitleWords.join(", ")}`);
    lines.push("→ Use these naturally in your H2 headings.");
    lines.push("");
  }

  const featurePresent = analysis.features.filter((f) => f.present).map((f) => f.type);
  if (featurePresent.length > 0) {
    lines.push(`SERP features present: ${featurePresent.join(", ")}`);
    if (featurePresent.includes("featured_snippet")) {
      lines.push("→ Open the article with a 40-60 word definition paragraph to target the snippet.");
    }
    if (featurePresent.includes("paa")) {
      lines.push("→ Include the PAA questions as exact H2 headings with concise answers.");
    }
  }

  return lines.join("\n");
}
