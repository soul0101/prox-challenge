"use client";
import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { ManifestEntry } from "@/lib/kb/types";

export function SourceViewer({
  manifest,
  open,
  activeDoc,
  activePage,
  onClose,
  onNavigate,
}: {
  manifest: ManifestEntry[];
  open: boolean;
  activeDoc: string | null;
  activePage: number | null;
  onClose: () => void;
  onNavigate: (doc: string, page: number) => void;
}) {
  const entry = manifest.find((d) => d.slug === activeDoc) || null;
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => setImgLoaded(false), [activeDoc, activePage]);

  if (!open || !entry || !activePage) return null;

  const pageCount = entry.page_count;
  const canPrev = activePage > 1;
  const canNext = activePage < pageCount;

  const section = entry.map.sections.find(
    (s) => activePage >= s.pages[0] && activePage <= s.pages[1],
  );

  return (
    <aside className="flex h-full flex-col border-l border-border bg-background/90">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{entry.title}</div>
            <div className="text-[10px] text-muted-foreground">
              p.{activePage} of {pageCount}
              {section && <> · {section.title}</>}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-xs">
        <button
          onClick={() => canPrev && onNavigate(entry.slug, activePage - 1)}
          disabled={!canPrev}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-secondary disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> prev
        </button>
        <input
          type="number"
          min={1}
          max={pageCount}
          value={activePage}
          onChange={(e) => {
            const n = Math.max(1, Math.min(pageCount, Number(e.target.value || 1)));
            onNavigate(entry.slug, n);
          }}
          className="w-14 rounded border border-border bg-secondary px-1.5 py-0.5 text-center"
        />
        <button
          onClick={() => canNext && onNavigate(entry.slug, activePage + 1)}
          disabled={!canNext}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-secondary disabled:opacity-40"
        >
          next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin bg-zinc-950/40 p-2">
        <div className="mx-auto max-w-full">
          {!imgLoaded && (
            <div className="h-96 w-full shimmer rounded-md" aria-hidden />
          )}
          <img
            key={`${activeDoc}-${activePage}`}
            src={`/sources/${activeDoc}/p-${String(activePage).padStart(3, "0")}.png`}
            alt={`${entry.title} p.${activePage}`}
            onLoad={() => setImgLoaded(true)}
            className="w-full h-auto rounded-md border border-border shadow-lg"
            style={{ display: imgLoaded ? undefined : "none" }}
          />
        </div>
      </div>
    </aside>
  );
}
