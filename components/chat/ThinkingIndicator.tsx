"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ToolChip } from "@/lib/client/chat-types";

const VERBS: Record<string, (c: ToolChip) => string> = {
  "mcp__manual__search": (c) => {
    const q = (c.input?.query as string) || "";
    return q ? `searching “${q.slice(0, 40)}”…` : "searching manuals…";
  },
  "mcp__manual__open_page": (c) =>
    c.input?.page ? `opening p.${c.input.page}…` : "opening page…",
  "mcp__manual__open_pages": (c) =>
    c.input?.from && c.input?.to
      ? `scanning p.${c.input.from}–${c.input.to}…`
      : "scanning pages…",
  "mcp__manual__crop_region": () => "cropping region…",
  "mcp__manual__show_source": () => "surfacing source…",
  "mcp__manual__emit_artifact": (c) => {
    const kind = (c.input?.kind as string) || "";
    return kind ? `drafting ${kind} artifact…` : "drafting artifact…";
  },
  "mcp__manual__ask_user": () => "forming a question…",
  "mcp__manual__list_documents": () => "checking library…",
};

function describe(chips: ToolChip[]): string {
  // Latest running chip wins.
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i];
    if (c.status === "running" && VERBS[c.name]) return VERBS[c.name](c);
  }
  return "thinking…";
}

/** Three-dot pulse + rotating verb description for the in-flight assistant
 *  turn. Pulls context from the latest running tool chip. */
export function ThinkingIndicator({ chips }: { chips: ToolChip[] }) {
  const verb = describe(chips);
  const [display, setDisplay] = useState(verb);

  // Debounce rapid verb changes so the label doesn't flicker.
  useEffect(() => {
    const t = setTimeout(() => setDisplay(verb), 140);
    return () => clearTimeout(t);
  }, [verb]);

  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-primary"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.14,
            }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={display}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.18 }}
          className="text-[12.5px] text-fg-dim"
        >
          {display}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
