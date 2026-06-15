"use client";

/**
 * components/AdHydrator.tsx
 *
 * The agent injects CLS-safe placeholders (<div class="ad-slot" data-ad-slot>)
 * into blog HTML. Inline <script> inside dangerouslySetInnerHTML never runs, so
 * this client component finds those placeholders after mount and renders a live
 * AdSense unit into each one.
 *
 * Renders nothing (and loads no script) unless NEXT_PUBLIC_ADSENSE_CLIENT_ID is
 * set — so it's completely inert on lead-gen deployments.
 *
 * Add once near the blog article: <AdHydrator />
 * And load the AdSense library once globally (see AdSenseScript).
 */

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdHydrator() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  useEffect(() => {
    if (!client) return;
    const slots = Array.from(
      document.querySelectorAll<HTMLElement>(".ad-slot[data-ad-slot]")
    );
    for (const el of slots) {
      if (el.dataset.adHydrated === "1") continue;
      const slotId = el.dataset.adSlot;
      if (!slotId) continue;

      el.dataset.adHydrated = "1";
      el.innerHTML = "";
      el.style.border = "none";
      el.style.background = "transparent";

      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", client);
      ins.setAttribute("data-ad-slot", slotId);
      ins.setAttribute("data-ad-format", "auto");
      ins.setAttribute("data-full-width-responsive", "true");
      el.appendChild(ins);

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* AdSense not ready yet — auto ads will fill on next pass */
      }
    }
  }, [client]);

  return null;
}
