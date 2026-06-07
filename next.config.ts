import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Permanent 301 redirect: www.phelixerp.online → phelixerp.online
   *
   * Why this is needed:
   *   Vercel does NOT automatically redirect www to non-www. Without this,
   *   any external link to www.phelixerp.online creates a second GSC property
   *   that leaks impressions and dilutes PageRank. Google sees two sites.
   *
   * Effect:
   *   - All www traffic (including bot crawls) permanently redirected
   *   - GSC www errors resolve within 2–4 weeks as Google recrawls
   *   - PageRank consolidates to the canonical non-www domain
   */
  async redirects() {
    return [
      {
        source:      "/:path*",
        has:         [{ type: "host", value: "www.phelixerp.online" }],
        destination: "https://phelixerp.online/:path*",
        permanent:   true,   // 301 — tells Google this is canonical forever
      },
    ];
  },
};

export default nextConfig;
