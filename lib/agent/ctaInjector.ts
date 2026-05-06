/**
 * lib/agent/ctaInjector.ts
 *
 * Smart CTA (Call-to-Action) injection engine.
 *
 * Injects two CTA blocks per blog post:
 *   1. MID-CONTENT CTA  — after the 3rd <h2> section (when readers are engaged)
 *   2. END CTA          — before the closing </article> or at the very end
 *
 * CTA variants are chosen based on the blog's topic cluster:
 *   - compliance     → "Check your FBR compliance score free"
 *   - pricing/cost   → "See transparent pricing — no surprises"
 *   - technical      → "Get expert FBR API integration help"
 *   - city-specific  → "Serving [City] businesses — get a local demo"
 *   - default        → "Get your free FBR compliance audit today"
 *
 * Each CTA has:
 *   - A headline
 *   - A supporting line (value prop)
 *   - A primary button (WhatsApp CTA with tracking data-attr)
 *   - A secondary link (FBR checker tool)
 *
 * Tracking: CTAs include data-cta-id attributes for client-side
 * conversion tracking via the conversionTracker module.
 */

import type { SiteConfig } from "@/lib/types";

// ─── CTA variant definitions ──────────────────────────────────────────────────

interface CtaVariant {
  id:        string;
  headline:  string;
  subline:   string;
  btnText:   string;
  btnHref:   string;
  linkText?: string;
  linkHref?: string;
}

function buildVariants(config: SiteConfig): Record<string, CtaVariant> {
  const wa = config.ctaWhatsApp
    ? `https://wa.me/${config.ctaWhatsApp.replace(/[^0-9]/g, "")}`
    : "https://wa.me/923118366981";

  return {
    compliance: {
      id:       "compliance-audit",
      headline: "Is your business FBR compliant?",
      subline:  "Get a free compliance audit in 24 hours. Our team checks your IRIS setup, POS integration, and STRN status.",
      btnText:  "Get Free Compliance Audit",
      btnHref:  wa,
      linkText: "Check your score instantly →",
      linkHref: "/fbr-checker",
    },
    penalty: {
      id:       "penalty-help",
      headline: "Avoid FBR penalties before the deadline.",
      subline:  "Our compliance team has helped 200+ Pakistani businesses avoid fines. Get expert help on WhatsApp — we respond in minutes.",
      btnText:  "Talk to FBR Expert Now",
      btnHref:  wa,
      linkText: "See penalty calculator →",
      linkHref: "/fbr-checker",
    },
    pricing: {
      id:       "pricing-cta",
      headline: `${config.name} pricing — from PKR 3,500/month.`,
      subline:  "All-in-one FBR POS compliance: hardware setup, IRIS integration, staff training, and ongoing support included.",
      btnText:  "Get Pricing on WhatsApp",
      btnHref:  wa,
      linkText: "View full pricing →",
      linkHref: "/pricing",
    },
    technical: {
      id:       "technical-help",
      headline: "Having FBR API or sync issues?",
      subline:  "Our engineers fix token expiry, offline sync failures, and IRIS connection issues. Remote support available today.",
      btnText:  "Get Technical Support",
      btnHref:  wa,
    },
    default: {
      id:       "default-demo",
      headline: `Get ${config.name} — FBR compliant in 24 hours.`,
      subline:  config.ctaSubtext ?? "Pakistan's easiest FBR POS integration. Complete setup handled by our team. Free WhatsApp demo.",
      btnText:  config.ctaText,
      btnHref:  wa,
      linkText: "Check compliance score →",
      linkHref: "/fbr-checker",
    },
  };
}

// ─── Variant selection ────────────────────────────────────────────────────────

function selectVariant(
  cluster:  string,
  keywords: string[],
  variants: Record<string, CtaVariant>
): CtaVariant {
  const kwStr = keywords.join(" ").toLowerCase();
  const cl    = cluster.toLowerCase();

  if (cl.includes("penalty") || kwStr.includes("penalty") || kwStr.includes("fine")) {
    return variants.penalty;
  }
  if (cl.includes("pricing") || kwStr.includes("cost") || kwStr.includes("price") || kwStr.includes("how much")) {
    return variants.pricing;
  }
  if (cl.includes("technical") || kwStr.includes("api") || kwStr.includes("token") || kwStr.includes("sync")) {
    return variants.technical;
  }
  if (kwStr.includes("complian") || cl.includes("compliance") || cl.includes("registration")) {
    return variants.compliance;
  }
  return variants.default;
}

