"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Keyboard,
} from "lucide-react";
import type { ManifestEntry } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

interface Props {
  manifest: ManifestEntry[];
  open: boolean;
  activeDoc: string | null;
  activePage: number | null;
  highlightBbox?: [number, number, number, number] | null;
  onClose: () => void;
  onNavigate: (doc: string, page: number) => void;
}

export function SourceViewer({
  manifest,
  open,
  activeDoc,
  activePage,
  highlightBbox,
  onClose,
  onNavigate,
}: Props) {
  const entry = manifest.find((d) => d.slug === activeDoc) || null;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hintSeen, setHintSeen] = useState(true);
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setImgLoaded(false);
    setNaturalSize(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [activeDoc, activePage]);

  // Safety net: React's onLoad doesn't fire when an <img> mounts with a
  // src that's already in the browser cache. When the panel remounts after
  // switching views, the PNG is cached → no onLoad → page stays blank.
  // This effect checks .complete on the element itself and promotes state.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setImgLoaded(true);
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, [activeDoc, activePage]);

  // One-time keyboard hint.
  useEffect(() => {
    if (!open) return;
    try {
      if (!localStorage.getItem("prox.viewerHintSeen")) {
        setHintSeen(false);
        const t = setTimeout(() => {
          setHintSeen(true);
          try {
            localStorage.setItem("prox.viewerHintSeen", "1");
          } catch {}
        }, 5000);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [open]);

  useEffect(() => {
    if (!highlightBbox || !naturalSize || !wrapRef.current) return;
    if (zoom !== 1) return;
    const [x, y, w, h] = highlightBbox;
    const wrap = wrapRef.current.getBoundingClientRect();
    const baseScale = wrap.width / naturalSize.w;
    const padding = 60;
    const fitZoom = Math.min(
      (wrap.width - padding) / (w * baseScale),
      (wrap.height - padding) / (h * baseScale),
      4,
    );
    if (fitZoom > 1.05) {
      setZoom(fitZoom);
      const cx = (x + w / 2) * baseScale;
      const cy = (y + h / 2) * baseScale;
      setPan({
        x: wrap.width / 2 - cx * fitZoom,
        y: wrap.height / 2 - cy * fitZoom,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightBbox, naturalSize]);

  // Wheel zoom.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.005;
      setZoom((z) => Math.min(6, Math.max(0.5, z * Math.exp(delta))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      setDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    },
    [zoom, pan.x, pan.y],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const s = dragStartRef.current;
      if (!s) return;
      setPan({ x: s.px + (e.clientX - s.x), y: s.py + (e.clientY - s.y) });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const recenterOnHighlight = useCallback(() => {
    if (!highlightBbox || !naturalSize || !wrapRef.current) return;
    const [x, y, w, h] = highlightBbox;
    const wrap = wrapRef.current.getBoundingClientRect();
    const baseScale = wrap.width / naturalSize.w;
    const padding = 60;
    const fitZoom = Math.min(
      (wrap.width - padding) / (w * baseScale),
      (wrap.height - padding) / (h * baseScale),
      4,
    );
    setZoom(fitZoom);
    const cx = (x + w / 2) * baseScale;
    const cy = (y + h / 2) * baseScale;
    setPan({
      x: wrap.width / 2 - cx * fitZoom,
      y: wrap.height / 2 - cy * fitZoom,
    });
  }, [highlightBbox, naturalSize]);

  const section = useMemo(
    () =>
      entry && activePage
        ? entry.map.sections.find(
            (s) => activePage >= s.pages[0] && activePage <= s.pages[1],
          )
        : null,
    [entry, activePage],
  );

  // Keyboard nav
  const canPrev = !!(entry && activePage && activePage > 1);
  const canNext = !!(entry && activePage && activePage < (entry?.page_count || 0));
  useEffect(() => {
    if (!open || !entry || !activePage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        onNavigate(entry.slug, activePage - 1);
      } else if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        onNavigate(entry.slug, activePage + 1);
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(6, z * 1.25));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom((z) => Math.max(0.5, z / 1.25));
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, entry, activePage, canPrev, canNext, onNavigate, onClose, resetView]);

  if (!open || !entry || !activePage) return null;

  const pageCount = entry.page_count;

  const overlay = (() => {
    if (!highlightBbox || !naturalSize || !wrapRef.current) return null;
    const wrap = wrapRef.current.getBoundingClientRect();
    const baseScale = wrap.width / naturalSize.w;
    const [x, y, w, h] = highlightBbox;
    return {
      left: x * baseScale,
      top: y * baseScale,
      width: w * baseScale,
      height: h * baseScale,
    };
  })();

  return (
    <aside className="flex h-full flex-col glass border-l border-l-border-strong/50">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 pb-2.5 pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-primary ring-1 ring-border-subtle">
            <FileText className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-semibold tracking-tight">
              {entry.title}
            </div>
            <div className="truncate font-mono text-[10.5px] uppercase tracking-wide text-fg-dim">
              p.{activePage} / {pageCount}
              {section && <span className="normal-case tracking-normal"> · {section.title}</span>}
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
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface-1/40 px-3 py-1.5 text-xs">
        <div className="flex items-center rounded-lg border border-border-subtle bg-surface-2/60">
          <button
            onClick={() => canPrev && onNavigate(entry.slug, activePage - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
            className="inline-flex h-7 items-center gap-1 px-2 font-mono text-[11px] text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-1 border-x border-border-subtle px-2 font-mono text-[11px] text-fg-muted">
            <input
              type="number"
              min={1}
              max={pageCount}
              value={activePage}
              onChange={(e) => {
                const n = Math.max(1, Math.min(pageCount, Number(e.target.value || 1)));
                onNavigate(entry.slug, n);
              }}
              className="w-10 rounded bg-transparent text-center outline-none focus:bg-surface-3"
            />
            <span className="text-fg-faint">/ {pageCount}</span>
          </div>
          <button
            onClick={() => canNext && onNavigate(entry.slug, activePage + 1)}
            disabled={!canNext}
            aria-label="Next page"
            className="inline-flex h-7 items-center gap-1 px-2 font-mono text-[11px] text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
            aria-label="Zoom out"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={resetView}
            className="min-w-[3rem] rounded-md px-1 py-0.5 font-mono text-[10.5px] text-fg-muted transition-colors hover:bg-surface-3/70 hover:text-fg"
            title="Reset zoom (0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
            aria-label="Zoom in"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {highlightBbox && (
            <button
              onClick={recenterOnHighlight}
              aria-label="Recenter on highlight"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-400 transition-colors hover:bg-surface-3/70"
              title="Recenter on highlight"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Page area */}
      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden bg-gradient-to-b from-background to-surface-1/60"
        onMouseDown={onMouseDown}
        style={{ cursor: dragging ? "grabbing" : zoom > 1 ? "grab" : "default" }}
      >
        {!imgLoaded && naturalSize == null && (
          <div className="absolute left-4 right-4 top-4 h-[calc(100%-2rem)]">
            <div className="mx-auto h-full max-w-[min(100%,56rem)] rounded-lg shimmer shadow-soft" aria-hidden />
          </div>
        )}

        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: "100%",
          }}
        >
          <div className="mx-auto w-full p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${activeDoc}-${activePage}`}
              ref={imgRef}
              src={`/sources/${activeDoc}/p-${String(activePage).padStart(3, "0")}.png`}
              alt={`${entry.title} p.${activePage}`}
              onLoad={(e) => {
                setImgLoaded(true);
                const img = e.currentTarget;
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              draggable={false}
              className={cn(
                "block w-full select-none rounded-md shadow-pop ring-1 ring-border-subtle transition-opacity duration-200",
                imgLoaded ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
          {overlay && imgLoaded && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="absolute pointer-events-none rounded-sm"
              style={{
                left: overlay.left + 16,
                top: overlay.top + 16,
                width: overlay.width,
                height: overlay.height,
                boxShadow:
                  "0 0 0 2px hsl(45 95% 60% / 0.9), 0 0 0 9999px hsl(220 30% 2% / 0.5)",
              }}
            >
              <motion.div
                className="absolute inset-0 rounded-sm ring-2 ring-amber-400/80"
                animate={{ opacity: [0.9, 0.3, 0.9] }}
                transition={{ duration: 1.4, repeat: 2, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </div>

        {/* Keyboard hint */}
        {!hintSeen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-2/90 px-3 py-1.5 font-mono text-[10.5px] text-fg-muted shadow-pop backdrop-blur"
          >
            <Keyboard className="h-3 w-3 text-primary/80" />
            <span>
              <kbd className="rounded border border-border-subtle bg-surface-1 px-1">←</kbd>{" "}
              <kbd className="rounded border border-border-subtle bg-surface-1 px-1">→</kbd>{" "}
              page,{" "}
              <kbd className="rounded border border-border-subtle bg-surface-1 px-1">+/-</kbd>{" "}
              zoom,{" "}
              <kbd className="rounded border border-border-subtle bg-surface-1 px-1">esc</kbd>{" "}
              close
            </span>
          </motion.div>
        )}
      </div>
    </aside>
  );
}
