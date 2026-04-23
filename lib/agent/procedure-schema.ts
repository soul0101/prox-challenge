import { z } from "zod";

/**
 * Declarative schema for the "procedure" artifact kind.
 *
 * A procedure is a linear, click-through step-by-step guide: each step has a
 * title, a markdown body, an optional image (typically a full page or figure
 * crop from the ingested manual), and an optional safety warning. The agent
 * emits this JSON; a shared React template in public/artifact-runner.html
 * renders the stepper UI with Next/Previous navigation.
 */

const StepSchema = z.object({
  /** Short imperative heading. "Mount the Spool", "Thread the Wire". */
  title: z.string().min(1),
  /**
   * Body content in GitHub-flavoured markdown. Can include sub-lists, bold,
   * inline code, tables. Rendered via marked in the iframe.
   */
  markdown: z.string().min(1),
  /**
   * Optional image URL. Usually a full page image from the ingested manual:
   *   /sources/{slug}/p-NNN.png
   * May also be any other absolute or root-relative URL.
   */
  imageUrl: z.string().optional(),
  /** Optional one-line caption rendered under the image. */
  imageCaption: z.string().optional(),
  /** Page citation chip ("p.10", "Quick Start p.3"). */
  citation: z.string().optional(),
  /** Surfaces a safety warning as a callout on this step. */
  warning: z.string().optional(),
});

export const ProcedureSpecSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  steps: z.array(StepSchema).min(1),
  /** Optional top-level citations shown in the footer. */
  citations: z.array(z.string()).optional(),
});

export type ProcedureStep = z.infer<typeof StepSchema>;
export type ProcedureSpec = z.infer<typeof ProcedureSpecSchema>;

export type ProcedureValidationResult =
  | { ok: true; spec: ProcedureSpec }
  | { ok: false; error: string };

export function parseProcedure(raw: string): ProcedureValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${(err as Error).message}` };
  }

  const parsed = ProcedureSpecSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".") || "(root)";
    return { ok: false, error: `schema error at ${path}: ${first?.message}` };
  }

  return { ok: true, spec: parsed.data };
}
