/**
 * GET /api/indexnow-key
 *
 * Returns the IndexNow key as plain text. IndexNow uses this URL as
 * `keyLocation` to verify domain ownership before accepting URL submissions.
 *
 * This is the canonical location — the indexing module passes this URL
 * as keyLocation when submitting URLs.
 */

import { NextResponse } from "next/server";
import { getIndexNowKey } from "@/lib/agent/indexing";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const key = getIndexNowKey();
  return new NextResponse(key, {
    status:  200,
    headers: {
      "Content-Type":  "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
