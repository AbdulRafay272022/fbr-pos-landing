/**
 * POST /api/track-conversion
 *
 * Client-side conversion tracking endpoint.
 * Called via navigator.sendBeacon() or fetch() from the browser
 * when a visitor clicks a CTA element with [data-cta-id].
 *
 * Body shape:
 * {
 *   type:      "cta_click" | "whatsapp_click" | "form_submit" | ...
 *   slug?:     "blog-slug"
 *   ctaLabel?: "Get Free Audit"
 *   source?:   "google" | "direct" | "twitter" | ...
 * }
 *
 * This is a WRITE endpoint — no auth required (public tracking).
 * Rate limiting is handled by Vercel's edge network.
 *
 * Data is appended to data/conversions.json via GitHub atomic commit.
 */

import { NextRequest, NextResponse } from "next/server";
import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import {
  recordConversion,
  defaultConversionData,
  isValidConversionType,
} from "@/lib/agent/conversionTracker";
import type { ConversionData } from "@/lib/types";

export async function POST(req: NextRequest) {
  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    // Return 200 to client even on misconfiguration — don't break the UX
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, string>;
  try {
    body = await req.json() as Record<string, string>;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const { type, slug, ctaLabel, source } = body;

  if (!type || !isValidConversionType(type)) {
    return NextResponse.json({ ok: false, reason: "invalid_type" }, { status: 400 });
  }

  // ── Read + update ──────────────────────────────────────────────────────────
  const existing = (await readJsonFromGitHub<ConversionData>(
    "data/conversions.json", token, owner, repo
  )) ?? defaultConversionData();

  const updated = recordConversion(existing, {
    type,
    ...(slug      ? { slug }      : {}),
    ...(ctaLabel  ? { ctaLabel }  : {}),
    ...(source    ? { source }    : {}),
  });

  // ── Commit ─────────────────────────────────────────────────────────────────
  try {
    await atomicCommit(
      [{ path: "data/conversions.json", content: JSON.stringify(updated, null, 2) }],
      `analytics: track conversion (${type}${slug ? " / " + slug : ""})`,
      token, owner, repo, branch
    );
    return NextResponse.json({ ok: true });
  } catch {
    // Non-fatal — return success to client anyway
    return NextResponse.json({ ok: false, reason: "commit_failed" });
  }
}
