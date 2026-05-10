/**
 * lib/agent/seo/features.ts
 *
 * Single source of truth for SEO feature availability.
 * Every senior-SEO feature is OPTIONAL — if its env vars are not set,
 * the feature reports as disabled and the agent skips it gracefully.
 *
 * This is what makes the codebase a SaaS-grade product: tenants only
 * pay for what they enable, and we never crash on missing config.
 */

export interface SeoFeatureFlags {
  // Google ecosystem
  gsc:               boolean;   // Google Search Console (rank/traffic data)
  pageSpeedInsights: boolean;   // Core Web Vitals
  richResults:       boolean;   // Schema validation (always free)

  // DataForSEO (one credential set powers many features)
  dataForSeo:        boolean;
  rankTracking:      boolean;
  serpAnalysis:      boolean;
  paaScraping:       boolean;
  contentGaps:       boolean;
  backlinks:         boolean;

  // Distribution
  twitter:           boolean;
  linkedin:          boolean;

  // LLM (already required for content generation)
  groq:              boolean;
  claude:            boolean;
}

export function getSeoFeatures(): SeoFeatureFlags {
  const hasDataForSeo = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);

  return {
    gsc: !!(
      process.env.GSC_SITE_URL && (
        // OAuth2 refresh token (recommended)
        (process.env.GSC_CLIENT_ID && process.env.GSC_CLIENT_SECRET && process.env.GSC_REFRESH_TOKEN) ||
        // Service account JWT (fallback)
        (process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY)
      )
    ),
    pageSpeedInsights: !!process.env.PAGESPEED_API_KEY || true, // free tier works keyless (limited)
    richResults: true,                                          // always available

    dataForSeo:   hasDataForSeo,
    rankTracking: hasDataForSeo,
    serpAnalysis: hasDataForSeo,
    paaScraping:  hasDataForSeo,
    contentGaps:  hasDataForSeo,
    backlinks:    hasDataForSeo,

    twitter:  !!(process.env.TWITTER_BEARER_TOKEN || process.env.TWITTER_API_KEY),
    linkedin: !!process.env.LINKEDIN_ACCESS_TOKEN,

    groq:   !!process.env.GROQ_API_KEY,
    claude: !!process.env.ANTHROPIC_API_KEY,
  };
}

/**
 * Returns a human-readable list of which features are active vs idle.
 * Used by the admin dashboard's "what's enabled" panel.
 */
export function describeSeoFeatures(): { active: string[]; idle: string[] } {
  const f = getSeoFeatures();
  const map: Record<keyof SeoFeatureFlags, string> = {
    gsc:               "Google Search Console (impressions, clicks, position)",
    pageSpeedInsights: "Core Web Vitals monitoring",
    richResults:       "Structured-data validation",
    dataForSeo:        "DataForSEO API",
    rankTracking:      "Daily keyword rank tracking",
    serpAnalysis:      "SERP top-10 analysis",
    paaScraping:       "People Also Ask scraping",
    contentGaps:       "Competitor content-gap analysis",
    backlinks:         "Backlink monitoring",
    twitter:           "X / Twitter syndication",
    linkedin:          "LinkedIn syndication",
    groq:              "Groq LLM (bulk content)",
    claude:            "Claude / Anthropic LLM (briefs)",
  };
  const active: string[] = [];
  const idle:   string[] = [];
  for (const [k, v] of Object.entries(f)) {
    (v ? active : idle).push(map[k as keyof SeoFeatureFlags]);
  }
  return { active, idle };
}

/**
 * Wrap a feature-gated function with automatic skip handling.
 * If the required feature is disabled, returns a "skipped" envelope
 * instead of throwing.
 */
export async function ifEnabled<T>(
  feature: keyof SeoFeatureFlags,
  fn: () => Promise<T>,
): Promise<{ enabled: true; result: T } | { enabled: false; reason: string }> {
  const flags = getSeoFeatures();
  if (!flags[feature]) {
    return { enabled: false, reason: `Feature "${feature}" is not configured (env vars missing)` };
  }
  const result = await fn();
  return { enabled: true, result };
}
