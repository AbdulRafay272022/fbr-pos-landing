import type { BlogPost } from "./types";

interface LinkRule {
  phrase: string;
  url: string;
}

const LINK_RULES: LinkRule[] = [
  { phrase: "FBR POS system", url: "/" },
  { phrase: "FBR POS software", url: "/" },
  { phrase: "FBR compliance checker", url: "/fbr-checker" },
  { phrase: "check FBR compliance", url: "/fbr-checker" },
  { phrase: "FBR compliance score", url: "/fbr-checker" },
  { phrase: "FBR e-invoicing", url: "/blog/fbr-e-invoicing-pakistan-explained" },
  { phrase: "QR invoice", url: "/blog/fbr-e-invoicing-pakistan-explained" },
  { phrase: "register POS with FBR", url: "/blog/how-to-register-pos-fbr-pakistan-step-by-step" },
  { phrase: "FBR IRIS", url: "/blog/how-to-register-pos-fbr-pakistan-step-by-step" },
  { phrase: "best POS software", url: "/blog/best-pos-software-pakistan-fbr-compliant-2026" },
  { phrase: "FBR compliance", url: "/fbr-checker" },
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isInsideAnchor(html: string, matchIndex: number): boolean {
  const before = html.slice(0, matchIndex);
  const opens = (before.match(/<a[\s>]/gi) ?? []).length;
  const closes = (before.match(/<\/a>/gi) ?? []).length;
  return opens > closes;
}

function isInsideAttribute(html: string, matchIndex: number): boolean {
  const before = html.slice(0, matchIndex);
  const lastTagOpen = before.lastIndexOf("<");
  const lastTagClose = before.lastIndexOf(">");
  return lastTagOpen > lastTagClose;
}

export function injectInternalLinks(html: string, currentSlug?: string): string {
  let result = html;
  const usedUrls = new Set<string>();

  for (const rule of LINK_RULES) {
    if (usedUrls.has(rule.url)) continue;
    if (currentSlug && rule.url.includes(currentSlug)) continue;

    const regex = new RegExp(`\\b${escapeRegex(rule.phrase)}\\b`, "i");
    const match = regex.exec(result);
    if (!match || match.index === undefined) continue;

    if (isInsideAnchor(result, match.index)) continue;
    if (isInsideAttribute(result, match.index)) continue;

    result =
      result.slice(0, match.index) +
      `<a href="${rule.url}" style="color:#F97316;font-weight:600;text-decoration:underline;">${match[0]}</a>` +
      result.slice(match.index + match[0].length);

    usedUrls.add(rule.url);
  }

  return result;
}

export function getRelatedPosts(
  currentSlug: string,
  allBlogs: BlogPost[],
  limit = 3
): BlogPost[] {
  return allBlogs.filter((b) => b.slug !== currentSlug).slice(0, limit);
}
