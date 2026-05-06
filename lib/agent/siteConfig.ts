/**
 * lib/agent/siteConfig.ts
 *
 * SiteConfig is the single source of truth for ALL site-specific values.
 * No hardcoded strings should exist outside this file.
 *
 * Multi-tenant deployment: each Vercel project has its own env vars.
 * A new site = a new Vercel project with different SITE_* env vars.
 *
 * For this deployment (Phelix ERP), defaults are pre-filled from env or
 * hardcoded fallbacks. Override any value via environment variables.
 */

import type { SiteConfig } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return isNaN(parsed) ? fallback : parsed;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build the SiteConfig from environment variables with hardcoded defaults.
 * Called once per request — no caching needed (serverless).
 */
export function getSiteConfig(): SiteConfig {
  return {
    // Identity
    name:    env("SITE_NAME",    "Phelix ERP"),
    niche:   env("SITE_NICHE",   "FBR POS Compliance Pakistan"),
    country: env("SITE_COUNTRY", "Pakistan"),
    baseUrl: env("SITE_BASE_URL", "https://phelixerp.vercel.app"),

    // Seed keywords — core topics that drive keyword expansion
    seedKeywords: envList("SITE_SEED_KEYWORDS", [
      "fbr pos system",
      "fbr compliance",
      "fbr pos integration",
      "fbr invoice",
      "fbr registration",
      "fbr penalty",
      "fbr qr invoice",
      "fbr iris portal",
      "fbr sales tax",
      "fbr tier 1 retailer",
      "fbr e-invoicing",
      "pos system",
      "erp software",
      "strn registration",
      "fbr api integration",
      "fbr token expiry fix",
      "fbr offline sync pos",
      "fbr compliance checklist",
      "fbr sales tax return",
      "multi branch pos",
    ]),

    // Industries to target in content
    industries: envList("SITE_INDUSTRIES", [
      "retail",
      "restaurant",
      "pharmacy",
      "clinic",
      "clothing store",
      "electronics shop",
      "grocery store",
      "hardware store",
      "bakery",
      "boutique",
      "supermarket",
      "hotel",
      "cafe",
      "textile",
      "shoe store",
      "jewelry shop",
      "cosmetics store",
      "medical store",
      "mobile phone shop",
      "auto parts shop",
      "wholesale distributor",
    ]),

    // Cities to target for local SEO
    cities: envList("SITE_CITIES", [
      "karachi",
      "lahore",
      "islamabad",
      "rawalpindi",
      "faisalabad",
      "multan",
      "peshawar",
      "quetta",
      "sialkot",
      "gujranwala",
      "hyderabad",
      "bahawalpur",
      "sargodha",
    ]),

    // Compliance/regulation terms specific to this niche
    complianceTerms: envList("SITE_COMPLIANCE_TERMS", [
      "FBR IRIS",
      "STRN",
      "SRO",
      "Tier-1 Retailer",
      "Sales Tax Act",
      "QR Invoice",
      "POS Terminal",
      "FBR IRIS Portal",
      "Sales Tax Return",
      "FBR API",
    ]),

    // CTAs
    ctaWhatsApp: env("CTA_WHATSAPP", "923118366981"),
    ctaText:     env("CTA_TEXT",     "Get Phelix ERP set up in 24 hours — free WhatsApp demo, no commitment"),
    ctaSubtext:  env("CTA_SUBTEXT",  "Our team handles FBR IRIS setup, QR invoicing, and staff training"),

    // E-E-A-T author (shown on blog bylines + schema)
    authorName:  env("SITE_AUTHOR_NAME",  "Phelix ERP Team"),
    authorTitle: env("SITE_AUTHOR_TITLE", "FBR Compliance Specialists"),
    authorBio:   env("SITE_AUTHOR_BIO",   "The Phelix ERP team has helped 20+ Pakistani businesses across Karachi, Lahore, and Islamabad achieve FBR POS compliance. We specialise in IRIS integration, QR invoicing, and automated sales-tax workflows for retail, restaurants, and pharmacies."),

    // Content quality
    minWordCount:     envNum("MIN_WORD_COUNT",     1200),
    maxBlogsPerDay:   envNum("MAX_BLOGS_PER_DAY",  2),
    maxUpdatesPerDay: envNum("MAX_UPDATES_PER_DAY", 3),

    // Agent thresholds
    minUnusedKeywordsThreshold: envNum("MIN_UNUSED_KEYWORDS",    20),
    scrapeIntervalDays:         envNum("SCRAPE_INTERVAL_DAYS",    7),
    generateIntervalHours:      envNum("GENERATE_INTERVAL_HOURS", 20),
    updateIntervalHours:        envNum("UPDATE_INTERVAL_HOURS",   22),
    updateAfterDays:            envNum("UPDATE_AFTER_DAYS",       7),
    skipIfUpdatedWithinDays:    envNum("SKIP_IF_UPDATED_DAYS",    30),
  };
}

/** Get GitHub connection details from env */
export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export function getGitHubConfig(): GitHubConfig | null {
  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch };
}
