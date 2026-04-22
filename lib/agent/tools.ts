import fs from "node:fs/promises";
import crypto from "node:crypto";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { loadKB } from "@/lib/kb/load";
import { paths } from "@/lib/kb/paths";
import { hitsFromQueries } from "@/lib/kb/search";
import { cropPage } from "@/lib/kb/crop";
import { locateRegion } from "@/lib/kb/vision";
import { generateArtifact, type ArtifactKind } from "./artifact";

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

export interface ToolOverrides {
  /** Optional user-supplied API key; forwarded to the artifact author. */
  apiKey?: string;
  /** Optional model tier override for the artifact author. */
  artifactModelTier?: string;
}

export function buildMcpServer(bus: AgentEventBus, overrides: ToolOverrides = {}) {
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
        `BM25 full-text search across all ingested manuals. Ranks over vision-generated summaries, figure captions, table text, keywords, and raw OCR text. Tokens are Porter-stemmed at both index and query time — "welding", "welded", "welds" collapse to the same root — and short all-caps codes (DCEP, FCAW, MIG) are preserved verbatim.

IMPORTANT — pass MULTIPLE queries, not one.
The manual uses formal vocabulary; users don't. You must expand the user's question into 2–4 paraphrases covering:
  • the user's phrasing verbatim
  • the manual's formal/jargon phrasing ("stick welding" → also pass "SMAW", "shielded metal arc")
  • any abbreviation both expanded and contracted ("AC balance" → also "alternating current balance")
  • split compound questions into per-topic variants (don't cram both into one query)
Each paraphrase is scored independently; pages are merged with max-score + a small bonus for paraphrases that agree. One tool call covers the whole expansion — do NOT issue the same question multiple times.

Returns top matches with page citations and figure captions. Use this to find candidate pages, then open_page to actually see them.`,
        {
          queries: z
            .array(z.string().min(1))
            .min(1)
            .max(6)
            .describe(
              "2–4 paraphrases of the user's question (or 1 if truly unambiguous). Include jargon and part names verbatim. See the tool description for what to vary.",
            ),
          top_k: z.number().int().min(1).max(12).optional().default(6),
          doc: z.string().optional().describe("Optional doc slug to restrict search"),
        },
        async ({ queries, top_k, doc }): Promise<CallToolResult> => {
          const { index, manifest } = await loadKB();
          const results = hitsFromQueries(index, queries, { top_k, doc });
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
                queries,
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
          return {
            content: [
              {
                type: "text",
                text: `Cropped region of p.${page} in "${doc}": ${located.reason}.\nBBox: [${located.bbox.map((v) => v.toFixed(3)).join(", ")}]`,
              },
              {
                type: "image",
                data: crop.buffer.toString("base64"),
                mimeType: "image/png",
              },
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
        `Ship an interactive artifact to the user's artifact panel. Use this when a diagram, flowchart, or interactive calculator is clearer than prose.

HOW THIS TOOL WORKS — READ CAREFULLY
You do NOT write the artifact code yourself. You write a detailed SPEC, and a dedicated artifact-authoring model (Opus) turns it into a production-quality implementation. Your job is to describe WHAT to build, with every concrete number and citation from the manual. The author's job is to produce clean, polished code.

Kinds (pick the simplest that communicates the idea):
- "svg": inline SVG. Best for schematics, socket maps, labelled static diagrams.
- "mermaid": Mermaid flowchart/state-diagram. Best for decision trees, troubleshooting flows.
- "html": standalone sandboxed HTML. Use only when React is overkill (trivial static layouts).
- "react": React/TSX in a sandboxed iframe. Hooks + recharts + lucide-react + Tailwind preloaded. Best for calculators, configurators, interactive steppers, charts.
- "markdown": long-form markdown. Use sparingly — prefer react for anything interactive.

WHAT A GREAT SPEC LOOKS LIKE
Write the spec as if briefing a skilled designer who has never seen the manual. Include:
1. **Purpose** — in one sentence, what the user is trying to do / decide.
2. **Shape** — the components/layout: "a slider for amperage (50–200 A), a slider for duty cycle (20–60%), a result panel showing weld time" etc.
3. **Exact data from the manual** — list every number, threshold, option, part name, page citation that must appear. e.g. "At 200 A / 60% duty cycle the chart shows 6 min on, 4 min off (p.34). Options are DCEP, DCEN, AC (p.17)."
4. **Interaction** — what happens when the user adjusts each control, what's computed, how branches work for flowcharts.
5. **Citations** — which manual pages to reference in the UI footer or inline chips.
6. **Tone / constraints** — any safety warnings to surface, any ranges that must clamp.

A weak spec says "a duty cycle calculator". A strong spec lists the exact amperage range, the exact duty-cycle formula, the exact page numbers, and what the output should read.

VERSIONING
If you are revising an existing artifact (user asked you to tweak it, add a feature, fix a visual bug), pass the SAME \`group_id\` — the UI stacks the new version as v2/v3 under the existing card. Use a fresh stable slug ("duty-cycle-calc", "porosity-tree") for brand-new artifacts.

AUTO-FIX FLOW
If a prior artifact failed to render (you'll receive an error message), call emit_artifact AGAIN with the same group_id and pass the error verbatim as \`error_context\`. The author will diagnose and fix. You don't need to guess the syntax fix — just relay the error and restate the spec.`,
        {
          kind: z.enum(["react", "html", "svg", "mermaid", "markdown"]),
          title: z.string().describe("Short user-facing title shown on the artifact card."),
          spec: z
            .string()
            .min(40)
            .describe(
              "Detailed brief for the artifact author. MUST include concrete numbers, options, and page citations pulled from the manual. Not the code — the brief for someone who will write the code.",
            ),
          group_id: z
            .string()
            .optional()
            .describe(
              "Stable id grouping versions of the same logical artifact. Reuse to emit v2/v3.",
            ),
          version_note: z
            .string()
            .optional()
            .describe("One-line note describing what changed in this version."),
          error_context: z
            .string()
            .optional()
            .describe(
              "If this is an auto-fix retry, paste the render error from the prior version verbatim so the author can diagnose the syntax issue.",
            ),
        },
        async ({
          kind,
          title,
          spec,
          group_id,
          version_note,
          error_context,
        }): Promise<CallToolResult> => {
          try {
            const code = await generateArtifact({
              kind: kind as ArtifactKind,
              title,
              spec,
              errorContext: error_context,
              apiKey: overrides.apiKey,
              modelTier: overrides.artifactModelTier,
            });
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
              `Authored ${kind} artifact "${title}" (${code.length} chars) and rendered to the user's artifact panel${
                group_id ? ` (group ${group_id})` : ""
              }. Do not repeat the artifact contents in your message — just briefly tell the user it's ready in the panel.`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return textContent(
              `error: artifact author failed — ${msg}. You may retry with a tighter spec, or answer in prose.`,
            );
          }
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
