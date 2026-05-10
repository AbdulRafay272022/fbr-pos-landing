/**
 * POST /api/admin/setup
 *
 * Save the niche configuration for this site.
 * Stores to data/niche-config.json in GitHub.
 *
 * The agent reads this file on every scrape-keywords run to:
 *  1. Generate AI seed keywords from the niche description
 *  2. Drive market discovery (Google Autocomplete + Serper PAA)
 *  3. Update content tone and CTAs
 *
 * Body: NicheConfig JSON
 * Auth: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { atomicCommit, readJsonFromGitHub } from "@/lib/githubApi";
import { generateSeedsFromNiche } from "@/lib/agent/keywordDiscovery";
import type { NicheConfig } from "@/lib/agent/keywordDiscovery";

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    return NextResponse.json({ error: "GitHub env vars not set" }, { status: 500 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Partial<NicheConfig>;
  try {
    body = await req.json() as Partial<NicheConfig>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.businessName || !body.niche || !body.country) {
    return NextResponse.json(
      { error: "Required: businessName, niche, country" },
      { status: 400 }
    );
  }

  // ── Generate AI seed keywords from niche ─────────────────────────────────
  let aiSeeds: string[] = [];
  try {
    aiSeeds = await generateSeedsFromNiche(body.niche, body.country);
  } catch {
    // Non-fatal — seeds will be generated on next scrape run
  }

  // ── Build config ──────────────────────────────────────────────────────────
  const nicheConfig: NicheConfig = {
    businessName:   body.businessName,
    niche:          body.niche,
    country:        body.country,
    cities:         body.cities ?? [],
    industries:     body.industries ?? [],
    targetAudience: body.targetAudience ?? "",
    competitors:    body.competitors ?? [],
    ctaWhatsApp:    body.ctaWhatsApp,
    ctaText:        body.ctaText,
    configuredAt:   new Date().toISOString(),
  };

  // ── Read existing config for comparison ──────────────────────────────────
  const existing = await readJsonFromGitHub<NicheConfig>(
    "data/niche-config.json", token, owner, repo
  );

  // ── Commit to GitHub ──────────────────────────────────────────────────────
  try {
    await atomicCommit(
      [{ path: "data/niche-config.json", content: JSON.stringify(nicheConfig, null, 2) }],
      `feat: configure niche — ${nicheConfig.businessName} (${nicheConfig.niche})`,
      token, owner, repo, branch
    );

    return NextResponse.json({
      success:      true,
      config:       nicheConfig,
      aiSeeds,
      seedCount:    aiSeeds.length,
      isUpdate:     !!existing,
      message:      `Niche configured. Agent will discover keywords for "${nicheConfig.niche}" on next run.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return NextResponse.json({ error: "GitHub env vars not set" }, { status: 500 });
  }

  const config = await readJsonFromGitHub<NicheConfig>(
    "data/niche-config.json", token, owner, repo
  );

  return NextResponse.json({ configured: !!config, config: config ?? null });
}
