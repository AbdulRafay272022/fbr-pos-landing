/**
 * app/sitemap.ts
 *
 * Dynamically generated XML sitemap using Next.js 14 App Router.
 * Reads data/index.json from GitHub (not getAllBlogs which reads disk)
 * so it always reflects the latest published content.
 *
 * Revalidates every hour via ISR.
 *
 * Priority heuristics:
 *   Homepage         1.0
 *   /blog (index)    0.9
 *   /fbr-checker     0.85
 *   Updated ≤7d      0.8
 *   Updated ≤30d     0.7
 *   Older            0.6
 *
 * changeFrequency:
 *   Updated ≤7d  → "daily"
 *   Updated ≤30d → "weekly"
 *   Older        → "monthly"
 */

import type { MetadataRoute } from "next";
import { readJsonFromGitHub } from "@/lib/githubApi";
import type { LandingPageIndex, ProgrammaticPageIndex } from "@/lib/types";

export const revalidate = 3600; // regenerate hourly

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogIndexEntry = {
  slug:         string;
  publishedAt:  string;
  lastUpdated?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(iso: string | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function blogChangeFreq(blog: BlogIndexEntry): "daily" | "weekly" | "monthly" {
  const age = daysSince(blog.lastUpdated ?? blog.publishedAt);
  if (age <= 7)  return "daily";
  if (age <= 30) return "weekly";
  return "monthly";
}

function blogPriority(blog: BlogIndexEntry): number {
  const age = daysSince(blog.lastUpdated ?? blog.publishedAt);
  if (age <= 7)  return 0.8;
  if (age <= 30) return 0.7;
  return 0.6;
}

// ─── Sitemap generator ────────────────────────────────────────────────────────

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_BASE_URL ?? "https://phelixerp.online").replace(/\/$/, "");

  const staticPages: MetadataRoute.Sitemap = [
    {
      url:             base,
      lastModified:    new Date(),
      changeFrequency: "weekly",
      priority:        1.0,
    },
    {
      url:             `${base}/blog`,
      lastModified:    new Date(),
      changeFrequency: "daily",
      priority:        0.9,
    },
    {
      url:             `${base}/fbr-checker`,
      lastModified:    new Date(),
      changeFrequency: "monthly",
      priority:        0.85,
    },
    {
      url:             `${base}/pricing`,
      lastModified:    new Date(),
      changeFrequency: "monthly",
      priority:        0.6,
    },
    {
      url:             `${base}/contact`,
      lastModified:    new Date(),
      changeFrequency: "monthly",
      priority:        0.5,
    },
  ];

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) return staticPages;

  // ── Read all page indices in parallel ─────────────────────────────────────
  const [blogIndex, landingData, progData] = await Promise.allSettled([
    readJsonFromGitHub<BlogIndexEntry[]>("data/index.json", token, owner, repo),
    readJsonFromGitHub<{ pages: LandingPageIndex[] }>("data/landing-index.json", token, owner, repo),
    readJsonFromGitHub<{ pages: ProgrammaticPageIndex[] }>("data/programmatic-index.json", token, owner, repo),
  ]);

  // Blog pages
  const blogs: BlogIndexEntry[] =
    blogIndex.status === "fulfilled" ? (blogIndex.value ?? []) : [];

  const blogPages: MetadataRoute.Sitemap = blogs.map((blog) => ({
    url:             `${base}/blog/${blog.slug}`,
    lastModified:    new Date(blog.lastUpdated ?? blog.publishedAt),
    changeFrequency: blogChangeFreq(blog),
    priority:        blogPriority(blog),
  }));

  // Landing pages — high priority (money pages)
  const landings: LandingPageIndex[] =
    landingData.status === "fulfilled" ? (landingData.value?.pages ?? []) : [];

  const landingPages: MetadataRoute.Sitemap = landings.map((page) => ({
    url:             `${base}/services/${page.slug}`,
    lastModified:    new Date(page.lastUpdated ?? page.publishedAt),
    changeFrequency: "monthly" as const,
    priority:        0.85,
  }));

  // Programmatic pages
  const progPages: ProgrammaticPageIndex[] =
    progData.status === "fulfilled" ? (progData.value?.pages ?? []) : [];

  const programmaticPages: MetadataRoute.Sitemap = progPages.map((page) => ({
    url:             `${base}/locations/${page.slug}`,
    lastModified:    new Date(page.publishedAt),
    changeFrequency: "monthly" as const,
    priority:        0.7,
  }));

  return [...staticPages, ...landingPages, ...programmaticPages, ...blogPages];
}
