/**
 * lib/agent/seo/schemaValidator.ts
 *
 * Structured-data validator. Pulls the page HTML, extracts every
 * `<script type="application/ld+json">` block, and validates against
 * a per-type rule set derived from Google's structured data requirements.
 *
 * Why this matters: invalid schema kills rich-result eligibility silently.
 * Most sites have schema and don't realize it's broken.
 *
 * No external API needed — does its own fetch + parse + rule check.
 */

export interface SchemaIssue {
  level:    "error" | "warning";
  type:     string;          // schema @type, e.g. "Article"
  field:    string;          // missing/invalid field
  message:  string;
}

export interface SchemaCheck {
  url:        string;
  fetchedAt:  string;
  /** All ld+json blocks found */
  blocks:     Array<{ type: string; valid: boolean; raw: unknown }>;
  issues:     SchemaIssue[];
  /** Overall PASS if zero errors */
  passes:     boolean;
}

// ─── Rules per schema type ────────────────────────────────────────────────────

const REQUIRED_FIELDS: Record<string, string[]> = {
  Article:        ["headline", "author", "datePublished", "image"],
  BlogPosting:    ["headline", "author", "datePublished", "image"],
  NewsArticle:    ["headline", "author", "datePublished", "image"],
  FAQPage:        ["mainEntity"],
  HowTo:          ["name", "step"],
  Product:        ["name", "image"],
  Organization:   ["name", "url"],
  LocalBusiness:  ["name", "address", "telephone"],
  WebSite:        ["url", "name"],
  BreadcrumbList: ["itemListElement"],
  Review:         ["author", "reviewRating", "itemReviewed"],
  AggregateRating:["ratingValue", "reviewCount"],
  Recipe:         ["name", "recipeIngredient", "recipeInstructions"],
  Event:          ["name", "startDate", "location"],
  VideoObject:    ["name", "description", "thumbnailUrl", "uploadDate"],
};

const RECOMMENDED_FIELDS: Record<string, string[]> = {
  Article:      ["dateModified", "publisher", "mainEntityOfPage"],
  BlogPosting:  ["dateModified", "publisher", "mainEntityOfPage"],
  Product:      ["offers", "aggregateRating", "review", "brand"],
  LocalBusiness:["openingHoursSpecification", "geo", "priceRange"],
  Organization: ["logo", "sameAs", "contactPoint"],
};

// ─── Block extraction & validation ────────────────────────────────────────────

function extractLdJsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      // Some sites have multiple JSON objects in one block — skip silently
    }
  }
  return blocks;
}

function flattenBlocks(blocks: unknown[]): Array<Record<string, unknown>> {
  const flat: Array<Record<string, unknown>> = [];
  const visit = (obj: unknown) => {
    if (Array.isArray(obj)) { obj.forEach(visit); return; }
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    if (o["@graph"]) {
      visit(o["@graph"]);
      return;
    }
    if (o["@type"]) flat.push(o);
  };
  blocks.forEach(visit);
  return flat;
}

function getType(obj: Record<string, unknown>): string {
  const t = obj["@type"];
  if (typeof t === "string") return t;
  if (Array.isArray(t) && t.length > 0 && typeof t[0] === "string") return t[0];
  return "Unknown";
}

