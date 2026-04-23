"use client";
import { motion } from "framer-motion";
import { Crop } from "lucide-react";
import type { SourceAttachment } from "@/lib/client/chat-types";
import { cn } from "@/lib/utils";

/**
 * Horizontal row of manual-page cards under the assistant's prose. Every
 * cited page is visible at once (unlike a carousel), so a reviewer can glance
 * across all the evidence in one eye-scan. The row scrolls sideways with
 * scroll-snap when it overflows the chat column.
 *
 * Crop handling:
 * - If the agent surfaced a cropped region (`cropUrl` + `bbox` on the
 *   attachment), the card's thumbnail is the CROP — showing exactly the cell
 *   / dial / row the agent wanted to flag. A "region" badge signals that the
 *   thumbnail is a detail, not the full page.
 * - If there's no crop, the thumbnail is the full page image.
 * - Either way, clicking the card opens the FULL page in the right pane
 *   (SourceViewer) with the bbox highlight overlay (if any) rendered on top
 *   of the page. The card shows the detail, the pane gives it context.
 */
export function SourceStrip({
  sources,
  onOpen,
}: {
  sources: SourceAttachment[];
  onOpen: (source: SourceAttachment) => void;
}) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2.5 -mx-1 overflow-x-auto scrollbar-thin">
      <div className="flex snap-x snap-mandatory gap-2 px-1 pb-1">
        {sources.map((source, i) => (
          <SourceCardSmall
            key={`${i}:${source.doc}:${source.page}:${source.cropUrl || ""}`}
            source={source}
            onOpen={() => onOpen(source)}
          />
        ))}
      </div>
    </div>
  );
}

function SourceCardSmall({
  source,
  onOpen,
}: {
  source: SourceAttachment;
  onOpen: () => void;
}) {
  const hasCrop = !!source.cropUrl;
  const displayUrl = source.cropUrl || source.url;
  return (
    <motion.button
      onClick={onOpen}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18 }}
      title={source.caption || `${source.doc_title} p.${source.page}`}
      className={cn(
        "group relative flex w-[188px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border text-left transition-all",
        hasCrop
          ? "border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-500/60 hover:bg-amber-500/[0.08]"
          : "border-border-subtle bg-surface-1/70 hover:border-primary/50 hover:bg-surface-2/70",
      )}
    >
      {/* Thumbnail: crop if one exists, else the full page */}
      <div className="relative h-[188px] w-full overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayUrl}
          alt={source.caption || `${source.doc_title} p.${source.page}`}
          className="block h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />

        {/* Page chip, top-left */}
        <div className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-border-subtle bg-background/75 px-1.5 py-0.5 font-mono text-[10px] backdrop-blur">
          <span className="text-primary">p.{source.page}</span>
        </div>

        {/* Crop badge, top-right — only when the agent flagged a specific region */}
        {hasCrop && (
          <div className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-md border border-amber-400/55 bg-amber-400/15 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-amber-200 backdrop-blur">
            <Crop className="h-2.5 w-2.5" />
            region
          </div>
        )}
      </div>

      {/* Card footer: doc title + caption */}
      <div className="min-h-[54px] px-2 pb-2 pt-1.5">
        <div className="truncate font-mono text-[9.5px] uppercase tracking-wide text-fg-dim">
          {source.doc_title}
        </div>
        {source.caption && (
          <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-fg-muted">
            {source.caption}
          </div>
        )}
      </div>
    </motion.button>
  );
}
