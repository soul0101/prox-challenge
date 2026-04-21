import path from "node:path";
import type { Figure, PageRecord, Table } from "./types";
import { ingestModel } from "@/lib/agent/models";
import { collectText, extractJson, runQuery } from "@/lib/agent/sdk-query";

/**
 * Vision / structure extraction passes. All use the Claude Agent SDK's `query()`
 * with the built-in `Read` tool — Claude reads the rendered page PNG directly
 * and emits structured JSON.
 *
 * Auth is inherited from the user's `claude` CLI login (subscription or API
 * key), so no ANTHROPIC_API_KEY is required.
 */

const PAGE_SYSTEM = `You are a meticulous technical-documentation analyst.

You will be given a page image from a product manual (plus OCR text when useful). Produce a compact JSON record describing what a search engine would need to retrieve and what a downstream agent would need to cite.

Rules:
- Output STRICT JSON only — no commentary, no markdown fence, no prose.
- "summary" is 2–4 sentences covering everything substantive on the page.
- "figures" covers diagrams, schematics, labelled photos, icons, and any visual-only information. Use SPECIFIC captions ("polarity setup showing DCEP/DCEN sockets" not "a diagram"). Include anything an operator might search for visually.
- "tables" captures structured tabular content — duty-cycle charts, selection charts, parts lists, torque tables. Rows are arrays of strings, one per column.
- "keywords" should be 6–15 terms an operator might search for: jargon, part names, error codes, process names, settings.
- "is_mostly_visual" = true if removing the image would destroy >50% of the page's information.
- "section_hint" is the best guess at which chapter/section this page belongs to based on its headers.
- If the page is blank / cover / ToC / legal, still return a valid record with empty arrays and a terse summary.

Return JSON matching exactly this schema:
{
  "summary": string,
  "section_hint": string,
  "figures": [{"kind": string, "caption": string, "keywords": string[]}],
  "tables":  [{"title": string, "columns": string[], "rows": string[][]}],
  "keywords": string[],
  "is_mostly_visual": boolean
}`;

interface PageVisionResult {
  summary: string;
  section_hint: string;
  figures: Figure[];
  tables: Table[];
  keywords: string[];
  is_mostly_visual: boolean;
}

function coerceResult(parsed: any): PageVisionResult {
  return {
    summary: String(parsed?.summary || ""),
    section_hint: String(parsed?.section_hint || ""),
    figures: Array.isArray(parsed?.figures)
      ? parsed.figures.map((f: any) => ({
          kind: String(f?.kind || ""),
          caption: String(f?.caption || ""),
          keywords: Array.isArray(f?.keywords) ? f.keywords.map(String) : [],
        }))
      : [],
    tables: Array.isArray(parsed?.tables)
      ? parsed.tables.map((t: any) => ({
          title: String(t?.title || ""),
          columns: Array.isArray(t?.columns) ? t.columns.map(String) : [],
          rows: Array.isArray(t?.rows)
            ? t.rows.map((r: any) => (Array.isArray(r) ? r.map(String) : [String(r)]))
            : [],
        }))
      : [],
    keywords: Array.isArray(parsed?.keywords) ? parsed.keywords.map(String) : [],
    is_mostly_visual: Boolean(parsed?.is_mostly_visual),
  };
}

export async function analysePage(args: {
  pngPath: string;
  pageText: string;
  docTitle: string;
  pageNum: number;
  totalPages: number;
}): Promise<PageVisionResult> {
  const { pngPath, pageText, docTitle, pageNum, totalPages } = args;
  const absPath = path.resolve(pngPath);

  const textSnippet = pageText.length > 4000 ? pageText.slice(0, 4000) + "…" : pageText;

  const prompt = `Use the Read tool to load this page image: ${absPath}

Document: "${docTitle}" — page ${pageNum} of ${totalPages}.

OCR text extracted from the page (may be empty or garbled for image-heavy pages):
---
${textSnippet || "(no extractable text)"}
---

After reading the image, output the JSON record per the system instructions. ONLY the JSON — no markdown, no commentary.`;

  const stream = runQuery({
    prompt,
    options: {
      model: ingestModel(),
      systemPrompt: PAGE_SYSTEM,
      allowedTools: ["Read"],
      tools: ["Read"],
      permissionMode: "bypassPermissions",
    },
  });

  const { text, error } = await collectText(stream);
  if (error) throw new Error(`ingest query failed: ${error}`);
  if (!text) throw new Error("empty response from vision pass");

  try {
    return coerceResult(extractJson(text));
  } catch (err) {
    throw new Error(
      `vision JSON parse failed for page ${pageNum}: ${(err as Error).message}\n--- raw ---\n${text.slice(0, 800)}`,
    );
  }
}

