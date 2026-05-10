/**
 * GET  /api/directories — get submission plans (ready-to-paste content + URLs)
 * POST /api/directories — mark a directory as submitted/live
 *
 * Auth: Bearer CRON_SECRET
 *
 * Use case: open the GET response → see all directories + their pre-filled
 * field values → manually submit (5 min each) → POST status update.
 */

import { NextRequest, NextResponse } from "next/server";
import { atomicCommit, readJsonFromGitHub } from "@/lib/githubApi";
import {
  buildSubmissionPlans,
  defaultDirectoriesData,
  getDirectoriesForCountry,
} from "@/lib/agent/directorySubmitter";
import type {
  BusinessProfile,
  DirectoriesData,
  DirectoryRecord,
  DirectoryStatus,
} from "@/lib/agent/directorySubmitter";
import type { NicheConfig } from "@/lib/agent/keywordDiscovery";
import { getSiteConfig } from "@/lib/agent/siteConfig";

function authOk(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function buildProfile(siteConfig: ReturnType<typeof getSiteConfig>, nicheConfig: NicheConfig | null): BusinessProfile {
  return {
    name:        nicheConfig?.businessName ?? siteConfig.name,
    niche:       nicheConfig?.niche       ?? siteConfig.niche,
    description: nicheConfig?.targetAudience
      ? `${siteConfig.name} provides ${siteConfig.niche} solutions for ${nicheConfig.targetAudience} in ${siteConfig.country}.`
      : `${siteConfig.name} provides ${siteConfig.niche} solutions in ${siteConfig.country}.`,
    website:  siteConfig.baseUrl,
    email:    process.env.BUSINESS_EMAIL ?? "info@phelixerp.online",
    phone:    process.env.BUSINESS_PHONE ?? "+92-311-8366981",
    whatsapp: nicheConfig?.ctaWhatsApp ?? siteConfig.ctaWhatsApp,
    city:     siteConfig.cities[0] ?? nicheConfig?.cities?.[0] ?? "Karachi",
    country:  siteConfig.country,
    founded:  process.env.BUSINESS_FOUNDED ?? "2024",
    services: nicheConfig?.industries ?? siteConfig.industries.slice(0, 6),
    cities:   nicheConfig?.cities ?? siteConfig.cities.slice(0, 6),
    address:  process.env.BUSINESS_ADDRESS,
    facebook: process.env.BUSINESS_FACEBOOK,
    instagram: process.env.BUSINESS_INSTAGRAM,
    linkedin: process.env.BUSINESS_LINKEDIN,
    logoUrl:  `${siteConfig.baseUrl}/phelix-logo.png`,
  };
}

// ─── GET: list submission plans ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    return NextResponse.json({ error: "GitHub env vars not set" }, { status: 500 });
  }

  const [nicheConfig, directoriesData] = await Promise.all([
    readJsonFromGitHub<NicheConfig>("data/niche-config.json", token, owner, repo),
    readJsonFromGitHub<DirectoriesData>("data/directories.json", token, owner, repo),
  ]);

  const siteConfig = getSiteConfig();
  const profile = buildProfile(siteConfig, nicheConfig);
  const records = directoriesData?.records ?? [];

  const plans = buildSubmissionPlans(profile, records);

  return NextResponse.json({
    profile,
    totalDirectories: plans.length,
    pending:    plans.filter((p) => p.status === "pending").length,
    submitted:  plans.filter((p) => p.status === "submitted").length,
    live:       plans.filter((p) => p.status === "live").length,
    rejected:   plans.filter((p) => p.status === "rejected").length,
    plans,
  });
}

// ─── POST: update submission status ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";
  if (!token || !owner || !repo) {
    return NextResponse.json({ error: "GitHub env vars not set" }, { status: 500 });
  }

  let body: { directoryId?: string; status?: DirectoryStatus; liveUrl?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.directoryId || !body.status) {
    return NextResponse.json({ error: "Required: directoryId, status" }, { status: 400 });
  }

  // Validate directoryId
  const allDirs = getDirectoriesForCountry("global").concat(
    getDirectoriesForCountry("pk"),
    getDirectoriesForCountry("ae")
  );
  if (!allDirs.find((d) => d.id === body.directoryId)) {
    return NextResponse.json({ error: `Unknown directoryId: ${body.directoryId}` }, { status: 400 });
  }

  const existing = await readJsonFromGitHub<DirectoriesData>(
    "data/directories.json", token, owner, repo
  ) ?? defaultDirectoriesData();

  const idx = existing.records.findIndex((r) => r.directoryId === body.directoryId);
  const newRecord: DirectoryRecord = {
    directoryId: body.directoryId,
    status:      body.status,
    submittedAt: body.status === "submitted" || body.status === "live"
      ? new Date().toISOString()
      : existing.records[idx]?.submittedAt,
    liveUrl: body.liveUrl,
    notes:   body.notes,
  };

  if (idx >= 0) existing.records[idx] = newRecord;
  else          existing.records.push(newRecord);

  existing.lastUpdatedAt = new Date().toISOString();
  existing.totalLive = existing.records.filter((r) => r.status === "live").length;

  await atomicCommit(
    [{ path: "data/directories.json", content: JSON.stringify(existing, null, 2) }],
    `chore: update directory submission — ${body.directoryId} → ${body.status}`,
    token, owner, repo, branch
  );

  return NextResponse.json({ success: true, record: newRecord, totalLive: existing.totalLive });
}
