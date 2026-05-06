/**
 * lib/keywordEngine.ts
 *
 * Keyword generation engine — pure, side-effect-free.
 *
 * v2: Accepts SiteConfig so the same engine works for any niche/country.
 * FBR Pakistan-specific curated keywords are injected when the config
 * matches that niche (detected by presence of "fbr" in seed keywords).
 */

import type { Keyword, KeywordIntent, KeywordDifficulty, SiteConfig } from "./types";

// ─── Stop words (for cluster/intent detection) ────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "in", "on", "at", "to",
  "for", "of", "with", "by", "from", "is", "how", "what",
  "step", "by", "guide", "complete",
]);

// ─── Intent classification (generic) ─────────────────────────────────────────

const COMMERCIAL_SIGNALS  = ["best", "top", "compare", "review", "recommended", "vs"];
const TRANSACTIONAL_SIGNALS = [
  "cost", "price", "how much", "affordable", "cheap", "hire", "services", "buy", "get",
];

function classifyIntent(keyword: string): KeywordIntent {
  const k = keyword.toLowerCase();
  if (COMMERCIAL_SIGNALS.some((s) => k.includes(s)))    return "commercial";
  if (TRANSACTIONAL_SIGNALS.some((s) => k.includes(s))) return "transactional";
  return "informational";
}

function classifyDifficulty(keyword: string): KeywordDifficulty {
  const words = keyword.trim().split(/\s+/).length;
  if (words <= 2) return "high";
  if (words <= 4) return "medium";
  return "low";
}

// ─── Generic scoring (works for any niche) ────────────────────────────────────

function scoreKeyword(keyword: string, config: SiteConfig): number {
  const k = keyword.toLowerCase();
  let score = 40;

  const words = k.split(/\s+/).length;
  if (words >= 5) score += 12;
  if (words >= 7) score += 8;

  // City-specific = local SEO bonus
  if (config.cities.some((c) => k.includes(c.toLowerCase()))) score += 15;

  // Problem / penalty terms = high-intent buyers
  const problemTerms = ["penalty", "fine", "violation", "error", "failed", "rejected", "blocked", "suspended"];
  if (problemTerms.some((t) => k.includes(t))) score += 22;

  // Price queries = purchase intent
  if (TRANSACTIONAL_SIGNALS.some((s) => k.includes(s))) score += 18;

  // Comparison
  if (COMMERCIAL_SIGNALS.some((s) => k.includes(s))) score += 12;

  // Informational (high traffic)
  if (k.includes("how to") || k.includes("guide")) score += 10;
  if (k.includes("what is") || k.includes("understanding")) score += 6;
  if (k.includes("step by step") || k.includes("checklist")) score += 10;

  // Seed keyword relevance boosts
  for (const seed of config.seedKeywords.slice(0, 10)) {
    if (k.includes(seed.toLowerCase().slice(0, 6))) score += 8;
  }

  // Industry-specific
  const industryHits = config.industries.filter((ind) =>
    k.includes(ind.split(" ")[0].toLowerCase())
  ).length;
  score += industryHits * 8;

  // Compliance term boosts (niche-specific)
  for (const term of config.complianceTerms) {
    if (k.includes(term.toLowerCase())) score += 6;
  }

  // Penalise too-short/generic
  if (words <= 2) score -= 25;
  if (words <= 1) score -= 30;

  return Math.min(100, Math.max(1, score));
}

// ─── Cluster detection (generic) ──────────────────────────────────────────────

