/**
 * Central registry of Claude models used across the app. Pinned to current
 * Claude 4.x IDs; override the runtime model via the `CLAUDE_MODEL` env var.
 */

export const SONNET_MODEL = "claude-sonnet-4-5"; // default runtime + ingest model
export const OPUS_MODEL = "claude-opus-4-5"; // heavy-lift alternative via env
export const HAIKU_MODEL = "claude-haiku-4-5"; // reserved for cheap metadata calls

export function runtimeModel(): string {
  const env = (process.env.CLAUDE_MODEL || "").trim().toLowerCase();
  if (env === "opus") return OPUS_MODEL;
  if (env === "sonnet") return SONNET_MODEL;
  if (env === "haiku") return HAIKU_MODEL;
  if (env.startsWith("claude-")) return env;
  return SONNET_MODEL;
}

export function ingestModel(): string {
  // Vision pass on every page: Sonnet is the right balance of accuracy + cost.
  const env = (process.env.INGEST_MODEL || "").trim().toLowerCase();
  if (env === "opus") return OPUS_MODEL;
  if (env === "sonnet") return SONNET_MODEL;
  if (env === "haiku") return HAIKU_MODEL;
  if (env.startsWith("claude-")) return env;
  return SONNET_MODEL;
}
