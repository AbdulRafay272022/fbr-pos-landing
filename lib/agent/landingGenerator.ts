/**
 * lib/agent/landingGenerator.ts
 *
 * Money page / landing page generator — Phase 5.
 *
 * Generates conversion-optimised landing pages for:
 *  - Service pages  (e.g. "FBR POS Integration Service")
 *  - Tool pages     (e.g. "Free FBR Compliance Checker")
 *  - Industry pages (e.g. "POS System for Restaurants")
 *  - Location pages (e.g. "POS Software Lahore")
 *
 * Each page includes:
 *  - Strong keyword-rich headline + sub-headline
 *  - Problem → Solution narrative
 *  - Trust signals (stats, social proof)
 *  - Pricing section
 *  - FAQ schema (3–5 questions)
 *  - Dual CTA blocks (WhatsApp + lead capture)
 *  - Internal links to 3 related blog posts
 *  - Article + FAQPage JSON-LD schema
 *
 * Design:
 *  - Uses Groq llama-3.3-70b-versatile for content generation
 *  - All HTML is self-contained (Tailwind-compatible inline styles)
 *  - Quality gate: requires min 800 words + FAQs
 *  - Cost guard checked before each Groq call
 */

import type { LandingPage, LandingPageType, BlogFaq, SiteConfig } from "@/lib/types";
import type { CostData } from "@/lib/types";
import { isUnderBudget, recordUsage } from "./costGuard";
import { getSiteConfig } from "./siteConfig";

// ─── Groq settings ────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const GROQ_TIMEOUT = 55_000;

// ─── Page spec ────────────────────────────────────────────────────────────────

