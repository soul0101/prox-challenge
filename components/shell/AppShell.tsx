"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useResizablePanel } from "@/lib/ui/useResizablePanel";
import { useIsDesktop } from "@/lib/ui/useBreakpoint";
import { ResizeHandle } from "./ResizeHandle";
import { MobileArtifactSheet } from "./MobileArtifactSheet";
import { ease } from "@/lib/ui/motion";

/**
 * Outer app layout. On desktop (≥1024px), the right slot docks as a
 * resizable sidebar. On narrower viewports it becomes a full-height bottom
 * sheet so chat stays readable on phones. Callers decide what the right
 * slot shows — the shell just handles placement and transitions.
 *
 * Animation: the outer panel slides in/out only when the panel itself is
 * appearing/disappearing. Swapping between two open tabs cross-fades the
 * inner content (keyed on `rightKey`) without re-mounting the frame, so
 * the tab strip and resize handle stay put.
 */
export function AppShell({
  chat,
  right,
  rightKey,
  tabs,
  onCloseRight,
  overlays,
}: {
  chat: React.ReactNode;
  right?: React.ReactNode;
  /** Stable key for the currently-rendered right-side content. Change it to
   *  cross-fade. `null` means no panel. */
  rightKey: string | null;
  /** Optional tab strip rendered above `right`. Lives in the same column
   *  so it stays put while inner content cross-fades. */
  tabs?: React.ReactNode;
  /** Called when the mobile sheet is dismissed (scrim tap, drag-down, Esc).
   *  Caller decides semantics — typically "close the active tab". */
  onCloseRight?: () => void;
  overlays?: React.ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const { width, onMouseDown, dragging } = useResizablePanel({
    storageKey: "prox.rightPanelWidth",
    defaultWidth: 560,
    min: 360,
    max: 900,
  });

  const hasRight = !!rightKey && !!right;

  const rightColumn = (
    <div className="flex h-full min-w-0 flex-col">
      {tabs}
      <div className="relative min-h-0 flex-1">
        {/* No `mode` — inner tabs cross-fade (old fades out, new fades in
            concurrently) instead of running one-after-the-other. */}
        <AnimatePresence initial={false}>
          {right && rightKey && (
            <motion.div
              key={rightKey}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { duration: 0.18, ease: ease.smooth },
              }}
              exit={{
                opacity: 0,
                transition: { duration: 0.12, ease: ease.smooth },
              }}
              className="absolute inset-0"
            >
              {right}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[100dvh] w-screen overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">{chat}</div>

      {isDesktop && (
        <AnimatePresence initial={false} mode="wait">
          {hasRight && (
            <motion.div
              // Stable key — switching tabs doesn't remount the frame.
              key="right-panel"
              initial={{ opacity: 0, x: 24 }}
              animate={{
                opacity: 1,
                x: 0,
                transition: { duration: 0.34, ease: ease.smooth },
              }}
              exit={{
                opacity: 0,
                x: 28,
                transition: { duration: 0.22, ease: ease.smooth },
              }}
              className="flex shrink-0"
              style={{ width }}
            >
              <ResizeHandle onMouseDown={onMouseDown} active={dragging} />
              <div className="min-w-0 flex-1">{rightColumn}</div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {!isDesktop && (
        <MobileArtifactSheet
          open={hasRight}
          onClose={() => onCloseRight?.()}
        >
          {rightColumn}
        </MobileArtifactSheet>
      )}

      {overlays}
    </div>
  );
}