// ─── CTA HTML builder ─────────────────────────────────────────────────────────

function renderCta(variant: CtaVariant, position: "mid" | "end"): string {
  const bgColor   = position === "mid"  ? "#FFF7ED" : "#FEF3C7";
  const border    = position === "mid"  ? "#FDBA74" : "#FCD34D";

  const secondaryLink = variant.linkText && variant.linkHref
    ? `<a href="${variant.linkHref}" style="display:inline-block;margin-left:12px;color:#92400E;font-size:14px;text-decoration:underline;" data-cta-id="${variant.id}-link" data-cta-pos="${position}">${variant.linkText}</a>`
    : "";

  return `
<div style="background:${bgColor};border:1px solid ${border};border-radius:12px;padding:24px 28px;margin:36px 0;" data-cta-block="${variant.id}" data-cta-pos="${position}">
  <p style="font-weight:700;font-size:18px;margin:0 0 8px;color:#1F2937;">${variant.headline}</p>
  <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6;">${variant.subline}</p>
  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
    <a href="${variant.btnHref}" style="background:#25D366;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;" data-cta-id="${variant.id}-btn" data-cta-pos="${position}">${variant.btnText}</a>
    ${secondaryLink}
  </div>
</div>`.trim();
}

// ─── Injection logic ──────────────────────────────────────────────────────────

export interface CtaContext {
  cluster?:  string;
  keywords?: string[];
}

/**
 * Inject mid-content and end CTAs into blog HTML.
 *
 * - Mid CTA: inserted after the 3rd </h2> closing or the midpoint paragraph
 * - End CTA: inserted before the last </div> CTA block (replaces if already present)
 *
 * @param html     - blog post HTML content
 * @param context  - cluster + keywords for variant selection
 * @param config   - SiteConfig for WhatsApp/CTA text
 */
export function injectCTA(
  html:    string,
  context: CtaContext,
  config:  SiteConfig
): string {
  const variants = buildVariants(config);
  const variant  = selectVariant(
    context.cluster  ?? "general",
    context.keywords ?? [],
    variants
  );

  // ── Mid CTA: after 3rd <h2> ────────────────────────────────────────────────
  let result       = html;
  const midBlock   = renderCta(variant, "mid");

  // Find the 3rd occurrence of </h2>
  let h2Count = 0;
  let midInjectPos = -1;
  const h2Regex = /<\/h2>/gi;
  let h2Match: RegExpExecArray | null;
  while ((h2Match = h2Regex.exec(result)) !== null) {
    h2Count++;
    if (h2Count === 3) {
      // Find the end of the next </p> after this h2
      const afterH2  = result.indexOf("</p>", h2Match.index);
      midInjectPos   = afterH2 !== -1 ? afterH2 + 4 : h2Match.index + h2Match[0].length;
      break;
    }
  }

  // Fallback: inject at the midpoint of paragraphs
  if (midInjectPos === -1) {
    const paragraphs = [...result.matchAll(/<\/p>/gi)];
    if (paragraphs.length >= 4) {
      const midP     = paragraphs[Math.floor(paragraphs.length / 2)];
      midInjectPos   = midP.index! + midP[0].length;
    }
  }

  // Only inject mid CTA if it doesn't already exist
  if (midInjectPos !== -1 && !result.includes(`data-cta-pos="mid"`)) {
    result = result.slice(0, midInjectPos) + "\n" + midBlock + "\n" + result.slice(midInjectPos);
  }

  // ── End CTA: replace existing WhatsApp CTA div or append ──────────────────
  const endBlock = renderCta(variant, "end");

  // Replace the existing generic end CTA if present (from generate-blog)
  const existingCta = result.match(/<div style="background:#FFF7ED;border:1px solid #FDBA74[^>]*>[\s\S]*?<\/div>/);
  if (existingCta && !result.includes(`data-cta-pos="end"`)) {
    // Keep the existing CTA but don't add a second one — the CTA injector
    // adds the tracking attributes the existing one lacks
    result = result.replace(
      existingCta[0],
      endBlock
    );
  } else if (!result.includes(`data-cta-pos="end"`)) {
    result += "\n" + endBlock;
  }

  return result;
}

/**
 * Check if a blog's HTML already has CTA tracking attributes.
 * Used to avoid double-injection on update runs.
 */
export function hasCTATracking(html: string): boolean {
  return html.includes("data-cta-block=");
}
