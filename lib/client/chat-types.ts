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
  bbox?: [number, number, number, number];
};

export type ArtifactAttachment = {
  id: string;
  kind: "react" | "html" | "svg" | "mermaid" | "markdown";
  title: string;
  code: string;
};

export type AskBlock = {
  question: string;
  options: { id: string; label: string; detail?: string }[];
  allow_free_text: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolChips: ToolChip[];
  sources: SourceAttachment[];
  artifacts: ArtifactAttachment[];
  ask?: AskBlock;
  streaming?: boolean;
};
