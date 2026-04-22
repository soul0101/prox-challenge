/**
 * Role-based model registry. Every LLM call in the app resolves its model
 * through `modelFor(role)` — never hardcoded — so we can tune quality/cost
 * per task from a single file (or via env).
 *
 * Pinning policy
 *   - **Ingestion** is quality-critical and one-shot. All three ingest roles
 *     run on Opus. Wrong metadata poisons every downstream retrieval.
 *   - **Q&A** is latency-sensitive. The orchestrator runs on Sonnet. Vision
 *     sub-tasks (bbox finding) run on Opus — precision matters on dense diagrams.
 *
 * Overrides (in priority order, all optional)
 *   1. `MODEL_ROLE_{ROLE}` — per-role override. The role name is uppercased
 *      and `.` is replaced with `_` (e.g. `MODEL_ROLE_QA_ORCHESTRATOR=opus`).
 *      Value may be a tier keyword (`opus`/`sonnet`/`haiku`) or a full
 *      `claude-…` model id.
 *   2. `CLAUDE_MODEL` — fleet-wide override across every role. Same value
 *      format. Use sparingly; defeats per-role segregation.
 *   3. Built-in default (below).
 */

// Current Claude model ids. Update here when model versions roll forward.
export const OPUS_MODEL = "claude-opus-4-7";
export const SONNET_MODEL = "claude-sonnet-4-6";
export const HAIKU_MODEL = "claude-haiku-4-5";

export type ModelRole =
  /** Per-page vision extraction at ingest time. */
  | "ingest.page"
  /** TOC + suggested-prompts synthesis after all pages ingest. */
  | "ingest.docmap"
  /** Vision bbox finder called during ingest (not currently wired, reserved). */
  | "ingest.locate"
  /** Main chat agent loop — the model that answers the user. */
  | "qa.orchestrator"
  /** Vision bbox finder called from `crop_region` / `show_source` during chat. */
  | "qa.locate"
  /** Dedicated artifact author — turns a spec from the orchestrator into real code. */
  | "qa.artifact"
  /** Flowchart-spec author — emits the small JSON schema consumed by the flowchart template. Much cheaper than full TSX authoring. */
  | "qa.artifact.flowchart";

const DEFAULTS: Record<ModelRole, string> = {
  "ingest.page": OPUS_MODEL,
  "ingest.docmap": OPUS_MODEL,
  "ingest.locate": OPUS_MODEL,
  "qa.orchestrator": SONNET_MODEL,
  "qa.locate": OPUS_MODEL,
  "qa.artifact": OPUS_MODEL,
  "qa.artifact.flowchart": SONNET_MODEL,
};

function resolveTier(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "opus") return OPUS_MODEL;
  if (v === "sonnet") return SONNET_MODEL;
  if (v === "haiku") return HAIKU_MODEL;
  if (v.startsWith("claude-")) return v;
  return null;
}

/**
 * Resolve a user-facing tier keyword (haiku/sonnet/opus) to a concrete
 * model id. Used by the settings UI / chat API route to override the
 * per-role default for a single request.
 */
export function modelForTier(tier: string | undefined): string | null {
  if (!tier) return null;
  return resolveTier(tier);
}

export function modelFor(role: ModelRole): string {
  const envKey = `MODEL_ROLE_${role.toUpperCase().replace(/\./g, "_")}`;
  const perRole = process.env[envKey];
  if (perRole) {
    const hit = resolveTier(perRole);
    if (hit) return hit;
  }
  const fleet = process.env.CLAUDE_MODEL;
  if (fleet) {
    const hit = resolveTier(fleet);
    if (hit) return hit;
  }
  return DEFAULTS[role];
}
