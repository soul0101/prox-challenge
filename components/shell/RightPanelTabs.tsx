"use client";
import { motion } from "framer-motion";
import {
  X,
  FileText,
  Code2,
  FileCode,
  Shapes,
  Workflow,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stable descriptor for one open tab in the right panel. Each tab is either
 * an artifact (many allowed, one per group_id) or a source doc page
 * (singleton — opening a new page replaces the existing source tab).
 */
export type RightTabDescriptor = {
  key: string;
  kind: "artifact" | "source";
  label: string;
  sublabel?: string | null;
  /** Present for artifact tabs so we can show the kind-specific glyph. */
  artifactKind?: string;
};

const ARTIFACT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  react: Code2,
  html: FileCode,
  svg: Shapes,
  mermaid: Workflow,
  markdown: FileText,
  flowchart: Workflow,
  procedure: ListChecks,
};

function iconFor(t: RightTabDescriptor): React.ComponentType<{ className?: string }> {
  if (t.kind === "source") return FileText;
  return (t.artifactKind && ARTIFACT_ICON[t.artifactKind]) || Sparkles;
}

/**
 * Horizontal tab strip at the top of the right panel. One tab per open
 * artifact, plus at most one source tab. Clicking activates; × closes the
 * tab (without deleting the artifact itself); middle-click also closes.
 */
export function RightPanelTabs({
  tabs,
  activeKey,
  onSelect,
  onClose,
}: {
  tabs: RightTabDescriptor[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div
      role="tablist"
      aria-label="Open artifacts and sources"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-subtle bg-surface-1/70 px-2 py-1.5 scrollbar-thin backdrop-blur-md"
    >
      {tabs.map((t) => {
        const Icon = iconFor(t);
        const isActive = t.key === activeKey;
        return (
          <motion.div
            key={t.key}
            layout
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(t.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(t.key);
              }
              if (e.key === "w" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onClose(t.key);
              }
            }}
            onMouseDown={(e) => {
              // Middle-click closes, matching browser-tab muscle memory.
              if (e.button === 1) {
                e.preventDefault();
                onClose(t.key);
              }
            }}
            className={cn(
              "group relative inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-lg border px-2 py-1 outline-none transition-colors",
              "min-w-0 max-w-[220px] focus-visible:ring-2 focus-visible:ring-primary/60",
              isActive
                ? "border-primary/50 bg-primary/10 text-fg"
                : "border-border-subtle bg-surface-2/50 text-fg-muted hover:bg-surface-3/60 hover:text-fg",
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isActive ? "text-primary" : "text-fg-dim",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-medium">{t.label}</div>
              {t.sublabel && (
                <div className="truncate font-mono text-[10px] text-fg-dim">
                  {t.sublabel}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.key);
              }}
              aria-label={`Close ${t.label}`}
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded-md text-fg-dim transition-colors",
                "hover:bg-surface-3 hover:text-fg",
                // Keep the close button visible for the active tab so users
                // always have an obvious way out; tuck it away for others.
                isActive
                  ? "opacity-80"
                  : "opacity-0 group-hover:opacity-80 focus-visible:opacity-100",
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
