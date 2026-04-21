import fs from "node:fs/promises";
import crypto from "node:crypto";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { loadKB } from "@/lib/kb/load";
import { paths } from "@/lib/kb/paths";
import { hitsFromResults } from "@/lib/kb/search";
import { cropPage } from "@/lib/kb/crop";
import { locateRegion } from "@/lib/kb/vision";

import type { AgentEventBus } from "./events";

/**
 * Generic, document-agnostic tool set for the runtime agent. All tools operate
 * on whatever has been ingested into knowledge/ + public/sources/.
 *
 *   list_documents     — enumerate ingested corpora
 *   search             — BM25 over the vision-generated index
 *   open_page(s)       — return page images + text for Claude to *see*
 *   crop_region        — vision-locate a region and return just that crop
 *   show_source        — surface a page (or crop) to the end user
 *   emit_artifact      — stream a renderable artifact (svg/mermaid/html/react)
 *   ask_user           — request disambiguation from the user via quick replies
 */

async function loadPageImage(
  slug: string,
  page: number,
): Promise<{ data: string; mimeType: string }> {
  const buf = await fs.readFile(paths.pageImage(slug, page));
  return { data: buf.toString("base64"), mimeType: "image/png" };
}

function textContent(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function buildMcpServer(bus: AgentEventBus) {
  return createSdkMcpServer({
    name: "manual",
    tools: [
      tool(
        "list_documents",
        "List ingested manuals/documents with their outlines, suggested prompts, and page counts. Call once at the start of the conversation so you know what corpus is available.",
        {},
        async (): Promise<CallToolResult> => {
          const { manifest } = await loadKB();
          const summary = manifest.documents.map((d) => ({
            doc: d.slug,
            title: d.title,
            source_file: d.source_file,
            pages: d.page_count,
            sections: d.map.sections.map((s) => ({
              title: s.title,
              pages: `${s.pages[0]}–${s.pages[1]}`,
            })),
            suggested_prompts: d.map.suggested_prompts,
          }));
          return textContent(JSON.stringify({ documents: summary }, null, 2));
        },
      ),

      tool(
        "search",
        "BM25 full-text search across all ingested manuals. Ranks over vision-generated summaries, figure captions, table text, keywords, and raw OCR text. Returns top matches with page citations and figure captions — use this to find candidate pages, then open_page to actually see them.",
        {
          query: z.string().describe("Natural-language query. Include jargon and part names verbatim."),
          top_k: z.number().int().min(1).max(12).optional().default(6),
          doc: z.string().optional().describe("Optional doc slug to restrict search"),
        },
        async ({ query, top_k, doc }): Promise<CallToolResult> => {
          const { index, manifest } = await loadKB();
          const results = hitsFromResults(index, query, { top_k, doc });
          // Enrich with a stable rendering hint.
          const rows = results.map((h) => ({
            doc: h.doc,
            doc_title: h.doc_title,
            page: h.page,
            section: h.section_hint,
            score: Number(h.score.toFixed(3)),
            summary: h.summary,
            figures: h.figures,
            page_url: paths.pageImageUrl(h.doc, h.page),
          }));
          return textContent(
            JSON.stringify(
              {
                query,
                hits: rows,
                documents_available: manifest.documents.map((d) => ({ doc: d.slug, title: d.title })),
              },
              null,
              2,
            ),
          );
        },
      ),

      tool(
        "open_page",
        "Return a single page: the full rendered PAGE IMAGE (so you can SEE diagrams/photos) plus its text layer and vision-extracted metadata. Use this whenever the answer might depend on visual content — schematics, wiring diagrams, labelled photos, weld samples, tables. Cheaper than open_pages; prefer it when 1–2 pages suffice.",
        {
          doc: z.string().describe("Document slug from list_documents / search"),
          page: z.number().int().min(1),
        },
        async ({ doc, page }): Promise<CallToolResult> => {
          const { pagesByDoc } = await loadKB();
          const pages = pagesByDoc.get(doc);
          if (!pages) return textContent(`error: unknown document "${doc}"`);
          const rec = pages.find((p) => p.page === page);
          if (!rec) return textContent(`error: page ${page} not in "${doc}"`);

          const img = await loadPageImage(doc, page);
          const meta = {
            doc,
            page,
            section: rec.section_hint,
            summary: rec.summary,
            figures: rec.figures,
            tables: rec.tables,
            text: rec.text.slice(0, 4000),
          };
          return {
            content: [
              {
                type: "text",
                text: `Page ${page} of "${doc}" — section: ${rec.section_hint || "(unknown)"}. Metadata below, full page image attached.\n\n${JSON.stringify(meta, null, 2)}`,
              },
              {
                type: "image",
                data: img.data,
                mimeType: img.mimeType,
              },
            ],
          };
        },
      ),

      tool(
        "open_pages",
        "Return a contiguous range of pages as page images (up to 6). Use when a topic spans multiple facing pages (e.g. a duty-cycle chart that continues).",
        {
          doc: z.string(),
          from: z.number().int().min(1),
          to: z.number().int().min(1),
        },
        async ({ doc, from, to }): Promise<CallToolResult> => {
          const { pagesByDoc } = await loadKB();
          const pages = pagesByDoc.get(doc);
          if (!pages) return textContent(`error: unknown document "${doc}"`);

          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const span = Math.min(6, hi - lo + 1);
          const selected = pages.filter((p) => p.page >= lo && p.page < lo + span);
          if (selected.length === 0) return textContent(`error: no pages in range`);

          const content: CallToolResult["content"] = [
            {
              type: "text",
              text: `Pages ${lo}–${lo + span - 1} of "${doc}" (capped at 6). Each page image and its summary follow.`,
            },
          ];
          for (const rec of selected) {
            const img = await loadPageImage(doc, rec.page);
            content.push({
              type: "text",
              text: `— Page ${rec.page} (${rec.section_hint || "—"}): ${rec.summary}`,
            });
            content.push({ type: "image", data: img.data, mimeType: img.mimeType });
          }
          return { content };
        },
      ),

      tool(
        "crop_region",
        "Locate a region on a page that matches a natural-language description and return JUST that cropped image. Use when the page is dense and you want to show (or see) only a specific diagram / table / photo. Backed by a vision call to find the bbox, then a deterministic sharp crop. Result is cached by bbox.",
        {
          doc: z.string(),
          page: z.number().int().min(1),
          description: z
            .string()
            .describe("What to crop, e.g. 'the DCEP socket diagram' or 'the duty cycle chart'"),
        },
        async ({ doc, page, description }): Promise<CallToolResult> => {
          const { pagesByDoc } = await loadKB();
          const pages = pagesByDoc.get(doc);
          if (!pages) return textContent(`error: unknown document "${doc}"`);
          const rec = pages.find((p) => p.page === page);
          if (!rec) return textContent(`error: page ${page} not in "${doc}"`);

          const located = await locateRegion({
            pngPath: paths.pageImage(doc, page),
            description,
          });
          if (!located) return textContent(`no matching region found on p.${page}`);

          const crop = await cropPage({ slug: doc, page, bbox: located.bbox });
          const buf = await fs.readFile(crop.file);
          return {
            content: [
              {
                type: "text",
                text: `Cropped region of p.${page} in "${doc}": ${located.reason}.\nCrop URL: ${crop.url}\nBBox: [${located.bbox.map((v) => v.toFixed(3)).join(", ")}]`,
              },
              { type: "image", data: buf.toString("base64"), mimeType: "image/png" },
            ],
          };
        },
      ),

      tool(
        "show_source",
        "Surface a source page (optionally cropped to a sub-region) to the END USER in the chat UI. Use whenever your answer references specific visual content — polarity diagrams, weld photos, schematics, labelled front panels. The UI renders it inline with a citation chip. If you pass `region`, it triggers a vision crop and the UI both shows the crop AND highlights the located bbox on the source page when opened.",
        {
          doc: z.string(),
          page: z.number().int().min(1),
          caption: z.string().optional().describe("One-line caption for the user"),
          region: z
            .string()
            .optional()
            .describe(
              "Optional natural-language description of a sub-region to crop, e.g. 'the polarity socket diagram'. Crops via vision-locate + sharp.",
            ),
        },
        async ({ doc, page, caption, region }): Promise<CallToolResult> => {
          const { manifest, pagesByDoc } = await loadKB();
          const entry = manifest.documents.find((d) => d.slug === doc);
          if (!entry) return textContent(`error: unknown document "${doc}"`);
          const pages = pagesByDoc.get(doc) || [];
          const rec = pages.find((p) => p.page === page);
          if (!rec) return textContent(`error: page ${page} not in "${doc}"`);

          let cropUrl: string | undefined;
          let bbox: [number, number, number, number] | undefined;

          if (region) {
            const located = await locateRegion({
              pngPath: paths.pageImage(doc, page),
              description: region,
            });
            if (located) {
              const crop = await cropPage({ slug: doc, page, bbox: located.bbox });
              cropUrl = crop.url;
              bbox = [
                Math.round(located.bbox[0] * (rec.width || 0)),
                Math.round(located.bbox[1] * (rec.height || 0)),
                Math.round((located.bbox[2] - located.bbox[0]) * (rec.width || 0)),
                Math.round((located.bbox[3] - located.bbox[1]) * (rec.height || 0)),
              ];
            }
          }

          bus.emit({
            type: "source",
            doc,
            doc_title: entry.title,
            page,
            url: paths.pageImageUrl(doc, page),
            caption,
            bbox,
            cropUrl,
          });
          return textContent(
            `Surfaced p.${page} of "${entry.title}" to the user${cropUrl ? " (with crop)" : ""}.`,
          );
        },
      ),

      tool(
        "emit_artifact",
        `Ship an interactive artifact to the END USER's artifact panel. Use this when a drawing, flowchart, or interactive calculator is clearer than words.

Kinds:
- "svg": raw inline SVG. Best for schematics, socket maps, static diagrams. Just the <svg>…</svg>.
- "mermaid": a Mermaid diagram (flowchart/sequence/stateDiagram). Just the mermaid source, no fences.
- "html": a standalone HTML fragment (may include <style> and <script>). Runs in a sandboxed iframe; no network. Good for calculators, steppers, form wizards.
- "react": a React component written in TSX. \`export default function Component(){...}\`. Globals available: React, hooks, recharts (import from "recharts"), lucide-react icons. Tailwind classes work.
- "markdown": long-form markdown — use sparingly; prefer react/html for interactivity.

Pick the SIMPLEST kind that communicates the idea. Always include concrete numbers/citations pulled from the manual, never invented.

VERSIONING: when you are revising or improving a previously emitted artifact (user asked you to tweak it, fix a bug, add a feature), pass the SAME \`group_id\` as the original — the UI will stack the new code as a version (v2, v3…) under the existing card so the user can switch between them. Use a fresh group_id when emitting a brand-new artifact unrelated to any prior one. Use a stable, slug-like group_id (e.g. "duty-cycle-calc", "porosity-tree").

CODE QUALITY — your artifact code is run inside a sandboxed iframe via \`sucrase\` (TSX → JS) and rendered with React 18. Sucrase is fast but unforgiving — broken syntax fails immediately. Common pitfalls that cause render failures, AVOID THEM:
1. **Apostrophes in single-quoted strings.** \`'it's broken'\` is a syntax error. Use double quotes for any string containing an apostrophe: \`"it's fine"\`, or escape: \`'it\\'s fine'\`. Same applies to JSX attribute values.
2. **JSX self-closing tags** must end with \`/>\`. \`<Icon className="x">\` is wrong — write \`<Icon className="x" />\`. Components without children MUST self-close.
3. **Every opened tag needs a matching close.** \`<div>\` requires \`</div>\`, \`<ul>\` requires \`</ul>\`. Read your code top-to-bottom and verify the tag stack balances.
4. **No truncated identifiers.** Check that variable / object key names are spelled the SAME in every reference. \`description\` ≠ \`deription\`, \`ventilation\` ≠ \`ntilation\`. A single typo crashes the whole artifact.
5. **Numbers and units must be complete inside JSX text.** \`<strong>25% @ 200 A</strong> = 2.5 minutes\` — don't drop the \`= 2\`.
6. **No raw \`<\` or \`{\` in JSX text** — escape with \`{"<"}\` / \`{"{"}\` if needed.
7. **Default export required** for "react" kind: \`export default function Component() { … }\`.
8. **Re-read your code one more time before submitting** — most failures are typos that a careful pass would catch.

If a previous emission failed, the user (or the auto-fix system) will send you a message containing the error. Read it, identify the specific syntax issue, and re-emit using the same group_id with a fully corrected version.`,
        {
          kind: z.enum(["react", "html", "svg", "mermaid", "markdown"]),
          title: z.string().describe("Short user-facing title"),
          code: z.string().describe("The artifact source (no markdown fences)"),
          group_id: z
            .string()
            .optional()
            .describe(
              "Stable id grouping versions of the same logical artifact. Reuse to emit v2/v3.",
            ),
          version_note: z
            .string()
            .optional()
            .describe("Optional one-line note describing what changed in this version"),
        },
        async ({ kind, title, code, group_id, version_note }): Promise<CallToolResult> => {
          const id = crypto.randomBytes(6).toString("hex");
          bus.emit({
            type: "artifact",
            id,
            kind,
            title,
            code,
            group_id,
            version_note,
          });
          return textContent(
            `Rendered ${kind} artifact "${title}" (${code.length} chars) to the user's artifact panel${
              group_id ? ` (group ${group_id})` : ""
            }.`,
          );
        },
      ),

      tool(
        "ask_user",
        "Ask the user a clarifying question with quick-reply options. Use when the query is genuinely ambiguous (e.g. 'MIG or flux-cored?' when both are plausible). Each call pauses the agent until the user replies.",
        {
          question: z.string(),
          options: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                detail: z.string().optional(),
              }),
            )
            .min(2)
            .max(6),
          allow_free_text: z.boolean().optional().default(true),
        },
        async ({ question, options, allow_free_text }): Promise<CallToolResult> => {
          bus.emit({
            type: "ask",
            question,
            options,
            allow_free_text: allow_free_text ?? true,
          });
          return textContent(
            `Presented question to the user: "${question}" with options ${options.map((o) => o.label).join(", ")}. Wait for the next user message to proceed.`,
          );
        },
      ),
    ],
  });
}

/** Names as exposed to the query(): allowedTools. Format is mcp__<server>__<tool>. */
export function allowedToolNames(): string[] {
  const prefix = "mcp__manual__";
  return [
    "list_documents",
    "search",
    "open_page",
    "open_pages",
    "crop_region",
    "show_source",
    "emit_artifact",
    "ask_user",
  ].map((n) => prefix + n);
}
