/**
 * lib/niche/monetization.ts
 *
 * Pluggable monetization. ONE switch (the pack's monetization.mode) decides
 * whether the engine optimises for off-page conversions (lead-gen) or for
 * on-page ad revenue (AdSense).
 *
 * AdSense units are injected as *placeholders* (CLS-safe divs), then hydrated
 * client-side by components/AdHydrator — inline <script> inside stored HTML
 * never executes under dangerouslySetInnerHTML, so we never inject raw <ins>.
 */

import type { NichePack, AdSenseConfig } from "./types";

/** Resolve the AdSense client id from the pack, falling back to env. */
export function adSenseClientId(cfg: AdSenseConfig): string {
  return cfg.clientId || process.env.ADSENSE_CLIENT_ID || "";
}

export function isAdSense(pack: NichePack): boolean {
  return pack.monetization.mode === "adsense";
}

/** CLS-safe AdSense placeholder. AdHydrator turns these into live units. */
function adPlaceholder(slot: string, label = "Advertisement"): string {
  return `<div class="ad-slot" data-ad-slot="${slot}" style="min-height:280px;margin:32px 0;display:flex;align-items:center;justify-content:center;background:#FAFAFA;border:1px dashed #E5E7EB;border-radius:8px;">
  <span style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">${label}</span>
</div>`;
}

/** Lead-gen CTA block (the former hardcoded WhatsApp CTA, now pack-driven). */
function ctaBlock(pack: NichePack, position: "mid" | "end"): string {
  if (pack.monetization.mode !== "leadgen") return "";
  const m = pack.monetization;
  const wa = m.whatsapp ? `https://wa.me/${m.whatsapp.replace(/[^0-9]/g, "")}` : "";
  const bg = position === "mid" ? "#FFF7ED" : "#FEF3C7";
  const border = position === "mid" ? "#FDBA74" : "#FCD34D";
  const secondary =
    m.toolHref && m.toolText
      ? `<a href="${m.toolHref}" style="display:inline-block;margin-left:12px;color:#92400E;font-size:14px;text-decoration:underline;" data-cta-id="tool-link" data-cta-pos="${position}">${m.toolText}</a>`
      : "";
  const button = wa
    ? `<a href="${wa}" style="background:#25D366;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;" data-cta-id="primary-btn" data-cta-pos="${position}">${m.ctaText}</a>`
    : "";
  return `<div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:24px 28px;margin:36px 0;" data-cta-block="primary" data-cta-pos="${position}">
  <p style="font-weight:700;font-size:18px;margin:0 0 8px;color:#1F2937;">${pack.name}</p>
  <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6;">${m.ctaSubtext ?? ""}</p>
  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">${button}${secondary}</div>
</div>`;
}

/** Mid-content unit (ad slot for AdSense, CTA for lead-gen). */
export function renderMidUnit(pack: NichePack): string {
  if (pack.monetization.mode === "adsense") {
    return adPlaceholder(pack.monetization.slots.inArticle);
  }
  return ctaBlock(pack, "mid");
}

/** End-of-article unit. */
export function renderEndUnit(pack: NichePack): string {
  if (pack.monetization.mode === "adsense") {
    return adPlaceholder(pack.monetization.slots.footer ?? pack.monetization.slots.inArticle);
  }
  return ctaBlock(pack, "end");
}

/**
 * AdSense in-article injection: drop an ad placeholder after roughly every
 * `adDensityWords` words (counted by </p> boundaries), capped to keep the
 * page reader-first and policy-safe. No-op for lead-gen.
 */
export function injectAdSlots(html: string, pack: NichePack): string {
  if (pack.monetization.mode !== "adsense") return html;
  const cfg = pack.monetization;
  const paras = [...html.matchAll(/<\/p>/gi)];
  if (paras.length < 4) return html + "\n" + renderEndUnit(pack);

  // One slot per ~adDensityWords; approximate via paragraph spacing (~50 words/p).
  const everyN = Math.max(3, Math.round(cfg.adDensityWords / 50));
  const maxSlots = 4; // policy-safe ceiling
  let inserted = 0;
  const insertAfter: number[] = [];
  for (let i = everyN; i < paras.length && inserted < maxSlots; i += everyN) {
    insertAfter.push(paras[i].index! + paras[i][0].length);
    inserted++;
  }
  // Insert from the back so earlier offsets stay valid.
  let out = html;
  for (let i = insertAfter.length - 1; i >= 0; i--) {
    const pos = insertAfter[i];
    out = out.slice(0, pos) + "\n" + adPlaceholder(cfg.slots.inArticle) + "\n" + out.slice(pos);
  }
  return out + "\n" + renderEndUnit(pack);
}
