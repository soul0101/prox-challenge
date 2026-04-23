export type ToolChip = {
  id: string;
  name: string;
  status: "running" | "done";
  summary?: string;
  input?: Record<string, unknown>;
};

export type SourceAttachment = {
  doc: string;
  doc_title: string;
  page: number;
  url: string;
  caption?: string;
  cropUrl?: string;
  /** [x, y, w, h] in rendered-page pixel coords for the highlight overlay */
  bbox?: [number, number, number, number];
};

export type ArtifactVersion = {
  /** unique id for this specific version */
  id: string;
  kind: "react" | "html" | "svg" | "mermaid" | "markdown" | "flowchart" | "procedure" | "image-labeling";
  title: string;
  code: string;
  /** v1, v2, … */
  version: number;
  /** optional one-line note about what changed */
  note?: string;
  /** epoch ms */
  ts: number;
};

export type ArtifactAttachment = {
  /** stable group id — versions of "the same artifact" share this */
  group_id: string;
  /** the version currently being referenced from the chat (latest at the time of render) */
  current_version: number;
  versions: ArtifactVersion[];
};

/** Convenience: the active version of an artifact attachment. */
export function activeVersion(a: ArtifactAttachment): ArtifactVersion {
  return a.versions.find((v) => v.version === a.current_version) || a.versions[a.versions.length - 1];
}

export type AskBlock = {
  question: string;
  options: { id: string; label: string; detail?: string }[];
  allow_free_text: boolean;
};

/**
 * Image the user attached to their message. `src` is either a base64 data URL
 * (live upload) or a public file path (demo messages) — in both cases it can
 * be rendered directly in an `<img>` tag. The server strips data-URL prefixes
 * before forwarding to Claude as a base64 image block; public paths are sent
 * as URL image sources.
 */
export type ImageAttachment = {
  id: string;
  src: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  name?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolChips: ToolChip[];
  sources: SourceAttachment[];
  /** group_ids of artifacts that first appeared in this turn — actual data
   *  lives in ChatPanel's artifactsByGroup map (so re-emits as v2 update in place) */
  artifactGroups: string[];
  /** Images the user attached to this turn (user messages only). */
  attachments?: ImageAttachment[];
  ask?: AskBlock;
  streaming?: boolean;
};
