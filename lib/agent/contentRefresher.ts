/**
 * lib/agent/contentRefresher.ts
 *
 * GSC-data-driven content refresh engine.
 *
 * Unlike the standard update engine (which picks the lowest quality blog),
 * this engine uses real search performance data to target:
 *   1. HIGH IMPRESSION / LOW CTR  — title/intro problem, rewrite opening
 *   2. STRIKING DISTANCE          — position 10–30, expand content depth
 *   3. IMPRESSION-ZERO            — new pages with no impressions, boost signals
 *
 * Refresh strategy per page type:
 *   - Low CTR    → rewrite title, meta description, and opening paragraph
 *   - Pos 10–30  → expand content, add more FAQs, strengthen keyword density
 *   - No impress → add more heading variations, internal links, schema
 *
 * Used by: app/api/refresh-content/route.ts (called by agentBrain when
 * shouldRefresh decision is true).
 */

import type { BlogPost, PageMetric, SeoData } from "@/lib/types";

// ─── Refresh classification ───────────────────────────────────────────────────

export type RefreshType = "low_ctr" | "striking_distance" | "no_impressions";

export interface RefreshCandidate {
  slug:        string;
  refreshType: RefreshType;
  metric?:     PageMetric;
  /** Priority score — higher = refresh first */
  priority:    number;
}

// ─── Candidate selection ──────────────────────────────────────────────────────

/**
 * Given GSC data + a list of all published blog slugs, return an ordered list
 * of refresh candidates (highest priority first).
 *
 * @param seoData   - current data/seo.json
 * @param allSlugs  - all published blog slugs
 * @param maxCount  - max candidates to return
 */
export function selectRefreshCandidates(
  seoData: SeoData,
  allSlugs: string[],
  maxCount = 3
): RefreshCandidate[] {
  const metricMap = new Map<string, PageMetric>(
    seoData.pages.map((p) => [p.slug, p])
  );
  const avgCtr = seoData.summary.avgCTR;
  const candidates: RefreshCandidate[] = [];

  for (const slug of allSlugs) {
    const metric = metricMap.get(slug);

    if (!metric) {
      // No GSC data at all — page not indexed/crawled yet.
      // Skipping: Groq-refreshing uncrawled pages wastes tokens and Groq capacity.
      // These pages need indexing (sitemap ping, internal links) not content edits.
      // The no_impressions case is handled separately by the schema-injection refresh
      // in agentBrain, which is cheaper and doesn't need an LLM call.
      continue;
    }

    if (metric.position >= 10 && metric.position <= 30 && metric.impressions >= 20) {
      // Striking distance — can jump to page 1 with content boost
      // Priority scales with impressions (more impressions = higher opportunity)
      const priority = Math.min(100, 50 + metric.impressions / 10);
      candidates.push({ slug, refreshType: "striking_distance", metric, priority });
    } else if (metric.impressions >= 50 && metric.ctr < avgCtr * 0.5) {
      // Low CTR vs site average — title/meta problem
      const priority = metric.impressions * (1 - metric.ctr);
      candidates.push({ slug, refreshType: "low_ctr", metric, priority });
    }
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxCount);
}

// ─── Groq refresh prompt builders ────────────────────────────────────────────

export function buildRefreshSystemPrompt(
  refreshType: RefreshType,
  niche: string,
  siteName: string
): string {
  const base = `You are an expert SEO content editor for ${siteName}, a ${niche} platform.
You will receive an existing blog post and must produce an improved version.
Return ONLY valid JSON in the exact structure specified — no markdown, no explanation.`;

  const strategies: Record<RefreshType, string> = {
    low_ctr: `
REFRESH STRATEGY: LOW CTR
The page gets impressions but few clicks. The problem is the title and opening hook.
Focus on:
1. Rewriting the title to be more compelling and click-worthy (use numbers, power words, hooks)
2. Strengthening the meta description with a clear value proposition and CTA
3. Rewriting the first 2 paragraphs to hook readers immediately
4. Adding more urgency / relevance signals`,

    striking_distance: `
REFRESH STRATEGY: STRIKING DISTANCE (position 10–30)
The page ranks on page 2. A content depth boost can push it to page 1.
Focus on:
1. Expanding the main content by 30–40% (more detailed sections, examples, data)
2. Adding 3–5 new FAQs targeting related "People Also Ask" questions
3. Adding a comparison table or step-by-step numbered process
4. Strengthening keyword density in headings and first 100 words
5. Adding more specific local/industry context`,

    no_impressions: `
REFRESH STRATEGY: NO IMPRESSIONS
Google has not crawled or shown this page yet. Boost crawlability and relevance signals.
Focus on:
1. Rewriting all H2 headings to be keyword-rich and descriptive
2. Adding a table of contents section near the top
3. Adding 5+ FAQs
4. Expanding each section for minimum 1500 words total
5. Ensuring the primary keyword appears in the first sentence`,
  };

  return base + strategies[refreshType];
}

