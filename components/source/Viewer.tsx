"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Crosshair,
} from "lucide-react";
import type { ManifestEntry } from "@/lib/kb/types";

interface Props {
  manifest: ManifestEntry[];
  open: boolean;
  activeDoc: string | null;
  activePage: number | null;
  /** [x, y, w, h] in source-PNG pixel coords. Drawn as a translucent overlay. */
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
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state on page / doc change.
  useEffect(() => {
    setImgLoaded(false);
    setNaturalSize(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [activeDoc, activePage]);

  // When a bbox highlight arrives, briefly zoom the page so the region fills
  // most of the viewport. If user already zoomed, leave them alone.
  useEffect(() => {
    if (!highlightBbox || !naturalSize || !wrapRef.current) return;
    if (zoom !== 1) return;
    const [x, y, w, h] = highlightBbox;
    const wrap = wrapRef.current.getBoundingClientRect();
    // We render the full page scaled to fit width — figure out target zoom.
    const baseScale = wrap.width / naturalSize.w;
    const padding = 60;
    const fitZoom = Math.min(
      (wrap.width - padding) / (w * baseScale),
      (wrap.height - padding) / (h * baseScale),
      4,
    );
    if (fitZoom > 1.05) {
      setZoom(fitZoom);
      // Center on bbox.
      const cx = (x + w / 2) * baseScale;
      const cy = (y + h / 2) * baseScale;
      setPan({
        x: wrap.width / 2 - cx * fitZoom,
        y: wrap.height / 2 - cy * fitZoom,
      });
    }
  }, [highlightBbox, naturalSize]);

  // Wheel zoom (Ctrl/⌘+wheel or pinch on trackpad).
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

  if (!open || !entry || !activePage) return null;

  const pageCount = entry.page_count;
  const canPrev = activePage > 1;
  const canNext = activePage < pageCount;

  // Highlight overlay: convert source-PNG coords → on-screen coords.
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
    <aside className="flex h-full flex-col border-l border-border bg-background/90">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{entry.title}</div>
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
        <div className="flex items-center gap-1">
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

        <div className="flex items-center gap-1 text-muted-foreground">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
            className="rounded p-1 hover:bg-secondary"
            title="zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={resetView}
            className="min-w-[2.5rem] rounded px-1 py-0.5 text-[11px] hover:bg-secondary"
            title="reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
            className="rounded p-1 hover:bg-secondary"
            title="zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {highlightBbox && (
            <button
              onClick={recenterOnHighlight}
              className="rounded p-1 text-amber-400/80 hover:bg-secondary hover:text-amber-300"
              title="recenter on highlight"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden bg-zinc-950/40"
        onMouseDown={onMouseDown}
        style={{ cursor: dragging ? "grabbing" : zoom > 1 ? "grab" : "default" }}
      >
        {!imgLoaded && (
          <div className="absolute left-2 right-2 top-2 h-96 shimmer rounded-md" aria-hidden />
        )}
        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: "100%",
          }}
        >
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
            className="block w-full select-none"
            style={{ display: imgLoaded ? undefined : "none" }}
          />
          {overlay && imgLoaded && (
            <div
              className="absolute pointer-events-none rounded-sm border-2 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] animate-fade-in"
              style={{
                left: overlay.left,
                top: overlay.top,
                width: overlay.width,
                height: overlay.height,
              }}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
