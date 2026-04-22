import fs from "node:fs/promises";
import { paths } from "./paths";
import { loadIndexFromJSON, type IndexDoc } from "./search";
import type { Manifest, PageRecord } from "./types";
import MiniSearch from "minisearch";

let cached: {
  manifest: Manifest;
  index: MiniSearch<IndexDoc>;
  pagesByDoc: Map<string, PageRecord[]>;
} | null = null;

export async function loadKB(): Promise<{
  manifest: Manifest;
  index: MiniSearch<IndexDoc>;
  pagesByDoc: Map<string, PageRecord[]>;
}> {
  if (cached) return cached;

  const [manifestRaw, indexRaw] = await Promise.all([
    fs.readFile(paths.manifest(), "utf8").catch(() => ""),
    fs.readFile(paths.searchIndex(), "utf8").catch(() => ""),
  ]);

  if (!manifestRaw) {
    throw new Error(
      "No knowledge base found. Run `npm run ingest` first to build knowledge/ from files/.",
    );
  }

  const manifest = JSON.parse(manifestRaw) as Manifest;
  const index = indexRaw
    ? loadIndexFromJSON(JSON.parse(indexRaw))
    : loadIndexFromJSON({ documentCount: 0, index: {}, storedFields: {} });

  const pagesByDoc = new Map<string, PageRecord[]>();
  for (const d of manifest.documents) {
    try {
      const raw = await fs.readFile(paths.docPagesJson(d.slug), "utf8");
      pagesByDoc.set(d.slug, JSON.parse(raw) as PageRecord[]);
    } catch {
      pagesByDoc.set(d.slug, []);
    }
  }

  cached = { manifest, index, pagesByDoc };
  return cached;
}

export function clearKBCache(): void {
  cached = null;
}