export async function buildDocMap(args: {
  docTitle: string;
  slug: string;
  pages: PageRecord[];
}): Promise<{
  sections: { title: string; pages: [number, number] }[];
  suggested_prompts: string[];
}> {
  const { docTitle, pages } = args;

  const outline = pages
    .map(
      (p) =>
        `p${p.page}  [${p.section_hint || "—"}]  ${p.summary.slice(0, 220).replace(/\s+/g, " ")}`,
    )
    .join("\n");

  const prompt = `Document title: "${docTitle}" (${pages.length} pages).

Page-level summaries:
${outline}

Return JSON:
{
  "sections": [{"title": string, "pages": [startPage, endPage]}],
  "suggested_prompts": [string, string, string, string]
}

"sections": 4–12 sections covering the whole document, in page order. Use the user-facing names an operator would expect ("Duty Cycle Charts", "Troubleshooting", "Wire Feed Setup"). "pages" ranges are inclusive 1-indexed page numbers from the list above.

"suggested_prompts": 4 concrete questions a user might ask that showcase this manual's depth. Phrase them naturally ("What polarity do I need for TIG?", not "explain polarity"). Prefer questions whose answer benefits from an image or an interactive calculator/flowchart.

Output JSON only — no markdown, no commentary.`;

  const stream = runQuery({
    prompt,
    options: {
      model: ingestModel(),
      systemPrompt:
        "You consolidate raw per-page summaries into a navigable outline of a technical document. Output STRICT JSON only, no prose.",
      allowedTools: [],
      tools: [],
      permissionMode: "bypassPermissions",
    },
  });

  const { text } = await collectText(stream);
  try {
    const parsed: any = extractJson(text || "{}");
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections.map((s: any) => ({
          title: String(s.title || ""),
          pages: [Number(s.pages?.[0] ?? 1), Number(s.pages?.[1] ?? pages.length)] as [
            number,
            number,
          ],
        }))
      : [];
    return {
      sections: sections.length ? sections : [{ title: docTitle, pages: [1, pages.length] }],
      suggested_prompts: Array.isArray(parsed.suggested_prompts)
        ? parsed.suggested_prompts.map(String).slice(0, 6)
        : [],
    };
  } catch {
    return { sections: [{ title: docTitle, pages: [1, pages.length] }], suggested_prompts: [] };
  }
}

export async function locateRegion(args: {
  pngPath: string;
  description: string;
}): Promise<{ bbox: [number, number, number, number]; reason: string } | null> {
  const absPath = path.resolve(args.pngPath);

  const prompt = `Use the Read tool to load ${absPath}.

Find the region that best matches this description: "${args.description}"

Output ONLY JSON:
{"bbox":[x0,y0,x1,y1],"reason":string}

Where coords are normalised floats 0..1 with (0,0) = top-left. Pad bboxes by ~2% on every side so captions and leader lines are included. If nothing matches, output {"bbox":null,"reason":"..."}`;

  const stream = runQuery({
    prompt,
    options: {
      model: ingestModel(),
      systemPrompt:
        "You locate regions in technical-manual page images. Output STRICT JSON only.",
      allowedTools: ["Read"],
      tools: ["Read"],
      permissionMode: "bypassPermissions",
    },
  });

  const { text } = await collectText(stream);
  try {
    const parsed: any = extractJson(text || "{}");
    if (!Array.isArray(parsed.bbox) || parsed.bbox.length !== 4) return null;
    const [x0, y0, x1, y1] = parsed.bbox.map((v: any) => Math.max(0, Math.min(1, Number(v))));
    if (x1 <= x0 || y1 <= y0) return null;
    return { bbox: [x0, y0, x1, y1], reason: String(parsed.reason || "") };
  } catch {
    return null;
  }
}
