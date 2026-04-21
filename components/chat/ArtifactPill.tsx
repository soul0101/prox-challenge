"use client";
import { Code, Sparkles, ArrowRight } from "lucide-react";
import type { ArtifactAttachment } from "@/lib/client/chat-types";

const KIND_LABEL: Record<string, string> = {
  react: "Interactive component",
  html: "HTML artifact",
  svg: "SVG diagram",
  mermaid: "Flowchart",
  markdown: "Markdown",
};

export function ArtifactPill({
  artifact,
  active,
  onOpen,
}: {
  artifact: ArtifactAttachment;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={
        "group w-full max-w-md flex items-center gap-3 rounded-xl border p-2.5 transition-colors text-left " +
        (active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/60")
      }
    >
      <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{artifact.title}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
          <Code className="h-3 w-3" />
          <span>{KIND_LABEL[artifact.kind] || artifact.kind}</span>
          <span>·</span>
          <span>{artifact.code.length.toLocaleString()} chars</span>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
    </button>
  );
}
