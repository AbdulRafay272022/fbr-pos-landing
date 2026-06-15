/**
 * GET /ads.txt
 *
 * Serves the AdSense ads.txt authorisation record from env. Required by
 * Google to verify you're allowed to monetise the domain. Returns empty
 * (but 200) when not configured, so non-AdSense deployments don't 404 noisily.
 *
 * Set ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX (or pub-XXXX) per deployment.
 */

export const dynamic = "force-static";
export const revalidate = 86_400;

export function GET() {
  const raw = process.env.ADSENSE_CLIENT_ID ?? "";
  const pub = raw.replace(/^ca-/, ""); // ads.txt wants the bare "pub-..." form

  const body = pub
    ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : "# ads.txt — set ADSENSE_CLIENT_ID to populate\n";

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
