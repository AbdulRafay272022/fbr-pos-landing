declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function trackEvent(
  action: string,
  params?: Record<string, string | number>
): void {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", action, params ?? {});
    }
  } catch {
    // analytics must never throw
  }
}

export function trackWAClick(location: string): void {
  trackEvent("whatsapp_click", { location });
}

export function trackFBRCheckerSubmit(score: number, risk: string): void {
  trackEvent("fbr_checker_submit", { score, risk });
}

export function trackBlogShare(slug: string): void {
  trackEvent("blog_share", { slug });
}
