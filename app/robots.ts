/**
 * app/robots.ts
 *
 * Generates robots.txt dynamically.
 * Blocks API routes, admin routes, and internal data endpoints.
 * Points crawlers to the sitemap.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_BASE_URL ?? "https://phelixerp.vercel.app").replace(/\/$/, "");

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
        // Block AI training bots that consume crawl budget without value
        userAgent: ["GPTBot", "Google-Extended", "CCBot", "anthropic-ai"],
        disallow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host:    base,
  };
}
