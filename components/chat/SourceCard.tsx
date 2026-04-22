"use client";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { SourceAttachment } from "@/lib/client/chat-types";

export function SourceCard({
  source,
  onOpen,
}: {
  source: SourceAttachment;
  onOpen: (doc: string, page: number) => void;
}) {
  const displayUrl = source.cropUrl || source.url;
  return (
    <motion.button
      onClick={() => onOpen(source.doc, source.page)}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="group flex max-w-md flex-col items-start gap-1.5 rounded-2xl border border-border-subtle bg-surface-1/70 p-2 pr-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-2/70"
    >
      <div className="relative w-full overflow-hidden rounded-lg border border-border-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayUrl}
          alt={source.caption || `${source.doc_title} p.${source.page}`}
          className="block w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.025]"
          loading="lazy"
        />
        <div className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md border border-border-subtle bg-background/70 px-1.5 py-0.5 font-mono text-[10px] backdrop-blur">
          <span className="truncate max-w-[180px]">{source.doc_title}</span>
          <span className="text-fg-dim">·</span>
          <span className="text-primary">p.{source.page}</span>
        </div>
      </div>
      {source.caption && (
        <span className="px-1 text-[11.5px] leading-snug text-fg-muted">
          {source.caption}
        </span>
      )}
      <span className="flex items-center gap-1 px-1 text-[10.5px] text-fg-dim transition-colors group-hover:text-primary">
        <ExternalLink className="h-3 w-3" />
        open in source viewer
      </span>
    </motion.button>
  );
}
