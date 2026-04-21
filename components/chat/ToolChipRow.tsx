"use client";
import { Loader2, Check, Search, FileText, Crop, Image as ImageIcon, Sparkles, HelpCircle, Layers } from "lucide-react";
import type { ToolChip } from "@/lib/client/chat-types";

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
  "mcp__manual__search": "search",
  "mcp__manual__open_page": "open page",
  "mcp__manual__open_pages": "open pages",
  "mcp__manual__crop_region": "crop region",
  "mcp__manual__show_source": "show source",
  "mcp__manual__emit_artifact": "draw",
  "mcp__manual__ask_user": "ask",
  "mcp__manual__list_documents": "list docs",
};

function detail(chip: ToolChip): string | null {
  const i = chip.input || {};
  if (chip.name.endsWith("search")) return (i.query as string)?.slice(0, 60) || null;
  if (chip.name.endsWith("open_page")) return i.page ? `p.${i.page}` : null;
  if (chip.name.endsWith("open_pages")) return i.from && i.to ? `p.${i.from}–${i.to}` : null;
  if (chip.name.endsWith("crop_region")) return (i.description as string)?.slice(0, 40) || null;
  if (chip.name.endsWith("show_source")) return i.page ? `p.${i.page}` : null;
  if (chip.name.endsWith("emit_artifact")) return (i.title as string)?.slice(0, 40) || null;
  if (chip.name.endsWith("ask_user")) return "clarifying question";
  return null;
}

export function ToolChipRow({ chips }: { chips: ToolChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
      {chips.map((c) => {
        const Icon = ICONS[c.name] || Sparkles;
        const d = detail(c);
        return (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-secondary-foreground animate-fade-in"
          >
            <Icon className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{LABEL[c.name] || c.name.replace(/^mcp__manual__/, "")}</span>
            {d && <span className="text-muted-foreground truncate max-w-[160px]">· {d}</span>}
            {c.status === "running" ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <Check className="h-3 w-3 text-emerald-400" />
            )}
          </span>
        );
      })}
    </div>
  );
}
