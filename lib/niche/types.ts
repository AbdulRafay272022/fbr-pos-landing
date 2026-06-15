/**
 * lib/niche/types.ts
 *
 * THE NichePack — the single, typed source of truth for everything
 * site-specific. One pack = one niche/site. Adding a new niche (sports,
 * accounting, travel…) is a config-only operation: drop a new pack file
 * in lib/niche/packs/ and set SITE_NICHE_PACK.
 *
 * This collapses the three previously-competing config systems
 * (siteConfig.ts env vars, data/niche-config.json, and ~950 hardcoded
 * literals) into one object that every module reads from.
 *
 * Nothing niche-specific should be hardcoded outside a pack ever again.
 */

import type { BlogFaq, TopicCluster } from "@/lib/types";

// ─── Monetization (pluggable strategy) ─────────────────────────────────────────

export type MonetizationMode = "adsense" | "leadgen";

/** AdSense: maximise pageviews + dwell + ad viewability. No outbound CTAs. */
export interface AdSenseConfig {
  mode: "adsense";
  /** ca-pub-XXXXXXXXXXXXXXXX (also read from ADSENSE_CLIENT_ID env if absent) */
  clientId: string;
  slots: {
    /** in-article responsive unit slot id */
    inArticle: string;
    /** optional sidebar/footer slot ids */
    footer?: string;
  };
  /** Inject one in-article unit roughly every N words of content. */
  adDensityWords: number;
}

/** Lead-gen: drive conversions off-page (WhatsApp / form / tool). */
export interface LeadGenConfig {
  mode: "leadgen";
  /** Digits only, e.g. "923118366981" */
  whatsapp?: string;
  /** Primary CTA button text */
  ctaText: string;
  /** Supporting line under the headline */
  ctaSubtext?: string;
  /** Optional secondary tool link, e.g. "/fbr-checker" */
  toolHref?: string;
  toolText?: string;
}

export type MonetizationConfig = AdSenseConfig | LeadGenConfig;

// ─── Prompt profile (drives the LLM, fully niche-agnostic) ──────────────────────

export interface PromptProfile {
  /** e.g. "expert FBR compliance strategist" / "veteran football analyst" */
  persona: string;
  /** Who the content is for. */
  audience: string;
  /** STRICT domain rules — injected verbatim as bullet points. */
  domainRules: string[];
  /** Concrete must-include checklist (e.g. "a specific PKR penalty amount"). */
  mustInclude: string[];
  /** LSI / semantic terms to weave in naturally. */
  lsiTerms: string[];
  /** Entity ALLOW list — only these (plus niche dictionary) are valid entities. */
  entityAllow: string[];
  /** Entity DENY list — tokens that must never be treated as entities
   *  (kills the "System of a Down" Wikidata-disambiguation bug for broad niches). */
  entityDeny: string[];
  /** Internal-link topics the writer should reference. */
  internalTopics: string[];
}

// ─── Fallback topics (used only when the keyword pool is empty) ─────────────────

export interface FallbackTopic {
  keyword: string;
  slug: string;
  industry: string;
  businessType: string;
  keywords: string[];
  internalTopics: string[];
}

/** Input the niche-safe template builder receives. */
export interface TemplateInput {
  keyword: string;
  primaryKeyword?: string;
  industry?: string;
}

export interface TemplateOutput {
  html: string;
  faqs: BlogFaq[];
}

// ─── The pack itself ────────────────────────────────────────────────────────────

export interface NichePack {
  /** Stable id, also the value of SITE_NICHE_PACK. */
  id: string;

  // Identity
  name: string;
  niche: string;
  country: string;
  language: string;
  baseUrl: string;

  // Targeting
  cities: string[];
  industries: string[];
  /** Regulation/jargon terms (empty for niches with no compliance angle). */
  complianceTerms: string[];
  seedKeywords: string[];

  // E-E-A-T
  author: { name: string; title: string; bio: string };

  // LLM behaviour
  prompt: PromptProfile;

  // Monetization strategy
  monetization: MonetizationConfig;

  /** Topic clusters for internal-linking / pillar strategy. Falls back to the
   *  fbr-pos defaults when omitted. */
  clusters?: TopicCluster[];

  // Fallbacks
  fallbackTopics: FallbackTopic[];
  /** Niche-safe article emitted when the LLM fails the quality gate. */
  buildTemplate: (input: TemplateInput) => TemplateOutput;

  // Content thresholds
  thresholds: { minWordCount: number };
}
