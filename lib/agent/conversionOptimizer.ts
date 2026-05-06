/**
 * lib/agent/conversionOptimizer.ts
 *
 * Conversion optimizer — Phase 5.
 *
 * Detects high-traffic / low-conversion pages and rewrites their CTA blocks
 * to improve click-through rates. Uses a combination of:
 *   - data/seo.json     (impression + position data from GSC)
 *   - data/conversions.json  (CTA click rates by slug)
 *   - data/engagement.json   (scroll depth + time on page)
 *
 * Strategy:
 *   1. Score each page: impressionScore + positionScore - conversionScore
 *   2. Flag pages above the OPTIMIZATION_THRESHOLD
 *   3. For flagged pages, rewrite the CTA using one of 8 variant copy sets
 *   4. Vary CTA position (mid vs end vs both) based on engagement data
 *   5. Return list of pages needing HTML updates + the new CTA HTML
 *
 * Architecture: pure functions, no direct I/O.
 * The API route handles reading/writing. This file is pure logic.
 */

import type { SiteConfig } from "@/lib/types";
import type { ConversionData, SeoData, EngagementData } from "@/lib/types";

// ─── CTA variant library ──────────────────────────────────────────────────────

interface CtaVariant {
  id:        string;
  /** Short headline for the CTA block */
  headline:  string;
  /** Sub-text below the headline */
  subtext:   string;
  /** Button label */
  buttonText: string;
  /** Emoji prefix on button */
  emoji:     string;
  /** Which position this variant works best for */
  position:  "mid" | "end" | "both";
}

const CTA_VARIANTS: CtaVariant[] = [
  {
    id:         "urgency-1",
    headline:   "⚡ Get FBR-Compliant Before the Deadline",
    subtext:    "FBR inspections are increasing. Don't risk a PKR 500,000 fine — get compliant today.",
    buttonText: "Book Free Demo Now",
    emoji:      "💬",
    position:   "end",
  },
  {
    id:         "social-proof-1",
    headline:   "Join 500+ Businesses Already Compliant",
    subtext:    "From Karachi to Lahore, Pakistan's fastest-growing retailers trust Phelix ERP for FBR compliance.",
    buttonText: "See How It Works",
    emoji:      "✅",
    position:   "mid",
  },
  {
    id:         "risk-reversal-1",
    headline:   "Try Phelix ERP — Zero Risk, Full Compliance",
    subtext:    "Free setup, 30-day trial, and our team handles your FBR IRIS integration. No tech knowledge needed.",
    buttonText: "Start Free Trial",
    emoji:      "🚀",
    position:   "end",
  },
  {
    id:         "pain-point-1",
    headline:   "Tired of FBR Compliance Confusion?",
    subtext:    "Stop worrying about SRO 1006, QR invoices, and FBR API errors. We handle everything for you.",
    buttonText: "Talk to an Expert",
    emoji:      "📞",
    position:   "mid",
  },
  {
    id:         "value-prop-1",
    headline:   "One System. FBR Compliant. Fully Integrated.",
    subtext:    "POS + Inventory + Accounting + FBR Integration — all in one cloud platform built for Pakistani SMEs.",
    buttonText: "Get a Free Quote",
    emoji:      "💰",
    position:   "both",
  },
  {
    id:         "local-trust-1",
    headline:   "Pakistan's #1 FBR-Certified POS System",
    subtext:    "Trusted by restaurants, pharmacies, retail stores, and distributors across all major cities.",
    buttonText: "Book WhatsApp Demo",
    emoji:      "🇵🇰",
    position:   "end",
  },
  {
    id:         "speed-1",
    headline:   "FBR Integration Done in 24 Hours",
    subtext:    "Our team handles setup, staff training, and FBR IRIS configuration. You focus on sales.",
    buttonText: "Get Started Today",
    emoji:      "⏱️",
    position:   "both",
  },
  {
    id:         "penalty-fear-1",
    headline:   "⚠️ Non-Compliant POS = PKR 10,000/Day Fine",
    subtext:    "FBR's enforcement is real. Switch to a compliant system before your next audit.",
    buttonText: "Fix My Compliance Now",
    emoji:      "🛡️",
    position:   "end",
  },
];

// ─── Optimization threshold logic ─────────────────────────────────────────────

/** Min impressions before we consider a page for optimization */
const MIN_IMPRESSIONS = 100;
/** Max position (average rank) — above this = page has enough traffic to optimise */
const MAX_POSITION    = 30;
/** Conversion rate below this = needs optimisation (clicks / impressions proxy) */
const LOW_CONV_RATE   = 0.015; // 1.5% of page visitors click a CTA

export interface OptimizationCandidate {
  slug:             string;
  impressions:      number;
  position:         number;
  conversionRate:   number;
  avgScrollDepth:   number;
  suggestedVariant: CtaVariant;
  suggestedPosition: "mid" | "end" | "both";
  reason:           string;
}

/**
 * Identify pages that need CTA optimization.
 * Returns ranked list (worst converters first).
 */
