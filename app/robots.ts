/**
 * app/robots.ts
 *
 * Generates robots.txt dynamically.
 * Blocks API routes, admin routes, and internal data endpoints.
 * Points crawlers to the sitemap.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_BASE_URL ?? "https://phelixerp.online").replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/_next/",
        ],
      },
      {
        // Block pure AI training scrapers, but keep Google-Extended allowed.
        // Google-Extended powers AI Overviews — the 30-40% of search results
        // that show AI summaries. Blocking it cuts you out of that traffic.
        userAgent: ["GPTBot", "CCBot", "anthropic-ai", "ClaudeBot", "PerplexityBot"],
        disallow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host:    base,
  };
}
