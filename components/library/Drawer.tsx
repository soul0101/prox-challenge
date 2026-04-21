"use client";
import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, FileText, X } from "lucide-react";
import type { ManifestEntry } from "@/lib/kb/types";

export function LibraryDrawer({
  manifest,
  open,
  onClose,
  onOpenPage,
}: {
  manifest: ManifestEntry[];
  open: boolean;
  onClose: () => void;
  onOpenPage: (doc: string, page: number) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        onClick={onClose}
        aria-label="close drawer"
        className="flex-1 bg-background/40 backdrop-blur-sm"
      />
      <div className="w-[360px] border-l border-border bg-card shadow-xl flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <div className="text-sm font-medium">Library</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="flex-1 overflow-auto scrollbar-thin">
          {manifest.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No documents ingested yet. Drop files into <code className="px-1 rounded bg-secondary">files/</code>{" "}
              and run <code className="px-1 rounded bg-secondary">npm run ingest</code>.
            </div>
          )}
          {manifest.map((d) => {
            const isOpen = expanded[d.slug] ?? true;
            return (
              <div key={d.slug} className="border-b border-border/60">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [d.slug]: !isOpen }))}
                  className="flex w-full items-center gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <FileText className="h-4 w-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.page_count} pages · {d.source_file}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {d.map.sections.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => onOpenPage(d.slug, s.pages[0])}
                        className="flex w-full items-center justify-between px-6 py-1.5 hover:bg-secondary/50 transition-colors text-left"
                      >
                        <span className="text-xs truncate">{s.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                          p.{s.pages[0]}–{s.pages[1]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
