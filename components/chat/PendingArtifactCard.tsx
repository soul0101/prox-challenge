"use client";
import { Sparkles, Loader2, Code2, Workflow, Shapes, FileCode, FileText } from "lucide-react";
import type { ToolChip } from "@/lib/client/chat-types";

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  react: Code2,
  html: FileCode,
  svg: Shapes,
  mermaid: Workflow,
  markdown: FileText,
};

const KIND_LABEL: Record<string, string> = {
  react: "Interactive component",
  html: "HTML artifact",
  svg: "SVG diagram",
  mermaid: "Flowchart",
  markdown: "Markdown",
};

/** Skeleton card shown while Claude is still streaming an artifact's code.
 *  Replaces itself with the real ArtifactCard once the tool call completes. */
export function PendingArtifactCard({ chip }: { chip: ToolChip }) {
  const kind = (chip.input?.kind as string) || "";
  const title = (chip.input?.title as string) || "";
  const Icon = KIND_ICON[kind] || Sparkles;
  const kindLabel = KIND_LABEL[kind] || "Artifact";

  return (
    <div className="group w-full max-w-md overflow-hidden rounded-xl border border-primary/30 bg-primary/5 animate-fade-in">
      <div className="flex items-stretch gap-3 p-2.5">
        <div className="relative grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
          <div className="absolute inset-0 shimmer opacity-30" aria-hidden />
          <Icon className="relative h-5 w-5 opacity-90" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-sm font-medium">
              {title || `Generating ${kindLabel.toLowerCase()}…`}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {kind
              ? `Streaming ${kindLabel.toLowerCase()} — renders as soon as the code finishes.`
              : "Claude is choosing an artifact type…"}
          </div>
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-4/5 shimmer rounded" aria-hidden />
            <div className="h-1.5 w-3/5 shimmer rounded" aria-hidden />
            <div className="h-1.5 w-2/3 shimmer rounded" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
