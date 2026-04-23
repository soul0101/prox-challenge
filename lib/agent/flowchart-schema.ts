import { z } from "zod";

/**
 * Declarative schema for the "flowchart" artifact kind.
 *
 * The agent emits a small JSON document matching this schema; the frontend
 * runner (`public/artifact-runner.html`) renders it with a shared React
 * template — interactive stepper + collapsible full-flow overview — so we
 * don't re-author the same ~300 lines of stepper TSX on every emission.
 *
 * If a decision tree doesn't fit this schema (e.g. needs in-line calculators,
 * charts, or non-tree navigation), the agent falls back to kind="react" and
 * hand-authors bespoke code.
 */

const BranchSchema = z.object({
  /** What the user clicks. Usually a short condition: "Yes", "Arc is unstable", "Gas ≥ 20 CFH". */
  label: z.string().min(1),
  /** Target node id. Must exist in `nodes`. */
  next: z.string().min(1),
  /** Optional longer hint shown under the button. */
  detail: z.string().optional(),
});

const BaseNode = {
  /** Short, bold — framed as a question (for kind=question) or a headline (for action/terminal). */
  title: z.string().min(1),
  /** Optional body copy with procedure detail / context from the manual. */
  detail: z.string().optional(),
  /** Page citation from the manual, rendered inline (e.g. "p.42" or "Quick Start p.12"). */
  citation: z.string().optional(),
  /** Surface a safety warning as a callout on this node. */
  warning: z.string().optional(),
};

const QuestionNodeSchema = z.object({
  kind: z.literal("question"),
  ...BaseNode,
  branches: z.array(BranchSchema).min(2),
});

const ActionNodeSchema = z.object({
  kind: z.literal("action"),
  ...BaseNode,
  /** Next node id to advance to after the user acknowledges the action. */
  next: z.string().min(1),
});

const TerminalNodeSchema = z.object({
  kind: z.literal("terminal"),
  ...BaseNode,
  /** Optional resolution tag — "Fixed", "Call support", "Replace part". */
  outcome: z.string().optional(),
});

export const FlowNodeSchema = z.discriminatedUnion("kind", [
  QuestionNodeSchema,
  ActionNodeSchema,
  TerminalNodeSchema,
]);

export const FlowchartSpecSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  /** id of the node the user sees first */
  start: z.string().min(1),
  /** map of node id → node */
  nodes: z.record(z.string(), FlowNodeSchema),
  /** optional top-level citations shown in the footer ("sourced from p.42, p.58") */
  citations: z.array(z.string()).optional(),
});

export type Branch = z.infer<typeof BranchSchema>;
export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowchartSpec = z.infer<typeof FlowchartSpecSchema>;

export type FlowchartValidationResult =
  | { ok: true; spec: FlowchartSpec }
  | { ok: false; error: string };

/**
 * Parse and validate a flowchart JSON string. Returns a structured result so
 * the caller can decide whether to retry, fall back, or surface the error.
 *
 * Beyond schema shape this also enforces referential integrity:
 *   - `start` must point to a real node
 *   - every branch/action `next` must point to a real node
 */
export function parseFlowchart(raw: string): FlowchartValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${(err as Error).message}` };
  }

  const parsed = FlowchartSpecSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".") || "(root)";
    return { ok: false, error: `schema error at ${path}: ${first?.message}` };
  }

  const spec = parsed.data;
  const ids = new Set(Object.keys(spec.nodes));
  if (!ids.has(spec.start)) {
    return { ok: false, error: `start node "${spec.start}" is not defined in nodes` };
  }

  for (const [id, node] of Object.entries(spec.nodes)) {
    if (node.kind === "question") {
      for (const [i, b] of node.branches.entries()) {
        if (!ids.has(b.next)) {
          return {
            ok: false,
            error: `node "${id}" branch[${i}] -> "${b.next}" is not defined`,
          };
        }
      }
    } else if (node.kind === "action") {
      if (!ids.has(node.next)) {
        return {
          ok: false,
          error: `node "${id}" next -> "${node.next}" is not defined`,
        };
      }
    }
  }

  return { ok: true, spec };
}
