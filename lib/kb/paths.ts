import path from "node:path";

export const ROOT = process.cwd();
export const SOURCES_DIR = path.join(ROOT, "files");
export const KB_DIR = path.join(ROOT, "knowledge");
export const PUBLIC_SOURCES_DIR = path.join(ROOT, "public", "sources");

export const paths = {
  manifest: () => path.join(KB_DIR, "manifest.json"),
  docPagesJson: (slug: string) => path.join(KB_DIR, slug, "pages.json"),
  docMapJson: (slug: string) => path.join(KB_DIR, slug, "map.json"),
  searchIndex: () => path.join(KB_DIR, "index.json"),
  pageImage: (slug: string, page: number) =>
    path.join(PUBLIC_SOURCES_DIR, slug, `p-${String(page).padStart(3, "0")}.png`),
  pageImageUrl: (slug: string, page: number) =>
    `/sources/${slug}/p-${String(page).padStart(3, "0")}.png`,
};

export function slugify(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
