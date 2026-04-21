"use client";
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
    <button
      onClick={() => onOpen(source.doc, source.page)}
      className="group flex flex-col items-start gap-1.5 rounded-xl border border-border bg-card p-2 pr-3 hover:border-primary/50 transition-colors max-w-md text-left"
    >
      <div className="relative w-full overflow-hidden rounded-md border border-border">
        <img
          src={displayUrl}
          alt={source.caption || `${source.doc_title} p.${source.page}`}
          className="w-full h-auto object-contain"
          loading="lazy"
        />
        <div className="absolute top-1.5 right-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
          {source.doc_title} · p.{source.page}
        </div>
      </div>
      {source.caption && (
        <span className="text-xs text-muted-foreground px-1 leading-snug">{source.caption}</span>
      )}
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground/80 group-hover:text-foreground px-1">
        <ExternalLink className="h-3 w-3" />
        open in source viewer
      </span>
    </button>
  );
}
