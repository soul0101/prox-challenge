import { z } from "zod";

/**
 * Declarative schema for the "image-labeling" artifact kind.
 *
 * A single image with numbered pin annotations. The agent emits the image
 * URL (typically a manual page or figure crop at /sources/{slug}/p-NNN.png)
 * plus an ordered list of labels — each positioned as a percentage of the
 * image's width/height so the renderer can overlay pins responsively. The
 * bottom panel shows each label's description; hovering a description or pin
 * highlights the counterpart.
 *
 * Same schema-driven pattern as flowchart/procedure: the UI lives in the
 * shared iframe template, the agent only writes JSON.
 */

const LabelSchema = z.object({
  /** Short stable id ("drive_roller", "label_1"). Used internally by the renderer. */
  id: z.string().min(1),
  /** Horizontal pin position as a percentage (0–100) of the image width. */
  x: z.number().min(0).max(100),
  /** Vertical pin position as a percentage (0–100) of the image height. */
  y: z.number().min(0).max(100),
  /** Short label shown in the pin tooltip and the description list ("Drive roller"). */
  title: z.string().min(1),
  /** Longer explanation from the manual — 1–3 sentences about what the part is / does. */
  description: z.string().min(1),
  /** Optional page chip rendered on the description card ("p.15"). */
  citation: z.string().optional(),
});

export const ImageLabelingSpecSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  /** URL of the primary image. Usually "/sources/{slug}/p-NNN.png". */
  imageUrl: z.string().min(1),
  /** Alt text for the image — required for accessibility. */
  imageAlt: z.string().min(1),
  /** Ordered array of pinned labels. 1–20 is a good range; enforce >= 1. */
  labels: z.array(LabelSchema).min(1),
  /** Optional top-level citations shown in the footer. */
  citations: z.array(z.string()).optional(),
});

export type ImageLabel = z.infer<typeof LabelSchema>;
export type ImageLabelingSpec = z.infer<typeof ImageLabelingSpecSchema>;

export type ImageLabelingValidationResult =
  | { ok: true; spec: ImageLabelingSpec }
  | { ok: false; error: string };

/**
 * Parse and validate an image-labeling JSON string. Enforces schema shape
 * plus id uniqueness so the renderer can use ids as React keys safely.
 */
export function parseImageLabeling(raw: string): ImageLabelingValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${(err as Error).message}` };
  }

  const parsed = ImageLabelingSpecSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".") || "(root)";
    return { ok: false, error: `schema error at ${path}: ${first?.message}` };
  }

  const spec = parsed.data;
  const seen = new Set<string>();
  for (const [i, label] of spec.labels.entries()) {
    if (seen.has(label.id)) {
      return { ok: false, error: `labels[${i}].id "${label.id}" is duplicated` };
    }
    seen.add(label.id);
  }

  return { ok: true, spec };
}
