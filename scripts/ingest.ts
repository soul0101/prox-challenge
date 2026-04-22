import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { KB_DIR, PUBLIC_SOURCES_DIR, SOURCES_DIR, paths, slugify } from "@/lib/kb/paths";
import { renderPdf } from "@/lib/kb/pdf";
import type { Manifest, ManifestEntry, PageRecord } from "@/lib/kb/types";
import { analysePage, buildDocMap } from "@/lib/kb/vision";
import { createIndex, pageToIndexDoc, type IndexDoc } from "@/lib/kb/search";

const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const MAX_PARALLEL = Number(process.env.INGEST_CONCURRENCY || 4);

async function sha256File(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await fs.readFile(paths.manifest(), "utf8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return null;
  }
}

function friendlyTitle(file: string): string {
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function processPdf(opts: {
  file: string;
  slug: string;
  title: string;
  hash: string;
  prevEntry: ManifestEntry | null;
}): Promise<ManifestEntry> {
  const { file, slug, title, hash } = opts;
  const fullPath = path.join(SOURCES_DIR, file);
  const imageDir = path.join(PUBLIC_SOURCES_DIR, slug);
  const kbDir = path.join(KB_DIR, slug);
  await fs.mkdir(kbDir, { recursive: true });

  console.log(`\n[${slug}] rendering PDF pages…`);
  const rendered = await renderPdf(fullPath, imageDir, {
    scale: 2.0,
    onProgress: (p, t) => {
      if (p === 1 || p === t || p % 5 === 0) {
        process.stdout.write(`  render ${p}/${t}\r`);
      }
    },
  });
  console.log(`  render ${rendered.length}/${rendered.length} done`);

  console.log(`[${slug}] running vision pass on ${rendered.length} pages…`);
  const pages: PageRecord[] = new Array(rendered.length);

  // Simple bounded-concurrency worker pool.
  let next = 0;
  let completed = 0;
  const total = rendered.length;
  async function worker() {
    while (next < total) {
      const idx = next++;
      const r = rendered[idx];
      try {
        const v = await analysePage({
          pngPath: r.pngPath,
          pageText: r.text,
          docTitle: title,
          pageNum: r.page,
          totalPages: total,
        });
        pages[idx] = {
          doc: slug,
          page: r.page,
          width: r.width,
          height: r.height,
          text: r.text,
          image_path: paths.pageImageUrl(slug, r.page),
          ...v,
        };
      } catch (err) {
        console.warn(`  [${slug}] p${r.page} vision failed: ${(err as Error).message}`);
        pages[idx] = {
          doc: slug,
          page: r.page,
          width: r.width,
          height: r.height,
          text: r.text,
          image_path: paths.pageImageUrl(slug, r.page),
          summary: r.text.slice(0, 400) || `Page ${r.page}`,
          section_hint: "",
          figures: [],
          tables: [],
          keywords: [],
          is_mostly_visual: false,
        };
      } finally {
        completed++;
        process.stdout.write(`  vision ${completed}/${total}\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, total) }, worker));
  console.log(`  vision ${completed}/${total} done`);

  await fs.writeFile(paths.docPagesJson(slug), JSON.stringify(pages, null, 2));

  console.log(`[${slug}] building document map…`);
  const map = await buildDocMap({ docTitle: title, slug, pages });
  const docMap = {
    slug,
    title,
    page_count: pages.length,
    sections: map.sections,
    suggested_prompts: map.suggested_prompts,
  };
  await fs.writeFile(paths.docMapJson(slug), JSON.stringify(docMap, null, 2));

  return {
    slug,
    title,
    source_file: file,
    page_count: pages.length,
    hash,
    ingested_at: new Date().toISOString(),
    kind: "pdf",
    map: docMap,
  };
}

async function rebuildIndex(manifest: Manifest): Promise<void> {
  const all: IndexDoc[] = [];
  for (const entry of manifest.documents) {
    const pages: PageRecord[] = JSON.parse(
      await fs.readFile(paths.docPagesJson(entry.slug), "utf8"),
    );
    for (const p of pages) all.push(pageToIndexDoc(p, entry.title));
  }
  const ms = createIndex(all);
  const json = ms.toJSON();
  await fs.writeFile(paths.searchIndex(), JSON.stringify(json));
  console.log(`[index] ${all.length} pages across ${manifest.documents.length} documents`);
}

async function main(): Promise<void> {
  // Auth: prefer the user's `claude` CLI login (subscription / OAuth). If
  // ANTHROPIC_API_KEY is set, the SDK uses that instead. Either is fine.
  const srcExists = await exists(SOURCES_DIR);
  if (!srcExists) {
    console.error(`Source directory not found: ${SOURCES_DIR}`);
    process.exit(1);
  }

  await fs.mkdir(KB_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_SOURCES_DIR, { recursive: true });

  const prev = (await loadManifest()) ?? {
    version: 1 as const,
    generated_at: new Date().toISOString(),
    documents: [],
  };
  const prevBySlug = new Map(prev.documents.map((d) => [d.slug, d]));

  const entries = (await fs.readdir(SOURCES_DIR)).filter(
    (f) => !f.startsWith(".") && /\.(pdf|png|jpg|jpeg|webp)$/i.test(f),
  );
  if (entries.length === 0) {
    console.error(`No ingestable files found in ${SOURCES_DIR}`);
    process.exit(1);
  }

  const docs: ManifestEntry[] = [];
  for (const file of entries) {
    const slug = slugify(file);
    if (ONLY && slug !== ONLY) continue;

    const fullPath = path.join(SOURCES_DIR, file);
    const hash = await sha256File(fullPath);
    const prevEntry = prevBySlug.get(slug) ?? null;

    const upToDate =
      !FORCE &&
      prevEntry?.hash === hash &&
      (await exists(paths.docPagesJson(slug))) &&
      (await exists(paths.docMapJson(slug)));

    if (upToDate) {
      console.log(`[${slug}] up-to-date (hash match), skipping`);
      docs.push(prevEntry!);
      continue;
    }

    const ext = path.extname(file).toLowerCase();
    const title = friendlyTitle(file);

    if (ext === ".pdf") {
      const entry = await processPdf({ file, slug, title, hash, prevEntry });
      docs.push(entry);
    } else {
      // Image fallback (one-page doc).
      console.log(`[${slug}] processing as single-page image…`);
      const imageDir = path.join(PUBLIC_SOURCES_DIR, slug);
      await fs.mkdir(imageDir, { recursive: true });
      const dest = paths.pageImage(slug, 1);
      await fs.copyFile(fullPath, dest);
      const v = await analysePage({
        pngPath: dest,
        pageText: "",
        docTitle: title,
        pageNum: 1,
        totalPages: 1,
      });
      const pages: PageRecord[] = [
        {
          doc: slug,
          page: 1,
          width: 0,
          height: 0,
          text: "",
          image_path: paths.pageImageUrl(slug, 1),
          ...v,
        },
      ];
      await fs.writeFile(
        paths.docPagesJson(slug),
        JSON.stringify(pages, null, 2),
      );
      const docMap = {
        slug,
        title,
        page_count: 1,
        sections: [{ title, pages: [1, 1] as [number, number] }],
        suggested_prompts: [],
      };
      await fs.writeFile(paths.docMapJson(slug), JSON.stringify(docMap, null, 2));
      docs.push({
        slug,
        title,
        source_file: file,
        page_count: 1,
        hash,
        ingested_at: new Date().toISOString(),
        kind: "image",
        map: docMap,
      });
    }
  }

  // Preserve previously-ingested docs that weren't in this run (if --only was used).
  if (ONLY) {
    for (const prevDoc of prev.documents) {
      if (!docs.find((d) => d.slug === prevDoc.slug)) docs.push(prevDoc);
    }
  }

  const manifest: Manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
    documents: docs.sort((a, b) => a.title.localeCompare(b.title)),
  };
  await fs.writeFile(paths.manifest(), JSON.stringify(manifest, null, 2));

  await rebuildIndex(manifest);

  console.log("\n✓ ingest complete");
  console.log(`  manifest:   ${path.relative(process.cwd(), paths.manifest())}`);
  console.log(`  index:      ${path.relative(process.cwd(), paths.searchIndex())}`);
  for (const d of manifest.documents) {
    console.log(`  - ${d.title}  (${d.page_count} pages)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
