/**
 * lib/agent/distribution.ts
 *
 * Social media distribution engine.
 *
 * Generates platform-optimised posts and publishes them via:
 *   - Twitter/X API v2 (OAuth 1.0a with app credentials)
 *   - LinkedIn API v2 (OAuth 2.0 access token)
 *
 * Required env vars:
 *   TWITTER_API_KEY          (Consumer Key)
 *   TWITTER_API_SECRET       (Consumer Secret)
 *   TWITTER_ACCESS_TOKEN     (User Access Token)
 *   TWITTER_ACCESS_SECRET    (User Access Token Secret)
 *   LINKEDIN_ACCESS_TOKEN    (OAuth 2.0 Bearer Token)
 *   LINKEDIN_PERSON_URN      (urn:li:person:XXXX — your LinkedIn person ID)
 *
 * Posts gracefully skipped if credentials not configured.
 */

import type { DistributionPost, SocialPlatform } from "@/lib/types";

// ─── Post generation ──────────────────────────────────────────────────────────

const HOOKS = [
  (title: string) => `📌 New guide: ${title}`,
  (title: string) => `🇵🇰 Pakistani businesses — read this: ${title}`,
  (title: string) => `FBR compliance just got easier. → ${title}`,
  (title: string) => `If you run a retail/pharma business in Pakistan, you need to know: ${title}`,
  (title: string) => `Step-by-step breakdown → ${title}`,
];

function pickHook(title: string, index: number): string {
  return HOOKS[index % HOOKS.length](title);
}

/**
 * Generate a platform-optimised social post for a blog.
 *
 * Twitter: ≤280 chars — hook + URL + 3 hashtags
 * LinkedIn: ≤1200 chars — hook + 2-sentence value prop + URL + hashtags
 */
export function generateSocialPost(
  blog:     { slug: string; title: string; metaDescription: string; keywords: string[] },
  platform: SocialPlatform,
  baseUrl:  string,
  hookIndex = 0
): string {
  const url      = `${baseUrl.replace(/\/$/, "")}/blog/${blog.slug}`;
  const hook     = pickHook(blog.title, hookIndex);
  const hashtags = blog.keywords
    .slice(0, 3)
    .map((k) => "#" + k.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20))
    .join(" ");

  if (platform === "twitter") {
    // Max 280 chars — keep it tight
    const base = `${hook}\n\n${url}\n\n${hashtags}`;
    return base.slice(0, 280);
  }

  // LinkedIn — more room for context
  return `${hook}\n\n${blog.metaDescription}\n\nRead the full guide 👇\n${url}\n\n${hashtags} #Pakistan #FBR #BusinessCompliance`;
}

// ─── Twitter API v2 (OAuth 1.0a) ──────────────────────────────────────────────

/**
 * Minimal HMAC-SHA256 OAuth 1.0a signer for Twitter API v2 /tweets endpoint.
 * No external dependency — uses Web Crypto API.
 */
async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc     = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(data);

  const key = await crypto.subtle.importKey(
    "raw", keyData,
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );

  const sigBuf = await crypto.subtle.sign("HMAC", key, msgData);
  const bytes  = new Uint8Array(sigBuf);
  let   str    = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

async function buildOAuthHeader(
  method:      string,
  url:         string,
  apiKey:      string,
  apiSecret:   string,
  accessToken: string,
  accessSecret: string
): Promise<string> {
  const nonce     = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     apiKey,
    oauth_nonce:            nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp:        timestamp,
    oauth_token:            accessToken,
    oauth_version:          "1.0",
  };

  // Build signature base string
  const sortedParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const sigBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join("&");

  const sigKey    = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
  const signature = await hmacSha256(sigKey, sigBase);

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const headerStr = Object.entries(headerParams)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(", ");

  return `OAuth ${headerStr}`;
}

async function postToTwitter(text: string): Promise<DistributionPost> {
  const apiKey      = process.env.TWITTER_API_KEY;
  const apiSecret   = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return {
      platform: "twitter",
      postedAt: new Date().toISOString(),
      success:  false,
      error:    "Twitter credentials not configured",
    };
  }

  const endpoint = "https://api.twitter.com/2/tweets";

  try {
    const authHeader = await buildOAuthHeader(
      "POST", endpoint,
      apiKey, apiSecret,
      accessToken, accessSecret
    );

    const res = await fetch(endpoint, {
      method:  "POST",
      headers: {
        Authorization:  authHeader,
        "Content-Type": "application/json",
      },
      body:   JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        platform: "twitter",
        postedAt: new Date().toISOString(),
        success:  false,
        error:    `Twitter API ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await res.json() as { data?: { id?: string } };
    const postId = data?.data?.id;

    return {
      platform: "twitter",
      postId,
      postUrl:  postId ? `https://twitter.com/i/web/status/${postId}` : undefined,
      postedAt: new Date().toISOString(),
      success:  true,
    };
  } catch (err) {
    return {
      platform: "twitter",
      postedAt: new Date().toISOString(),
      success:  false,
      error:    err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── LinkedIn API v2 ──────────────────────────────────────────────────────────

async function postToLinkedIn(text: string, articleUrl: string): Promise<DistributionPost> {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn   = process.env.LINKEDIN_PERSON_URN; // urn:li:person:XXXXXX

  if (!accessToken || !personUrn) {
    return {
      platform: "linkedin",
      postedAt: new Date().toISOString(),
      success:  false,
      error:    "LinkedIn credentials not configured",
    };
  }

  try {
    const body = {
      author:     personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "ARTICLE",
          media: [
            {
              status:      "READY",
              originalUrl: articleUrl,
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        platform: "linkedin",
        postedAt: new Date().toISOString(),
        success:  false,
        error:    `LinkedIn API ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const postId = res.headers.get("x-restli-id") ?? undefined;

    return {
      platform: "linkedin",
      postId,
      postUrl:  postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined,
      postedAt: new Date().toISOString(),
      success:  true,
    };
  } catch (err) {
    return {
      platform: "linkedin",
      postedAt: new Date().toISOString(),
      success:  false,
      error:    err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DistributeResult {
  twitter?:  DistributionPost;
  linkedin?: DistributionPost;
  anySuccess: boolean;
}

/**
 * Distribute a blog post to all configured social platforms.
 * Platforms without credentials are skipped gracefully.
 *
 * @param blog    - blog metadata
 * @param baseUrl - site base URL for building the full link
 * @param hookIndex - deterministic hook picker (e.g., blog count % HOOKS.length)
 */
export async function distributeBlog(
  blog: {
    slug:            string;
    title:           string;
    metaDescription: string;
    keywords:        string[];
  },
  baseUrl:   string,
  hookIndex: number = 0
): Promise<DistributeResult> {
  const blogUrl    = `${baseUrl.replace(/\/$/, "")}/blog/${blog.slug}`;
  const tweetText  = generateSocialPost(blog, "twitter",  baseUrl, hookIndex);
  const liText     = generateSocialPost(blog, "linkedin", baseUrl, hookIndex);

  // Run both in parallel — independent platforms
  const [twitterResult, linkedinResult] = await Promise.all([
    postToTwitter(tweetText),
    postToLinkedIn(liText, blogUrl),
  ]);

  return {
    twitter:    twitterResult,
    linkedin:   linkedinResult,
    anySuccess: twitterResult.success || linkedinResult.success,
  };
}
