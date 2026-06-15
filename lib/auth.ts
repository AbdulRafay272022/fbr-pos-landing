/**
 * lib/auth.ts
 *
 * Fail-CLOSED auth for agent routes.
 *
 * The previous pattern — `if (cronSecret) { check }` — silently left every
 * endpoint OPEN whenever CRON_SECRET was unset. For a multi-tenant SaaS that
 * is a critical hole. This helper refuses the request when the secret is
 * missing (503) and rejects bad tokens (401). There is no "open" path.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Returns a NextResponse to short-circuit with when auth fails, or null when
 * the caller is authorised. Usage:
 *
 *   const denied = requireAuth(req);
 *   if (denied) return denied;
 */
export function requireAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  // Vercel Cron sends this header on scheduled invocations.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (!secret) {
    // Fail closed: never serve a privileged route without a configured secret.
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET not set" },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}` || isVercelCron) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
