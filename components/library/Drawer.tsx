"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  FileText,
  Search,
  X,
  ArrowRight,
} from "lucide-react";
import type { ManifestEntry, DocMapSection } from "@/lib/kb/types";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/ui/motion";

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
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return manifest.map((d) => ({ doc: d, sections: d.map.sections }));
    return manifest
      .map((d) => {
        const titleMatches = d.title.toLowerCase().includes(q);
        const sections = d.map.sections.filter((s) =>
          s.title.toLowerCase().includes(q),
        );
        if (titleMatches || sections.length > 0) {
          return { doc: d, sections: titleMatches ? d.map.sections : sections };
        }
        return null;
      })
      .filter(Boolean) as { doc: ManifestEntry; sections: DocMapSection[] }[];
  }, [manifest, q]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-label="close drawer"
            className="flex-1 bg-background/40 backdrop-blur-md"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.28, ease: ease.smooth }}
            className="flex w-[420px] max-w-[92vw] flex-col glass border-l border-l-border-strong/60 shadow-pop"
          >
            <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 ring-1 ring-border-subtle text-primary">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold tracking-tight">
                    Library
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wide text-fg-dim">
                    {manifest.length} doc{manifest.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            {/* Search */}
            <div className="border-b border-border-subtle px-3 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-dim" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search documents & sections…"
                  className="h-9 w-full rounded-xl border border-border-subtle bg-surface-2/70 pl-8 pr-8 text-[13px] text-fg placeholder:text-fg-dim outline-none transition-colors focus:border-primary/60 focus:bg-surface-2"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear"
                    className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-fg-dim hover:bg-surface-3 hover:text-fg"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto scrollbar-thin">
              {manifest.length === 0 && (
                <div className="p-6 text-sm text-fg-muted">
                  No documents ingested yet. Drop files into{" "}
                  <code className="rounded bg-surface-2 px-1 font-mono">files/</code>{" "}
                  and run{" "}
                  <code className="rounded bg-surface-2 px-1 font-mono">
                    npm run ingest
                  </code>
                  .
                </div>
              )}
              {filtered.map(({ doc, sections }) => {
                const isOpen = expanded[doc.slug] ?? true;
                return (
                  <div key={doc.slug} className="border-b border-border-subtle/70">
                    <button
                      onClick={() =>
                        setExpanded((s) => ({ ...s, [doc.slug]: !isOpen }))
                      }
                      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2/60"
                    >
                      <CoverThumb slug={doc.slug} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium">
                          {doc.title}
                        </div>
                        <div className="truncate font-mono text-[10.5px] text-fg-dim">
                          {doc.page_count} pages · {doc.source_file}
                        </div>
                      </div>
                      <motion.span
                        animate={{ rotate: isOpen ? 0 : -90 }}
                        transition={{ duration: 0.2 }}
                        className="shrink-0 text-fg-dim"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && sections.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: ease.smooth }}
                          className="overflow-hidden"
                        >
                          <div className="pb-2">
                            {sections.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => onOpenPage(doc.slug, s.pages[0])}
                                className="group flex w-full items-center justify-between gap-2 px-4 py-1.5 pl-14 text-left transition-colors hover:bg-primary/5"
                              >
                                <span className="relative truncate text-[12.5px] text-fg-muted group-hover:text-fg">
                                  <span className="pointer-events-none absolute -left-4 top-1/2 inline-block h-1 w-1 -translate-y-1/2 rounded-full bg-border group-hover:bg-primary" />
                                  {s.title}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-fg-dim group-hover:text-primary">
                                  <span>
                                    p.{s.pages[0]}
                                    {s.pages[1] !== s.pages[0] && `–${s.pages[1]}`}
                                  </span>
                                  <ArrowRight className="h-3 w-3 translate-x-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                                </span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {q && filtered.length === 0 && (
                <div className="px-6 py-8 text-center text-[13px] text-fg-dim">
                  No matches for <span className="font-mono">“{query}”</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function CoverThumb({ slug }: { slug: string }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      className={cn(
        "relative grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border-subtle",
        errored ? "bg-surface-2 text-primary" : "bg-surface-1",
      )}
    >
      {!errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/sources/${slug}/p-001.png`}
          alt=""
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-background/80 to-transparent" />
    </div>
  );
}
