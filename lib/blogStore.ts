import fs from "fs";
import path from "path";
import type { BlogPost } from "./types";

export type { BlogPost };

const DATA_FILE = path.join(process.cwd(), "data", "blogs.json");
const TMP_FILE = path.join("/tmp", "phelix-blogs-generated.json");

function readFromFile(filePath: string): BlogPost[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as BlogPost[];
  } catch {
    return [];
  }
}

export async function getAllBlogs(): Promise<BlogPost[]> {
  const seed = readFromFile(DATA_FILE);
  const generated = readFromFile(TMP_FILE);
  const all = [...generated, ...seed];
  const seen = new Set<string>();
  return all.filter((b) => {
    if (seen.has(b.slug)) return false;
    seen.add(b.slug);
    return true;
  });
}

export async function getBlogBySlug(slug: string): Promise<BlogPost | null> {
  const all = await getAllBlogs();
  return all.find((b) => b.slug === slug) ?? null;
}

export async function saveBlog(blog: BlogPost): Promise<void> {
  const existing = readFromFile(TMP_FILE);
  const updated = [blog, ...existing.filter((b) => b.slug !== blog.slug)];
  fs.mkdirSync(path.dirname(TMP_FILE), { recursive: true });
  fs.writeFileSync(TMP_FILE, JSON.stringify(updated, null, 2), "utf-8");
}

export async function isDuplicateSlug(slug: string): Promise<boolean> {
  const all = await getAllBlogs();
  return all.some((b) => b.slug === slug);
}

export function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}
