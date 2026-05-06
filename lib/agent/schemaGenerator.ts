/**
 * lib/agent/schemaGenerator.ts
 *
 * Generate Schema.org JSON-LD markup for blog posts.
 *
 * Produces two schemas per post:
 *   1. Article — main content metadata
 *   2. FAQPage — from the blog's faqs array (if present)
 *
 * The generated JSON-LD is injected as a <script type="application/ld+json">
 * block at the END of the blog HTML content, just before </article> or at the
 * end of the string if no closing tag is present.
 */

import type { BlogPost, ArticleSchema, FaqPageSchema } from "@/lib/types";

// ─── Schema builders ──────────────────────────────────────────────────────────

export function buildArticleSchema(
  blog: BlogPost,
  siteUrl: string,
  siteName: string,
  authorName?: string
): ArticleSchema {
  const url        = `${siteUrl.replace(/\/$/, "")}/blog/${blog.slug}`;
  const resolvedAuthor = blog.authorName ?? authorName ?? siteName;
  // Use @type Person when we have a real name, otherwise fall back to Organization
  const isRealPerson = resolvedAuthor !== siteName;
  const authorSlug  = resolvedAuthor.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return {
    "@context":   "https://schema.org",
    "@type":      "Article",
    headline:     blog.title,
    description:  blog.metaDescription,
    author: isRealPerson
      ? { "@type": "Person",       name: resolvedAuthor, url: `${siteUrl.replace(/\/$/, "")}/author/${authorSlug}` }
      : { "@type": "Organization", name: siteName },
    publisher:    { "@type": "Organization", name: siteName },
    datePublished: blog.publishedAt,
    dateModified:  blog.lastUpdated ?? blog.publishedAt,
    url,
    keywords:     blog.keywords.join(", "),
    ...(blog.heroImage ? { image: blog.heroImage.url } : {}),
  };
}

export function buildFaqSchema(blog: BlogPost): FaqPageSchema | null {
  if (!blog.faqs || blog.faqs.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type":    "FAQPage",
    mainEntity: blog.faqs.map((faq) => ({
      "@type": "Question",
      name:    faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text:    faq.answer,
      },
    })),
  };
}

// ─── HTML injection ───────────────────────────────────────────────────────────

function wrapJsonLd(obj: object): string {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

/**
 * Check if HTML already contains schema markup (to prevent double-injection).
 */
export function hasSchemaMarkup(html: string): boolean {
  return html.includes('type="application/ld+json"');
}

/**
 * Inject Article + FAQPage schema into blog HTML.
 * If schema already exists, returns html unchanged.
 * Inserts just before </body> or </article> if present, otherwise appends.
 */
export function injectSchema(
  html: string,
  blog: BlogPost,
  siteUrl: string,
  siteName: string,
  authorName?: string
): string {
  if (hasSchemaMarkup(html)) return html;

  const articleSchema = buildArticleSchema(blog, siteUrl, siteName, authorName);
  const faqSchema     = buildFaqSchema(blog);

  const blocks = [wrapJsonLd(articleSchema)];
  if (faqSchema) blocks.push(wrapJsonLd(faqSchema));
  const injection = "\n" + blocks.join("\n") + "\n";

  // Try to inject before </body>
  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}</body>`);
  }

  // Try to inject before </article>
  if (html.includes("</article>")) {
    return html.replace("</article>", `${injection}</article>`);
  }

  // Fallback: append
  return html + injection;
}

/**
 * Strip existing schema markup from HTML (used before re-injection on updates).
 */
export function stripSchemaMarkup(html: string): string {
  // Remove <script type="application/ld+json">...</script> blocks
  return html.replace(
    /<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi,
    ""
  );
}

/**
 * Re-inject schema into HTML, replacing any existing schema.
 * Use this on blog updates to keep schema data fresh.
 */
export function refreshSchema(
  html: string,
  blog: BlogPost,
  siteUrl: string,
  siteName: string,
  authorName?: string
): string {
  const stripped = stripSchemaMarkup(html);
  return injectSchema(stripped, blog, siteUrl, siteName, authorName);
}
