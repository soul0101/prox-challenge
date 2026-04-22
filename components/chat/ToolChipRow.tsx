"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Check,
  Search,
  FileText,
  Crop,
  Image as ImageIcon,
  Sparkles,
  HelpCircle,
  Layers,
  Code2,
  Workflow,
  Shapes,
  FileCode,
} from "lucide-react";
import type { ToolChip } from "@/lib/client/chat-types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "mcp__manual__search": Search,
  "mcp__manual__open_page": FileText,
  "mcp__manual__open_pages": Layers,
  "mcp__manual__crop_region": Crop,
  "mcp__manual__show_source": ImageIcon,
  "mcp__manual__emit_artifact": Sparkles,
  "mcp__manual__ask_user": HelpCircle,
  "mcp__manual__list_documents": FileText,
};

const LABEL: Record<string, string> = {
  "mcp__manual__search": "Searching",
  "mcp__manual__open_page": "Opening page",
  "mcp__manual__open_pages": "Opening pages",
  "mcp__manual__crop_region": "Cropping region",
  "mcp__manual__show_source": "Surfacing source",
  "mcp__manual__emit_artifact": "Generating artifact",
  "mcp__manual__ask_user": "Asking",
  "mcp__manual__list_documents": "Listing documents",
};

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  react: Code2,
  html: FileCode,
  svg: Shapes,
  mermaid: Workflow,
  markdown: FileText,
};

const KIND_LABEL: Record<string, string> = {
  react: "interactive React component",
  html: "HTML artifact",
  svg: "SVG diagram",
  mermaid: "flowchart",
  markdown: "markdown",
};

function chipLabel(chip: ToolChip): {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  const baseIcon = ICONS[chip.name] || Sparkles;
  const baseLabel = LABEL[chip.name] || chip.name.replace(/^mcp__manual__/, "");
  if (chip.name.endsWith("emit_artifact")) {
    const kind = (chip.input?.kind as string) || "";
    if (kind && KIND_LABEL[kind]) {
      return {
        label: (chip.status === "running" ? "Generating " : "Drew ") + KIND_LABEL[kind],
        Icon: KIND_ICON[kind] || baseIcon,
      };
    }
  }
  return { label: baseLabel, Icon: baseIcon };
}

function detail(chip: ToolChip): string | null {
  const i = chip.input || {};
  if (chip.name.endsWith("search")) return (i.query as string)?.slice(0, 60) || null;
  if (chip.name.endsWith("open_page")) return i.page ? `p.${i.page}` : null;
  if (chip.name.endsWith("open_pages"))
    return i.from && i.to ? `p.${i.from}–${i.to}` : null;
  if (chip.name.endsWith("crop_region"))
    return (i.description as string)?.slice(0, 40) || null;
  if (chip.name.endsWith("show_source")) return i.page ? `p.${i.page}` : null;
  if (chip.name.endsWith("emit_artifact"))
    return (i.title as string)?.slice(0, 40) || null;
  if (chip.name.endsWith("ask_user")) return "clarifying question";
  return null;
}

export function ToolChipRow({ chips }: { chips: ToolChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      <AnimatePresence initial={false}>
        {chips.map((c) => {
          const { label, Icon } = chipLabel(c);
          const d = detail(c);
          const isArtifact = c.name.endsWith("emit_artifact");
          const running = c.status === "running";
          return (
            <motion.span
              key={c.id}
              layout
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-[11px]",
                running && isArtifact
                  ? "border-primary/40 bg-primary/10"
                  : running
                    ? "border-border-subtle bg-surface-2/80"
                    : "border-border-subtle bg-surface-1/70",
              )}
              title={d ? `${label} · ${d}` : label}
            >
              {running && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-primary/80"
                />
              )}
              <Icon
                className={cn(
                  "h-3 w-3",
                  running
                    ? isArtifact
                      ? "text-primary"
                      : "text-fg-muted"
                    : "text-fg-dim",
                )}
              />
              <span className={cn("font-medium", running ? "text-fg" : "text-fg-muted")}>
                {label}
              </span>
              {d && (
                <span className="max-w-[220px] truncate font-mono text-fg-dim">
                  · {d}
                </span>
              )}
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin text-fg-dim" />
              ) : (
                <span className="relative inline-flex">
                  <Check className="h-3 w-3 text-emerald-400" />
                </span>
              )}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
