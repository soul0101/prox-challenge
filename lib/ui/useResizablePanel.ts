"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-resize width for a right-side panel, with localStorage persistence
 * and min/max clamping. Returns the width, the drag handle props, and whether
 * we're currently dragging.
 */
export function useResizablePanel(opts: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
}) {
  const { storageKey, defaultWidth, min, max } = opts;
  const [width, setWidth] = useState<number>(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; w: number } | null>(null);

  // Hydrate from storage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) setWidth(Math.max(min, Math.min(max, n)));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Clamp when viewport changes.
  useEffect(() => {
    const onResize = () => {
      const cap = Math.min(max, Math.floor(window.innerWidth * 0.7));
      setWidth((w) => Math.min(cap, Math.max(min, w)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [min, max]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startRef.current = { x: e.clientX, w: width };
      setDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const s = startRef.current;
      if (!s) return;
      // Dragging the handle left increases the right-panel width.
      const dx = s.x - e.clientX;
      const cap = Math.min(max, Math.floor(window.innerWidth * 0.7));
      const next = Math.min(cap, Math.max(min, s.w + dx));
      setWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      try {
        localStorage.setItem(storageKey, String(Math.round(width)));
      } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, min, max, storageKey, width]);

  // Persist width on unmount / change too.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {}
  }, [width, storageKey]);

  return { width, setWidth, onMouseDown, dragging };
}