function validateBlock(obj: Record<string, unknown>): { valid: boolean; issues: SchemaIssue[] } {
  const type   = getType(obj);
  const issues: SchemaIssue[] = [];

  const required = REQUIRED_FIELDS[type] ?? [];
  for (const field of required) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
      issues.push({ level: "error", type, field, message: `Required field "${field}" is missing.` });
    }
  }

  const recommended = RECOMMENDED_FIELDS[type] ?? [];
  for (const field of recommended) {
    if (obj[field] === undefined || obj[field] === null) {
      issues.push({ level: "warning", type, field, message: `Recommended field "${field}" is missing.` });
    }
  }

  // Type-specific deep checks
  if (type === "FAQPage") {
    const me = obj["mainEntity"];
    if (Array.isArray(me)) {
      me.forEach((q, i) => {
        if (typeof q !== "object" || !q) {
          issues.push({ level: "error", type, field: `mainEntity[${i}]`, message: "Question must be an object." });
          return;
        }
        const qq = q as Record<string, unknown>;
        if (!qq.name)               issues.push({ level: "error", type, field: `mainEntity[${i}].name`,           message: "Question name is missing." });
        if (!qq.acceptedAnswer)     issues.push({ level: "error", type, field: `mainEntity[${i}].acceptedAnswer`, message: "Accepted answer is missing." });
      });
    } else if (me) {
      issues.push({ level: "error", type, field: "mainEntity", message: "FAQPage mainEntity must be an array." });
    }
  }

  if (type === "Article" || type === "BlogPosting") {
    const author = obj["author"];
    if (author && typeof author === "object" && !Array.isArray(author)) {
      const a = author as Record<string, unknown>;
      if (!a["@type"]) {
        issues.push({ level: "warning", type, field: "author.@type", message: "Author should specify @type (Person or Organization)." });
      }
    }
    const img = obj["image"];
    if (typeof img === "string" && img.length === 0) {
      issues.push({ level: "error", type, field: "image", message: "image cannot be empty string." });
    }
  }

  if (type === "BreadcrumbList") {
    const items = obj["itemListElement"];
    if (Array.isArray(items)) {
      items.forEach((it, i) => {
        if (typeof it !== "object" || !it) return;
        const itt = it as Record<string, unknown>;
        if (!itt.position) issues.push({ level: "error", type, field: `itemListElement[${i}].position`, message: "Each breadcrumb must have a position." });
        if (!itt.name && !itt.item) issues.push({ level: "error", type, field: `itemListElement[${i}].name`, message: "Each breadcrumb must have a name or item." });
      });
    }
  }

  return { valid: issues.filter((i) => i.level === "error").length === 0, issues };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function validateSchemaForUrl(url: string): Promise<SchemaCheck> {
  const out: SchemaCheck = {
    url,
    fetchedAt: new Date().toISOString(),
    blocks:    [],
    issues:    [],
    passes:    true,
  };

  let html = "";
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(30_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PhelixSchemaBot/1.0)" },
    });
    if (!res.ok) {
      out.issues.push({ level: "error", type: "fetch", field: "url", message: `HTTP ${res.status}` });
      out.passes = false;
      return out;
    }
    html = await res.text();
  } catch (err) {
    out.issues.push({ level: "error", type: "fetch", field: "url", message: err instanceof Error ? err.message : String(err) });
    out.passes = false;
    return out;
  }

  const raw    = extractLdJsonBlocks(html);
  const flat   = flattenBlocks(raw);
  for (const block of flat) {
    const { valid, issues } = validateBlock(block);
    out.blocks.push({ type: getType(block), valid, raw: block });
    out.issues.push(...issues);
    if (!valid) out.passes = false;
  }

  if (flat.length === 0) {
    out.issues.push({ level: "warning", type: "page", field: "ld+json", message: "No structured data found on page." });
  }

  return out;
}

export interface SchemaAuditData {
  /** keyed by URL */
  checks:        Record<string, SchemaCheck>;
  lastAuditedAt: string | null;
}

export const EMPTY_SCHEMA_AUDIT: SchemaAuditData = { checks: {}, lastAuditedAt: null };

export async function validateSchemaBatch(
  urls: string[],
  current: SchemaAuditData,
): Promise<{ checked: number; failed: number; data: SchemaAuditData }> {
  let checked = 0, failed = 0;
  for (const url of urls) {
    const check = await validateSchemaForUrl(url);
    current.checks[url] = check;
    if (!check.passes) failed++;
    checked++;
  }
  current.lastAuditedAt = new Date().toISOString();
  return { checked, failed, data: current };
}