export function buildRefreshUserPrompt(
  blog: BlogPost,
  metric: PageMetric | undefined,
  targetKeyword: string,
  serpBrief?: string,
  competitorBrief?: string
): string {
  const metricSummary = metric
    ? `Current GSC performance:
- Impressions (28d): ${metric.impressions}
- Clicks: ${metric.clicks}
- CTR: ${(metric.ctr * 100).toFixed(2)}%
- Average position: ${metric.position.toFixed(1)}`
    : "No GSC data yet (page not indexed).";

  const briefSection = serpBrief
    ? `

═══ LIVE SERP INTELLIGENCE (use this to beat current rankings) ═══
${serpBrief}
${competitorBrief ? "\n" + competitorBrief : ""}
═══════════════════════════════════════════════════════════════════
`
    : "";

  return `${metricSummary}${briefSection}

Target keyword: "${targetKeyword}"

Current blog:
Title: ${blog.title}
Meta: ${blog.metaDescription}
Content (excerpt): ${blog.content.replace(/<[^>]+>/g, " ").slice(0, 800)}...

Return JSON:
{
  "title": "improved title",
  "meta_description": "improved meta (120–155 chars)",
  "content_markdown": "full improved content in markdown",
  "faq": [{"question": "...", "answer": "..."}],
  "keywords_used": ["keyword1", "keyword2"]
}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call Groq to refresh a blog post based on its performance data.
 * Returns structured JSON from Groq, or throws on failure.
 */
export async function callGroqRefresh(
  blog:        BlogPost,
  candidate:   RefreshCandidate,
  niche:       string,
  siteName:    string,
  groqApiKey:  string,
  country?:    string
): Promise<{
  title:            string;
  meta_description: string;
  content_markdown: string;
  faq:              Array<{ question: string; answer: string }>;
  keywords_used:    string[];
}> {
  const keyword      = blog.keywords[0] ?? blog.title;
  const systemPrompt = buildRefreshSystemPrompt(candidate.refreshType, niche, siteName);

  // ── Pull live SERP intelligence + competitor data for refresh ──────────────
  let serpBrief = "";
  let competitorBrief = "";
  if (process.env.SERPER_API_KEY && country) {
    try {
      const { analyzeSerpIntelligence, buildIntelligentBrief } = await import("./serpIntelligence");
      const { getCountryCode } = await import("./keywordDiscovery");
      const analysis = await analyzeSerpIntelligence(keyword, getCountryCode(country));
      if (analysis) {
        serpBrief = buildIntelligentBrief(analysis);
        // Scrape top 3 competitors for deeper analysis
        try {
          const { extractCompetitorProfiles, buildCompetitorBrief } = await import("./competitorScraper");
          const topUrls = analysis.competitors.slice(0, 3).map((c) => c.url).filter(Boolean);
          if (topUrls.length > 0) {
            const profile = await extractCompetitorProfiles(topUrls, 3);
            competitorBrief = buildCompetitorBrief(profile);
          }
        } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal */ }
  }

  const userPrompt = buildRefreshUserPrompt(blog, candidate.metric, keyword, serpBrief, competitorBrief);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      temperature: 0.5,
      max_tokens:  4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq refresh error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const raw   = data?.choices?.[0]?.message?.content ?? "";
  const clean = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  return JSON.parse(clean);
}

/**
 * Build the token usage object from a Groq response (for costGuard).
 */
export function extractTokenUsage(groqResponse: {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}): { promptTokens: number; completionTokens: number; totalTokens: number } {
  return {
    promptTokens:     groqResponse.usage?.prompt_tokens     ?? 0,
    completionTokens: groqResponse.usage?.completion_tokens ?? 0,
    totalTokens:      groqResponse.usage?.total_tokens      ?? 0,
  };
}