function getCluster(keyword: string, config: SiteConfig): string {
  const k = keyword.toLowerCase();

  // City clusters
  for (const city of config.cities) {
    if (k.includes(city.toLowerCase())) return `city-${city.toLowerCase().replace(/\s+/g, "-")}`;
  }

  // Industry clusters
  for (const industry of config.industries) {
    const first = industry.split(" ")[0].toLowerCase();
    if (k.includes(first)) return `industry-${first}`;
  }

  // Generic signal clusters
  if (k.includes("penalty") || k.includes("fine") || k.includes("violation")) return "compliance-penalties";
  if (k.includes("registration") || k.includes("register")) return "registration";
  if (k.includes("invoice") || k.includes("e-invoicing")) return "invoicing";
  if (k.includes("token") || k.includes("api") || k.includes("sync") || k.includes("offline")) return "technical";
  if (k.includes("cost") || k.includes("price") || k.includes("how much")) return "pricing";
  if (k.includes("cloud") || k.includes("erp") || k.includes("software")) return "software";

  // Country-based fallback
  if (k.includes(config.country.toLowerCase())) return `general-${config.country.toLowerCase()}`;
  return "general";
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicate(keywords: string[]): string[] {
  const seen = new Set<string>();
  return keywords.filter((k) => {
    const norm = k.toLowerCase().trim();
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

// ─── Pattern generation ───────────────────────────────────────────────────────

const INFORMATIONAL_PREFIXES = [
  "how to", "what is", "how does", "guide to", "understanding",
  "what are", "how to setup", "how to configure", "step by step",
];

const COMMERCIAL_PREFIXES = [
  "best", "top", "compare", "review", "recommended",
];

const TRANSACTIONAL_PREFIXES = [
  "cost of", "price of", "how much does", "affordable", "hire", "services for",
];

const PROBLEM_TERMS = [
  "penalty", "fine", "violation", "error", "not working",
  "failed", "rejected", "blocked", "issue",
];

const INTENT_MODIFIERS = [
  "requirements", "setup", "cost", "benefits", "penalty",
  "guide", "checklist", "steps", "process", "deadline",
];

// ─── PAA (People Also Ask) expansion patterns ─────────────────────────────────

/**
 * PAA templates that mirror Google's "People Also Ask" question boxes.
 * These are extremely long-tail, voice-search optimised, and featured-snippet
 * friendly — typically 0 competition with direct answer opportunities.
 */
const PAA_TEMPLATES = [
  (seed: string, country: string) => `do i need ${seed} for my business in ${country}`,
  (seed: string, country: string) => `what happens if you don't use ${seed} in ${country}`,
  (seed: string, country: string) => `is ${seed} mandatory in ${country}`,
  (seed: string, country: string) => `how long does ${seed} setup take in ${country}`,
  (seed: string, country: string) => `what documents are needed for ${seed} in ${country}`,
  (seed: string, country: string) => `can small businesses use ${seed} in ${country}`,
  (seed: string, country: string) => `what is the penalty for not having ${seed} in ${country}`,
  (seed: string, country: string) => `when did ${seed} become mandatory in ${country}`,
  (seed: string, country: string) => `how much does ${seed} cost per month in ${country}`,
  (seed: string, country: string) => `which ${seed} software is approved in ${country}`,
  (seed: string, _country: string) => `${seed} for small shop owner beginner guide`,
  (seed: string, _country: string) => `difference between ${seed} free and paid plans`,
  (seed: string, country: string)  => `how to switch from old system to ${seed} ${country}`,
  (seed: string, country: string)  => `what industries require ${seed} in ${country}`,
  (seed: string, _country: string) => `${seed} troubleshooting common errors`,
];

/**
 * Long-tail question clusters targeting "People Also Ask" boxes.
 * Returns ~15 PAA keywords per seed × country combination.
 */
function generatePaaKeywords(config: SiteConfig): string[] {
  const raw: string[] = [];
  const country = config.country.toLowerCase();

  for (const seed of config.seedKeywords.slice(0, 8)) {
    for (const tpl of PAA_TEMPLATES) {
      raw.push(tpl(seed, country));
    }
    // Industry-specific PAA
    for (const industry of config.industries.slice(0, 6)) {
      raw.push(`does ${industry} need ${seed} in ${country}`);
      raw.push(`how does ${seed} work for ${industry} businesses`);
    }
  }

  return raw;
}

// ─── Long-tail clustering via n-gram similarity ───────────────────────────────

/**
 * Group keywords into thematic clusters using shared n-gram overlap.
 * Used to ensure we generate at least one keyword from each cluster,
 * providing breadth across topics rather than depth in one area.
 *
 * Returns a Map<clusterName, keyword[]> for all generated keywords.
 */
export function clusterKeywordsByNgram(
  keywords: string[],
  minOverlap = 2
): Map<string, string[]> {
  const clusters = new Map<string, string[]>();

  for (const kw of keywords) {
    const tokens = kw.toLowerCase().split(/\s+/).filter((t) => !STOP_WORDS.has(t));
    // Identify the best cluster based on token overlap with existing cluster seeds
    let bestCluster = "";
    let bestOverlap = 0;

    for (const [clusterSeed] of clusters) {
      const seedTokens = clusterSeed.split("_");
      const overlap    = tokens.filter((t) => seedTokens.includes(t)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCluster = clusterSeed;
      }
    }

    if (bestOverlap >= minOverlap) {
      clusters.get(bestCluster)!.push(kw);
    } else {
      // Create a new cluster keyed by first 2 non-stop tokens
      const clusterKey = tokens.slice(0, 2).join("_") || kw.slice(0, 12);
      if (!clusters.has(clusterKey)) clusters.set(clusterKey, []);
      clusters.get(clusterKey)!.push(kw);
    }
  }

  return clusters;
}

/**
 * From a set of keyword clusters, pick the top-scoring keyword per cluster.
 * This ensures even low-volume clusters get representation.
 */
export function pickClusterRepresentatives(
  clusters: Map<string, string[]>,
  scored: Map<string, number>
): string[] {
  const representatives: string[] = [];
  for (const [, keywords] of clusters) {
    const best = keywords.sort(
      (a, b) => (scored.get(b) ?? 0) - (scored.get(a) ?? 0)
    )[0];
    if (best) representatives.push(best);
  }
  return representatives;
}

function generateRawKeywords(config: SiteConfig): string[] {
  const raw: string[] = [];
  const country = config.country.toLowerCase();

  // Pattern 1: seed × city
  for (const seed of config.seedKeywords) {
    for (const city of config.cities) {
      raw.push(`${seed} in ${city}`);
      raw.push(`${seed} for ${city} businesses`);
    }
  }

  // Pattern 2: seed × industry
  for (const seed of config.seedKeywords) {
    for (const industry of config.industries) {
      raw.push(`${seed} for ${industry}`);
      raw.push(`${seed} for ${industry} in ${country}`);
    }
  }

  // Pattern 3: informational × seed
  for (const prefix of INFORMATIONAL_PREFIXES) {
    for (const seed of config.seedKeywords) {
      raw.push(`${prefix} ${seed}`);
      raw.push(`${prefix} ${seed} in ${country}`);
    }
  }

  // Pattern 4: commercial × seed
  for (const prefix of COMMERCIAL_PREFIXES) {
    for (const seed of config.seedKeywords) {
      raw.push(`${prefix} ${seed} ${country}`);
    }
  }

  // Pattern 5: transactional × seed (top seeds only)
  for (const prefix of TRANSACTIONAL_PREFIXES) {
    for (const seed of config.seedKeywords.slice(0, 10)) {
      raw.push(`${prefix} ${seed} ${country}`);
    }
  }

  // Pattern 6: industry × city × first seed
  const primarySeed = config.seedKeywords[0] ?? config.niche;
  for (const industry of config.industries.slice(0, 12)) {
    for (const city of config.cities.slice(0, 8)) {
      raw.push(`${primarySeed} for ${industry} in ${city} ${country}`);
      raw.push(`best ${primarySeed} for ${industry} in ${city}`);
    }
  }

  // Pattern 7: problem patterns
  for (const problem of PROBLEM_TERMS) {
    for (const seed of config.seedKeywords.slice(0, 6)) {
      raw.push(`${seed} ${problem} ${country}`);
      raw.push(`how to fix ${seed} ${problem} ${country}`);
    }
  }

  // Pattern 8: intent modifiers × seeds
  for (const modifier of INTENT_MODIFIERS) {
    for (const seed of config.seedKeywords.slice(0, 10)) {
      raw.push(`${seed} ${modifier} ${country}`);
    }
  }

  // Pattern 9: A–Z expansion on top 5 seeds
  for (const seed of config.seedKeywords.slice(0, 5)) {
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      raw.push(`${seed} ${letter}`);
    }
  }

  // Pattern 10: PAA (People Also Ask) expansion ─────────────────────────────
  raw.push(...generatePaaKeywords(config));

  return raw;
}

// ─── FBR Pakistan curated keywords (niche-specific, high-value) ───────────────

function isFbrPakistanSite(config: SiteConfig): boolean {
  const niche = config.niche.toLowerCase();
  return (
    niche.includes("fbr") ||
    config.seedKeywords.some((s) => s.toLowerCase().includes("fbr"))
  );
}

const FBR_CURATED: string[] = [
  "fbr pos system token expiry fix pakistan",
  "fbr iris api integration guide pakistan 2026",
  "offline pos sync fbr pakistan how to",
  "fbr qr code invoice generator pakistan",
  "fbr sales tax monthly return automation pakistan",
  "tier 1 retailer fbr requirements pakistan 2026",
  "fbr pos penalty non-compliance pakistan 2026",
  "how to get strn pakistan step by step guide",
  "fbr e-invoicing api documentation pakistan",
  "pos software approved by fbr pakistan list",
  "fbr compliance karachi retail businesses 2026",
  "fbr pos lahore pharmacy owners guide",
  "fbr compliance islamabad restaurants 2026",
  "fbr invoice format requirements pakistan 2026",
  "best erp for fbr compliance pakistan 2026",
  "cloud pos system fbr integrated pakistan",
  "fbr pos multi branch retail chain pakistan",
  "fbr compliance audit small business pakistan",
  "how to register fbr pos terminal step by step",
  "fbr pos offline mode compliance pakistan",
  "fbr pos integration cost pakistan small business",
  "fbr compliance deadline pakistan 2026",
  "fbr qr invoice scan verify pakistan customer",
  "fbr pos cash vs card transactions pakistan",
  "erp software fbr integrated pakistan affordable",
  "fbr pos integration for textile shop pakistan",
  "fbr compliance for jewelry shop pakistan",
  "fbr compliance for shoe store pakistan",
  "fbr pos for wholesale distributors karachi",
  "fbr pos system faisalabad businesses",
  "fbr compliance multan retailers guide",
  "fbr pos sialkot exporters compliance",
  "how to avoid fbr penalty pakistan business",
  "fbr iris portal login issues fix pakistan",
  "fbr strn suspended how to restore pakistan",
  "fbr pos daily sales report automation pakistan",
  "fbr invoice rejected troubleshoot pakistan",
  "fbr pos sync failed how to fix pakistan",
  "monthly fbr return filing pos data pakistan",
  "fbr compliance for new business registration pakistan",
  "fbr pos hardware requirements pakistan 2026",
  "fbr tier 2 retailer compliance pakistan",
  "fbr pos integration timeline pakistan business",
  "how much does fbr pos cost pakistan per month",
  "fbr compliance for online shop pakistan",
  "fbr pos for food delivery business pakistan",
  "fbr invoice dispute resolution pakistan",
  "fbr pos system for clinic pakistan",
  "fbr compliance for cosmetics store pakistan",
  "fbr pos for bakery pakistan 2026",
];

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Generate a large pool of unique, scored keywords for the given site config.
 * @param config          - site configuration (niche, cities, industries, etc.)
 * @param existingKeywords - normalized (lowercase) set of already-known keywords to skip
 */
export function generateKeywords(
  config: SiteConfig,
  existingKeywords: Set<string>
): Keyword[] {
  const raw = generateRawKeywords(config);

  // Inject niche-specific curated keywords if applicable
  if (isFbrPakistanSite(config)) {
    raw.push(...FBR_CURATED);
  }

  const unique = deduplicate(raw);
  const now    = new Date().toISOString();

  return unique
    .filter((k) => {
      const norm = k.toLowerCase().trim();
      return norm.length > 10 && norm.length < 120 && !existingKeywords.has(norm);
    })
    .map((k) => ({
      keyword:    k.trim(),
      intent:     classifyIntent(k),
      difficulty: classifyDifficulty(k),
      priority:   scoreKeyword(k, config),
      cluster:    getCluster(k, config),
      used:       false,
      usedIn:     null,
      generatedAt: now,
    }))
    .sort((a, b) => b.priority - a.priority);
}

// ─── Helpers (unchanged public API) ──────────────────────────────────────────

export function pickBestKeyword(keywords: Keyword[]): Keyword | null {
  return keywords.find((k) => !k.used) ?? null;
}

export function slugifyKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function clusterToIndustry(cluster: string): string {
  const map: Record<string, string> = {
    "industry-pharmacy":     "Pharmacy / Medical Retail",
    "industry-restaurant":   "Food & Beverage",
    "industry-retail":       "Retail / General",
    "industry-wholesale":    "Wholesale / Distribution",
    "industry-hotel":        "Hospitality",
    "compliance-penalties":  "General Business / Compliance",
    "registration":          "General Business / Registration",
    "invoicing":             "General Business / Invoicing",
    "technical":             "General Business / Technical",
    "pricing":               "General Business / Pricing",
    "software":              "General Business / Software",
  };

  // City clusters
  if (cluster.startsWith("city-")) {
    const city = cluster.replace("city-", "");
    return `Retail / General (${city.charAt(0).toUpperCase() + city.slice(1)})`;
  }

  return map[cluster] ?? "General Business";
}
