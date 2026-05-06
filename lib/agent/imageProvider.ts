/**
 * lib/agent/imageProvider.ts
 *
 * Fetches a relevant hero image for a blog post from the Pexels API.
 *
 * Pexels API:
 *   - Free, no attribution required in the text but must link back to Pexels
 *   - Rate limit: 200 requests/hour on the free plan
 *   - Sign up: https://www.pexels.com/api/
 *   - Env var:  PEXELS_API_KEY
 *
 * If no API key is set, or the API call fails, returns null (graceful degradation).
 * The blog is never blocked on image generation.
 */

import type { BlogPost } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PexelsPhoto {
  id: number;
  url: string;                    // Pexels page URL
  photographer: string;
  photographer_url: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
  page: number;
  per_page: number;
}

export type HeroImage = NonNullable<BlogPost["heroImage"]>;

// ─── Search query builder ─────────────────────────────────────────────────────

/**
 * Build a Pexels search query from the blog keyword.
 * We strip FBR-specific jargon (POS, IRIS, STRN) that returns irrelevant results
 * and replace with generic business/retail terms that produce good images.
 */
function buildSearchQuery(keyword: string): string {
  const lower = keyword.toLowerCase();

  // Keyword → topic mapping for better Pexels results
  if (lower.includes("restaurant") || lower.includes("food"))
    return "restaurant business Pakistan";
  if (lower.includes("pharmacy") || lower.includes("medical"))
    return "pharmacy store Pakistan";
  if (lower.includes("retail") || lower.includes("clothing") || lower.includes("boutique"))
    return "retail store Pakistan";
  if (lower.includes("wholesale") || lower.includes("distributor"))
    return "warehouse wholesale Pakistan";
  if (lower.includes("karachi"))
    return "karachi business market";
  if (lower.includes("lahore"))
    return "lahore market business";
  if (lower.includes("islamabad"))
    return "islamabad office business";
  if (lower.includes("grocery") || lower.includes("supermarket"))
    return "grocery store Pakistan";
  if (lower.includes("invoice") || lower.includes("billing") || lower.includes("tax"))
    return "business invoice accounting";
  if (lower.includes("pos") || lower.includes("cashier") || lower.includes("payment"))
    return "cashier payment terminal retail";
  if (lower.includes("inventory") || lower.includes("stock"))
    return "inventory management warehouse";
  if (lower.includes("erp") || lower.includes("software"))
    return "business software accounting";

  // Generic fallback: business in Pakistan
  return "business Pakistan";
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch a hero image for the given keyword from Pexels.
 * Returns null if PEXELS_API_KEY is not set or the request fails.
 */
export async function fetchHeroImage(keyword: string): Promise<HeroImage | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  const query = buildSearchQuery(keyword);
  const url   = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal:  AbortSignal.timeout(8_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as PexelsSearchResponse;
    if (!data.photos || data.photos.length === 0) return null;

    // Pick first photo (highest relevance from Pexels ranking)
    const photo = data.photos[0];

    return {
      url:              photo.src.large2x || photo.src.large || photo.src.original,
      thumb:            photo.src.medium,
      alt:              photo.alt || query,
      photographer:     photo.photographer,
      photographerUrl:  photo.photographer_url,
      pexelsUrl:        photo.url,
    };
  } catch {
    // Graceful degradation — never block blog generation for a missing image
    return null;
  }
}