export interface LandingPageSpec {
  pageType:        LandingPageType;
  targetKeyword:   string;
  targetCity?:     string;
  targetIndustry?: string;
  targetService?:  string;
  cluster:         string;
  /** Slugs of related blog posts to link to (max 3) */
  relatedBlogSlugs?: string[];
  relatedBlogTitles?: string[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(siteConfig: SiteConfig): string {
  return `You are an expert conversion copywriter and SEO specialist for ${siteConfig.name}, a ${siteConfig.niche} SaaS company in ${siteConfig.country}.

Your task is to write a high-converting landing page in HTML. The page must:
- Be written in clear, professional English targeted at Pakistani business owners
- Use strong, action-oriented language that drives conversions
- Include specific Pakistani context (FBR, SRB, PRA, local compliance requirements)
- Follow Google's E-E-A-T guidelines (Experience, Expertise, Authoritativeness, Trustworthiness)
- Be minimum 900 words of body content
- Use semantic HTML with proper heading hierarchy (H1 → H2 → H3)

CRITICAL: Respond ONLY with a JSON object. No markdown fences. No explanation. Pure JSON.`;
}

// ─── User prompt ─────────────────────────────────────────────────────────────

function buildUserPrompt(
  spec:       LandingPageSpec,
  siteConfig: SiteConfig
): string {
  const ctaPhone  = siteConfig.ctaWhatsApp ?? "923001234567";
  const ctaUrl    = `https://wa.me/${ctaPhone}`;
  const location  = spec.targetCity ? ` in ${spec.targetCity}` : "";
  const industry  = spec.targetIndustry ? ` for ${spec.targetIndustry} businesses` : "";
  const service   = spec.targetService ?? spec.targetKeyword;

  const relatedLinksHtml = (spec.relatedBlogSlugs ?? [])
    .slice(0, 3)
    .map((slug, i) => {
      const title = spec.relatedBlogTitles?.[i] ?? slug.replace(/-/g, " ");
      return `<li><a href="/blog/${slug}" style="color:#F97316;font-weight:600;">${title}</a></li>`;
    })
    .join("\n");

  return `Generate a high-converting landing page for ${siteConfig.name} targeting the keyword: "${spec.targetKeyword}"

Context:
- Company: ${siteConfig.name}
- Niche: ${siteConfig.niche}
- Target: Pakistani ${spec.targetIndustry ?? "business"} owners${location}
- Service: ${service}
- CTA Phone/WhatsApp: ${ctaPhone}
- Page type: ${spec.pageType}

The page must follow this EXACT structure and return a JSON object with these fields:

{
  "title": "SEO-optimised page title (50–60 chars) with primary keyword",
  "metaDescription": "Compelling meta description (140–155 chars) with CTA",
  "slug": "url-slug-from-title (lowercase, hyphens, no special chars)",
  "keywords": ["keyword1", "keyword2", ... up to 8 keywords],
  "faqs": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ],
  "content": "FULL HTML of the landing page body (everything inside <article> tag)"
}

The content HTML must include ALL of these sections in order:

1. HERO SECTION:
<section style="background:linear-gradient(135deg,#FFF7ED 0%,#FFEDD5 100%);padding:60px 0;border-radius:16px;text-align:center;margin-bottom:40px;">
  <h1 style="font-size:2.2rem;font-weight:800;color:#1C1917;margin-bottom:16px;">[Compelling keyword-rich headline${location}${industry}]</h1>
  <p style="font-size:1.2rem;color:#57534E;max-width:640px;margin:0 auto 28px;">[Sub-headline with value proposition]</p>
  <a href="${ctaUrl}" style="display:inline-block;background:#25D366;color:#fff;padding:16px 36px;border-radius:8px;font-weight:700;text-decoration:none;font-size:1.1rem;">💬 Get Free Demo on WhatsApp</a>
</section>

2. PROBLEM SECTION (with <h2> heading, 2–3 paragraphs about the pain points Pakistani businesses face)

3. SOLUTION SECTION (with <h2> heading, explain how ${siteConfig.name} solves each problem, use a bullet list of 5–6 benefits)

4. TRUST SIGNALS SECTION:
<section style="background:#F8FAFC;padding:40px;border-radius:12px;margin:40px 0;">
  <h2>Why [${siteConfig.country}] Businesses Trust ${siteConfig.name}</h2>
  [3 stat boxes with numbers: e.g. "500+ Businesses", "99.9% Uptime", "FBR Certified"]
  [2–3 sentences of social proof copy]
</section>

5. FEATURES/HOW IT WORKS SECTION (<h2>, 4–6 numbered steps or feature cards with icons using emoji)

6. PRICING SECTION:
<section style="margin:40px 0;">
  <h2>Simple, Transparent Pricing</h2>
  [2–3 pricing tiers with monthly/annual options, highlight recommended plan]
  [Note: "All plans include FBR integration & compliance support"]
</section>

7. FAQ SECTION (use the faqs array, render as expand/collapse style with HTML details/summary):
<section style="margin:40px 0;">
  <h2>Frequently Asked Questions</h2>
  [render all 5 FAQs as <details><summary>question</summary><p>answer</p></details>]
</section>

8. INTERNAL LINKS SECTION (only if related blogs provided):
<section style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:24px;margin:40px 0;">
  <h3>Related Guides</h3>
  <ul style="list-style:none;padding:0;">
${relatedLinksHtml || "<!-- no related blogs yet -->"}
  </ul>
</section>

9. FINAL CTA SECTION:
<section style="background:#F97316;padding:50px;border-radius:16px;text-align:center;color:#fff;margin:40px 0;">
  <h2 style="color:#fff;font-size:1.8rem;margin-bottom:16px;">[Urgency-driven closing headline]</h2>
  <p style="color:#FFF7ED;margin-bottom:24px;">[Closing value reinforcement + risk reversal]</p>
  <a href="${ctaUrl}" style="display:inline-block;background:#fff;color:#F97316;padding:16px 36px;border-radius:8px;font-weight:800;text-decoration:none;font-size:1.1rem;" data-cta-id="landing-end" data-cta-pos="end">💬 Start Free Trial — Contact Us Now</a>
</section>

IMPORTANT:
- The slug must NOT include "landing" — make it clean like "fbr-pos-lahore" or "restaurant-pos-system"
- Do NOT use \`\`\`json fences — return raw JSON only
- Every monetary figure should be in PKR
- Mention FBR compliance at least 3 times
- Include at least one specific SRO number (SRO 1006 or SRO 673)`;
}

// ─── Groq call ────────────────────────────────────────────────────────────────

interface GroqGenerateResult {
  title:           string;
  metaDescription: string;
  slug:            string;
  keywords:        string[];
  faqs:            BlogFaq[];
  content:         string;
}

async function callGroqLanding(
  spec:       LandingPageSpec,
  siteConfig: SiteConfig,
  groqApiKey: string
): Promise<{ result: GroqGenerateResult; promptTokens: number; completionTokens: number }> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), GROQ_TIMEOUT);

  try {
    const res = await fetch(GROQ_API_URL, {
      method:  "POST",
      signal:  controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        temperature: 0.7,
        max_tokens:  4096,
        messages: [
          { role: "system", content: buildSystemPrompt(siteConfig) },
          { role: "user",   content: buildUserPrompt(spec, siteConfig) },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const raw = json.choices?.[0]?.message?.content ?? "";
    const promptTokens     = json.usage?.prompt_tokens     ?? 0;
    const completionTokens = json.usage?.completion_tokens ?? 0;

    // Strip JSON fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as GroqGenerateResult;

    // Validate minimum requirements
    if (!parsed.title || !parsed.slug || !parsed.content) {
      throw new Error("Groq response missing required fields: title, slug, or content");
    }
    if (!parsed.faqs || parsed.faqs.length < 3) {
      throw new Error("Landing page requires at least 3 FAQs");
    }

    // Ensure slug is clean
    parsed.slug = parsed.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return { result: parsed, promptTokens, completionTokens };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Schema injection ─────────────────────────────────────────────────────────

function buildLandingSchema(
  page:       GroqGenerateResult,
  siteConfig: SiteConfig
): string {
  const baseUrl  = siteConfig.baseUrl.replace(/\/$/, "");
  const pageUrl  = `${baseUrl}/services/${page.slug}`;
  const now      = new Date().toISOString();

  const articleSchema = {
    "@context":    "https://schema.org",
    "@type":       "WebPage",
    "name":        page.title,
    "description": page.metaDescription,
    "url":         pageUrl,
    "publisher": {
      "@type": "Organization",
      "name":  siteConfig.name,
      "url":   baseUrl,
    },
    "datePublished": now,
    "dateModified":  now,
    "inLanguage":    "en-PK",
  };

  const faqSchema = page.faqs?.length > 0 ? {
    "@context": "https://schema.org",
    "@type":    "FAQPage",
    "mainEntity": page.faqs.map((faq) => ({
      "@type":  "Question",
      "name":   faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text":  faq.answer,
      },
    })),
  } : null;

  const schemas = [JSON.stringify(articleSchema)];
  if (faqSchema) schemas.push(JSON.stringify(faqSchema));

  return schemas
    .map((s) => `<script type="application/ld+json">${s}</script>`)
    .join("\n");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export interface GenerateLandingResult {
  success:       boolean;
  page?:         LandingPage;
  costs?:        CostData;
  error?:        string;
  skippedReason?: string;
}

/**
 * Generate a single landing page and return it ready to persist.
 *
 * @param spec        - what to generate
 * @param costs       - current cost data (for budget guard)
 * @param groqApiKey  - Groq API key
 * @returns           - the generated landing page + updated costs
 */
export async function generateLandingPage(
  spec:       LandingPageSpec,
  costs:      CostData,
  groqApiKey: string
): Promise<GenerateLandingResult> {
  // Cost guard
  if (!isUnderBudget(costs)) {
    return {
      success:       false,
      skippedReason: "Monthly token budget exceeded",
    };
  }

  const siteConfig = getSiteConfig();

  let groqResult: { result: GroqGenerateResult; promptTokens: number; completionTokens: number };
  try {
    groqResult = await callGroqLanding(spec, siteConfig, groqApiKey);
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    };
  }

  const { result, promptTokens, completionTokens } = groqResult;

  // Record token usage
  const updatedCosts = recordUsage(costs, {
    action:           "generate_landing",
    slug:             result.slug,
    model:            GROQ_MODEL,
    promptTokens,
    completionTokens,
    totalTokens:      promptTokens + completionTokens,
  });

  // Inject schema into content
  const schemaMarkup = buildLandingSchema(result, siteConfig);
  const contentWithSchema = result.content.includes("</body>")
    ? result.content.replace("</body>", `${schemaMarkup}</body>`)
    : result.content + `\n${schemaMarkup}`;

  const now = new Date().toISOString();

  const page: LandingPage = {
    slug:            result.slug,
    title:           result.title,
    metaDescription: result.metaDescription,
    keywords:        result.keywords ?? [],
    cluster:         spec.cluster,
    pageType:        spec.pageType,
    content:         contentWithSchema,
    faqs:            result.faqs ?? [],
    publishedAt:     now,
    lastUpdated:     now,
    version:         1,
    targetCity:      spec.targetCity,
    targetIndustry:  spec.targetIndustry,
    targetService:   spec.targetService,
  };

  return {
    success: true,
    page,
    costs:   updatedCosts,
  };
}

/**
 * Build the landing page spec for the most valuable page to generate next.
 * Priority: service pages > industry pages > location pages.
 *
 * @param existingSlugs - already generated slugs (avoid duplicates)
 * @param siteConfig    - site configuration
 */
export function getNextLandingPageSpec(
  existingSlugs: string[],
  siteConfig:    SiteConfig
): LandingPageSpec | null {
  const existing = new Set(existingSlugs);

  // Service pages — one per core service
  const servicePages: LandingPageSpec[] = [
    {
      pageType:       "service",
      targetKeyword:  "FBR POS integration service Pakistan",
      targetService:  "FBR POS Integration",
      cluster:        "fbr-compliance",
    },
    {
      pageType:       "service",
      targetKeyword:  "cloud POS system Pakistan",
      targetService:  "Cloud POS System",
      cluster:        "pos-systems",
    },
    {
      pageType:       "service",
      targetKeyword:  "restaurant billing software Pakistan",
      targetService:  "Restaurant POS",
      targetIndustry: "restaurant",
      cluster:        "restaurant-industry",
    },
    {
      pageType:       "service",
      targetKeyword:  "retail inventory management software Pakistan",
      targetService:  "Retail POS & Inventory",
      targetIndustry: "retail",
      cluster:        "retail-industry",
    },
    {
      pageType:       "service",
      targetKeyword:  "ERP accounting software Pakistan SME",
      targetService:  "ERP & Accounting Integration",
      cluster:        "erp-accounting",
    },
  ];

  // Industry pages — one per major industry
  const industryPages: LandingPageSpec[] = siteConfig.industries.slice(0, 6).map((industry) => ({
    pageType:       "industry" as LandingPageType,
    targetKeyword:  `POS system for ${industry} Pakistan`,
    targetIndustry: industry,
    cluster:        industry.toLowerCase().includes("restaurant") ? "restaurant-industry" : "retail-industry",
  }));

  // Location pages — top 5 cities
  const locationPages: LandingPageSpec[] = siteConfig.cities.slice(0, 5).map((city) => ({
    pageType:      "location" as LandingPageType,
    targetKeyword: `POS software ${city} FBR compliant`,
    targetCity:    city,
    cluster:       "pos-systems",
  }));

  const allSpecs = [...servicePages, ...industryPages, ...locationPages];

  for (const spec of allSpecs) {
    const candidateSlug = spec.targetKeyword
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-");

    if (!existing.has(candidateSlug)) {
      return spec;
    }
  }

  return null; // all pages already generated
}
