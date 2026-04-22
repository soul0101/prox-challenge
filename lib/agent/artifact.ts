import { modelFor } from "./models";
import { collectText, runQuery } from "./sdk-query";

/**
 * Dedicated artifact author. The orchestrator (Sonnet) writes a spec — what to
 * build and the concrete numbers/citations from the manual. This function runs
 * a focused Opus sub-query that turns the spec into production-quality code.
 *
 * Keeping this separate from the orchestrator means the conversational model
 * stays fast and cheap, and the visual/interactive output gets a model that
 * actually writes TSX well.
 */

export type ArtifactKind = "react" | "html" | "svg" | "mermaid" | "markdown";

const KIND_GUIDE: Record<ArtifactKind, string> = {
  react: `React + TSX in a sandboxed iframe. Export default function Component. Globals available without import statements: React, all hooks (useState, useEffect, useMemo, useRef, useCallback, useReducer). Imports that DO work: "recharts" (LineChart, BarChart, Tooltip, ResponsiveContainer, etc.), "lucide-react" (every icon). No other imports. Tailwind classes work — use them liberally. The iframe has no network, no localStorage, no window.parent tricks.

Design bar: this should look like a polished product, not a demo. Use spacing, typography hierarchy, subtle shadows, and rounded corners. Prefer a dark surface (bg-zinc-900 / bg-neutral-900) with high-contrast text (text-zinc-100), brand-orange accents (text-orange-400, bg-orange-500/10, border-orange-500/30) on interactive elements. Every number should have a label. Every control should have a readout. Never leave a user guessing what a slider does.`,
  html: `Standalone HTML fragment. May include <style> and <script>. Runs in a sandboxed iframe with no network. Good for trivial calculators or static layouts where React is overkill. Use inline CSS — Tailwind is NOT available here.`,
  svg: `Raw inline <svg>…</svg>. Use currentColor for strokes so it picks up the theme. Include <title> and meaningful aria-labels. ViewBox sized so it scales cleanly. Labels on every component, leader lines where helpful. Prefer thin strokes (stroke-width 1.5) and a restrained palette — white/zinc for structure, orange (#f97316) for highlights.`,
  mermaid: `Mermaid source only, no code fences. Start with "flowchart TD" or "flowchart LR" or "stateDiagram-v2". Keep node labels short (< 40 chars). Use decision diamonds for branches. Add a title with --- title: "…" ---.`,
  markdown: `Long-form markdown. Use sparingly — prefer react/html for interactivity. Use headings, lists, and tables. Every factual claim must cite the source page.`,
};

const SYSTEM_PROMPT = `You are an elite artifact author for a technical-manual assistant. You receive a SPEC describing what to build and the concrete numbers/citations extracted from the user's manual, and you output a single, complete, production-quality artifact.

YOUR OUTPUT IS THE ARTIFACT BODY AND NOTHING ELSE.
- No markdown fences, no prose, no explanation, no "Here is the…".
- First character is the first character of the code. Last character is the last.
- If asked for react, the file starts with "export default function" (or imports then the export).

QUALITY BAR
1. Visually polished. Real typography hierarchy, generous spacing, clear labels, considered color. Dark surface with orange brand accents. Looks like a shipped product.
2. Functionally complete. Every interactive control affects the output. Every computed number is labelled with its units. No placeholder TODOs, no Lorem Ipsum, no half-implemented tabs.
3. Grounded. Every number, threshold, part name, or procedure comes from the SPEC. Do NOT invent values. If the SPEC gives a range, use it. If it names a page, include the page reference in the UI (small subtle citation, mono font).
4. Self-contained. No external fetches, no images (unless SVG you generate), no fonts beyond system/tailwind defaults.

REACT-SPECIFIC RULES (these are the common failure modes — internalize them)
- Apostrophes inside single-quoted JS strings are a syntax error. Write "it's" with double quotes, or 'it\\'s' escaped. Same in JSX attribute values.
- Every JSX tag must be balanced. <div> needs </div>. <ul> needs </ul>. Components with no children MUST self-close: <Icon className="x" />, not <Icon className="x">.
- Spell every identifier the same in every reference. No "description" in one line and "deription" three lines later. Re-read every prop name and state variable before finishing.
- No raw "<" or "{" inside JSX text — escape with {"<"} and {"{"}.
- Default export is required.
- The iframe runs React 18 via sucrase (TSX→JS). Sucrase is fast but unforgiving — one stray character breaks the whole render.
- Read your output top-to-bottom before finalising. Tag stack must balance. Every brace must match. Every string must close.

INTERACTIVITY PATTERNS (when kind=react)
- Calculators: sliders + number readouts + a result panel. Show the formula. Show the manual's exact spec next to the live result.
- Troubleshooting flows: stepper with Previous/Next, current step index, branch buttons that jump to a specific step, "start over" reset.
- Configurators: dropdowns with manual-accurate options, a "build summary" panel that updates live, citations under each option.
- Charts (recharts): dark theme, orange line, labelled axes with units, hover tooltips with exact values.

NEVER
- Invent facts not in the SPEC.
- Output anything besides the artifact code.
- Wrap in markdown fences.
- Add fake placeholder text like "value here" or "// TODO".
- Use fonts or assets beyond what Tailwind/CSS defaults provide.`;

export async function generateArtifact(args: {
  kind: ArtifactKind;
  title: string;
  spec: string;
  priorCode?: string;
  errorContext?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { kind, title, spec, priorCode, errorContext } = args;

  const revisionBlock = priorCode
    ? `\n\nPRIOR VERSION (from a previous attempt — use for context, but produce a complete, new, corrected file):\n\`\`\`\n${priorCode.length > 4000 ? priorCode.slice(0, 4000) + "\n…[truncated]" : priorCode}\n\`\`\``
    : "";

  const errorBlock = errorContext
    ? `\n\nTHE PRIOR VERSION FAILED TO RENDER with this error:\n\`\`\`\n${errorContext}\n\`\`\`\nDiagnose the specific cause (syntax / typo / missing close tag / bad apostrophe) and fix it in the new version.`
    : "";

  const prompt = `Build a ${kind} artifact.

TITLE: ${title}

KIND GUIDANCE:
${KIND_GUIDE[kind]}

SPEC (from the orchestrator — what to build, and the manual numbers to embed):
---
${spec}
---${revisionBlock}${errorBlock}

Output ONLY the artifact body. No prose. No fences. No commentary. First character is code.`;

  const abort = new AbortController();
  if (args.signal) {
    args.signal.addEventListener("abort", () => abort.abort(), { once: true });
  }

  const stream = runQuery({
    prompt,
    options: {
      model: modelFor("qa.artifact"),
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: [],
      tools: [],
      permissionMode: "bypassPermissions",
      abortController: abort,
    },
  });

  const { text, error } = await collectText(stream);
  if (error) throw new Error(`artifact generation failed: ${error}`);
  if (!text) throw new Error("artifact generator returned empty output");

  return stripFences(text).trim();
}

function stripFences(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) return fence[1];
  return t;
}
