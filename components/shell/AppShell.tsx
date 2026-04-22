"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useResizablePanel } from "@/lib/ui/useResizablePanel";
import { ResizeHandle } from "./ResizeHandle";
import { ease } from "@/lib/ui/motion";

/**
 * Outer app layout: chat column + (optional) right panel. Right panel slides
 * in with framer-motion and is resizable via a drag rail. The right slot is
 * a single node — callers decide whether it renders the artifact panel or the
 * source viewer.
 */
export function AppShell({
  chat,
  right,
  rightKey,
  overlays,
}: {
  chat: React.ReactNode;
  right?: React.ReactNode;
  /** Stable key for the right-side child so AnimatePresence can swap panels. */
  rightKey: string | null;
  overlays?: React.ReactNode;
}) {
  const { width, onMouseDown, dragging } = useResizablePanel({
    storageKey: "prox.rightPanelWidth",
    defaultWidth: 560,
    min: 360,
    max: 900,
  });

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">{chat}</div>

      <AnimatePresence initial={false} mode="wait">
        {rightKey && right && (
          <motion.div
            key={rightKey}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.34, ease: ease.smooth } }}
            exit={{ opacity: 0, x: 28, transition: { duration: 0.22, ease: ease.smooth } }}
            className="flex shrink-0"
            style={{ width }}
          >
            <ResizeHandle onMouseDown={onMouseDown} active={dragging} />
            <div className="min-w-0 flex-1">{right}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {overlays}
    </div>
  );
}