export function detectOptimizationCandidates(
  seoData:        SeoData,
  conversionData: ConversionData,
  engagementData: EngagementData | null,
  maxCandidates = 3
): OptimizationCandidate[] {
  if (!seoData.pages.length) return [];

  const candidates: OptimizationCandidate[] = [];

  for (const page of seoData.pages) {
    // Skip low-traffic pages
    if (page.impressions < MIN_IMPRESSIONS) continue;
    if (page.position > MAX_POSITION) continue;

    // Compute conversion rate from conversion data
    const convCount    = conversionData.summary.bySlug[page.slug] ?? 0;
    const convRate     = page.impressions > 0 ? convCount / page.impressions : 0;
    const isLowConv    = convRate < LOW_CONV_RATE;

    if (!isLowConv) continue;

    // Get engagement data if available
    const engagement   = engagementData?.summary?.[page.slug];
    const avgScroll    = engagement?.avgScrollDepth ?? 50;
    const avgTime      = engagement?.avgTimeOnPage ?? 30;
    const bounceRate   = engagement?.bounceRate ?? 0.5;

    // Determine best CTA position
    let suggestedPos: "mid" | "end" | "both";
    if (avgScroll < 40 || bounceRate > 0.7) {
      // Users leaving early → put CTA earlier (mid)
      suggestedPos = "mid";
    } else if (avgScroll > 75 && avgTime > 60) {
      // Users reading to the end → end CTA is enough
      suggestedPos = "end";
    } else {
      // Mixed engagement → show both
      suggestedPos = "both";
    }

    // Pick variant deterministically (based on slug hash)
    const hash = page.slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

    // Filter variants matching suggested position
    const compatible = CTA_VARIANTS.filter(
      (v) => v.position === suggestedPos || v.position === "both"
    );
    const variant = compatible[hash % compatible.length] ?? CTA_VARIANTS[0];

    const reason = [
      `${page.impressions} impressions`,
      `position ${page.position.toFixed(1)}`,
      `${(convRate * 100).toFixed(2)}% conv rate`,
      avgScroll < 40 ? `low scroll depth (${avgScroll.toFixed(0)}%)` : "",
    ].filter(Boolean).join(", ");

    candidates.push({
      slug:              page.slug,
      impressions:       page.impressions,
      position:          page.position,
      conversionRate:    convRate,
      avgScrollDepth:    avgScroll,
      suggestedVariant:  variant,
      suggestedPosition: suggestedPos,
      reason,
    });
  }

  // Sort: lowest conversion rate first
  return candidates
    .sort((a, b) => a.conversionRate - b.conversionRate)
    .slice(0, maxCandidates);
}

// ─── CTA HTML builder ─────────────────────────────────────────────────────────

/**
 * Build the new CTA HTML block for a candidate page.
 */
export function buildOptimizedCTA(
  candidate:  OptimizationCandidate,
  siteConfig: SiteConfig
): { midCta: string; endCta: string } {
  const ctaPhone = siteConfig.ctaWhatsApp ?? "923001234567";
  const ctaUrl   = `https://wa.me/${ctaPhone}`;
  const v        = candidate.suggestedVariant;
  const slug     = candidate.slug;

  const midCta = `
<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:28px;margin:32px 0;text-align:center;" data-cta-block="${slug}-opt" data-cta-pos="mid">
  <p style="font-weight:700;font-size:1.1rem;color:#1C1917;margin:0 0 10px;">${v.headline}</p>
  <p style="color:#57534E;margin:0 0 18px;font-size:0.95rem;">${v.subtext}</p>
  <a href="${ctaUrl}" style="display:inline-block;background:#F97316;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;" data-cta-id="${slug}-mid-opt">${v.emoji} ${v.buttonText}</a>
</div>`.trim();

  const endCta = `
<div style="background:#F97316;padding:44px;border-radius:16px;text-align:center;color:#fff;margin:40px 0;" data-cta-block="${slug}-end-opt" data-cta-pos="end">
  <h2 style="color:#fff;font-size:1.6rem;margin:0 0 14px;">${v.headline}</h2>
  <p style="color:#FFF7ED;margin:0 0 22px;">${v.subtext}</p>
  <a href="${ctaUrl}" style="display:inline-block;background:#fff;color:#F97316;padding:14px 32px;border-radius:8px;font-weight:800;text-decoration:none;" data-cta-id="${slug}-end-opt">${v.emoji} ${v.buttonText}</a>
</div>`.trim();

  return { midCta, endCta };
}

/**
 * Apply the optimized CTA to a page's HTML content.
 * Replaces existing CTA blocks while preserving all other content.
 */
export function applyOptimizedCTA(
  html:      string,
  candidate: OptimizationCandidate,
  siteConfig: SiteConfig
): string {
  const { midCta, endCta } = buildOptimizedCTA(candidate, siteConfig);
  let result = html;

  // Replace end CTA: find existing data-cta-pos="end" block
  const endCtaPattern = /(<div[^>]+data-cta-pos="end"[^>]*>[\s\S]*?<\/div>)/i;
  if (endCtaPattern.test(result)) {
    result = result.replace(endCtaPattern, endCta);
  } else {
    // Append before </body> or at end
    result = result.includes("</body>")
      ? result.replace("</body>", `${endCta}\n</body>`)
      : result + `\n${endCta}`;
  }

  // Replace mid CTA: find existing data-cta-pos="mid" block
  if (candidate.suggestedPosition === "mid" || candidate.suggestedPosition === "both") {
    const midCtaPattern = /(<div[^>]+data-cta-pos="mid"[^>]*>[\s\S]*?<\/div>)/i;
    if (midCtaPattern.test(result)) {
      result = result.replace(midCtaPattern, midCta);
    } else {
      // Inject after 3rd </h2>
      let h2Count = 0;
      result = result.replace(/<\/h2>/gi, (match) => {
        h2Count++;
        if (h2Count === 3) {
          return `</h2>\n${midCta}`;
        }
        return match;
      });
    }
  }

  return result;
}
