import fs from "fs";
import path from "path";
import type { BlogPost } from "./types";

export type { BlogPost };

const INDEX_FILE = path.join(process.cwd(), "data", "index.json");
const BLOGS_DIR  = path.join(process.cwd(), "data", "blogs");

/** Lightweight index entry — no content field, but includes lastUpdated for the update engine */
type BlogIndex = Omit<BlogPost, "content">;

function readIndex(): BlogIndex[] {
  try {
    if (!fs.existsSync(INDEX_FILE)) return [];
    const raw = fs.readFileSync(INDEX_FILE, "utf-8");
    return JSON.parse(raw) as BlogIndex[];
  } catch {
    return [];
  }
}

function readBlogFile(slug: string): BlogPost | null {
  try {
    const filePath = path.join(BLOGS_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as BlogPost;
  } catch {
    return null;
  }
}

/**
 * Returns all blogs sorted newest-first.
 * Reads index.json only — no content field (fast for listing pages).
 */
export async function getAllBlogs(): Promise<BlogPost[]> {
  const index = readIndex();
  return index
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map((entry) => ({ ...entry, content: "" }));
}

/**
 * Returns a single blog with full content by reading its individual JSON file.
 */
export async function getBlogBySlug(slug: string): Promise<BlogPost | null> {
  return readBlogFile(slug);
}

/**
 * Checks whether a slug already exists in the deployed data/blogs/ directory
 * or in the index (belt-and-suspenders).
 */
export async function isDuplicateSlug(slug: string): Promise<boolean> {
  const filePath = path.join(BLOGS_DIR, `${slug}.json`);
  if (fs.existsSync(filePath)) return true;
  const index = readIndex();
  return index.some((b) => b.slug === slug);
}

export function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}
