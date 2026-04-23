"use client";
import { motion } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Code2,
  Workflow,
  Shapes,
  FileCode,
  FileText,
  ListChecks,
  Tag,
} from "lucide-react";
import type { ToolChip } from "@/lib/client/chat-types";

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  react: Code2,
  html: FileCode,
  svg: Shapes,
  mermaid: Workflow,
  markdown: FileText,
  flowchart: Workflow,
  procedure: ListChecks,
  "image-labeling": Tag,
};

const KIND_LABEL: Record<string, string> = {
  react: "Interactive component",
  html: "HTML artifact",
  svg: "SVG diagram",
  mermaid: "Flowchart",
  markdown: "Markdown",
  flowchart: "Interactive flow",
  procedure: "Step-by-step guide",
  "image-labeling": "Labelled diagram",
};

/** Skeleton card shown while Claude is still streaming an artifact's code.
 *  Replaces itself with the real ArtifactCard once the tool call completes. */
export function PendingArtifactCard({ chip }: { chip: ToolChip }) {
  const kind = (chip.input?.kind as string) || "";
  const title = (chip.input?.title as string) || "";
  const Icon = KIND_ICON[kind] || Sparkles;
  const kindLabel = KIND_LABEL[kind] || "Artifact";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="relative w-full max-w-md overflow-hidden rounded-2xl border border-primary/30 bg-surface-1/70 shimmer-diagonal"
    >
      {/* Preview placeholder */}
      <div className="relative h-28 w-full overflow-hidden border-b border-border-subtle bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-background/70 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-primary backdrop-blur">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          generating
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="text-primary/85"
          >
            <Icon className="h-8 w-8" />
          </motion.div>
        </div>
      </div>

      {/* Body */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-fg">
            {title || `Drafting ${kindLabel.toLowerCase()}…`}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-fg-dim">
            {kind ? `streaming ${kindLabel.toLowerCase()}…` : "picking an artifact type…"}
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-1.5 w-4/5 rounded-full bg-surface-3/80 shimmer" aria-hidden />
            <div className="h-1.5 w-3/5 rounded-full bg-surface-3/80 shimmer" aria-hidden />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
