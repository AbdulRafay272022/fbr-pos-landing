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
import { getActivePack } from "@/lib/niche/registry";

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
  // Defaults now come from the ACTIVE NICHE PACK (fbr-pos by default), so a new
  // niche needs no edits here — just set SITE_NICHE_PACK. Env vars still win,
  // allowing per-deployment overrides without code changes.
  const pack = getActivePack();
  const lead = pack.monetization.mode === "leadgen" ? pack.monetization : null;

  return {
    // Identity
    name:    env("SITE_NAME",    pack.name),
    niche:   env("SITE_NICHE",   pack.niche),
    country: env("SITE_COUNTRY", pack.country),
    baseUrl: env("SITE_BASE_URL", pack.baseUrl),

    // Seed keywords — core topics that drive keyword expansion
    seedKeywords: envList("SITE_SEED_KEYWORDS", pack.seedKeywords),

    // Industries to target in content
    industries: envList("SITE_INDUSTRIES", pack.industries),

    // Cities to target for local SEO
    cities: envList("SITE_CITIES", pack.cities),

    // Compliance/regulation terms specific to this niche
    complianceTerms: envList("SITE_COMPLIANCE_TERMS", pack.complianceTerms),

    // CTAs (lead-gen packs only; AdSense packs leave these empty)
    ctaWhatsApp: process.env.CTA_WHATSAPP ?? lead?.whatsapp,
    ctaText:     env("CTA_TEXT",     lead?.ctaText ?? ""),
    ctaSubtext:  process.env.CTA_SUBTEXT ?? lead?.ctaSubtext,

    // E-E-A-T author (shown on blog bylines + schema)
    authorName:  env("SITE_AUTHOR_NAME",  pack.author.name),
    authorTitle: env("SITE_AUTHOR_TITLE", pack.author.title),
    authorBio:   env("SITE_AUTHOR_BIO",   pack.author.bio),

    // Content quality
    minWordCount:     envNum("MIN_WORD_COUNT",     pack.thresholds.minWordCount),
    maxBlogsPerDay:   envNum("MAX_BLOGS_PER_DAY",  2),
    maxUpdatesPerDay: envNum("MAX_UPDATES_PER_DAY", 3),

    // Agent thresholds
    minUnusedKeywordsThreshold: envNum("MIN_UNUSED_KEYWORDS",    20),
    scrapeIntervalDays:         envNum("SCRAPE_INTERVAL_DAYS",    7),
    generateIntervalHours:      envNum("GENERATE_INTERVAL_HOURS", 20),
    updateIntervalHours:        envNum("UPDATE_INTERVAL_HOURS",   168), // 7 days (was 22h — too aggressive)
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
