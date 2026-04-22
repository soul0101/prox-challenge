"use client";
import { useEffect } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { ease } from "@/lib/ui/motion";

/**
 * Full-height bottom sheet used on phones/tablets. Slides up from below,
 * covers chat with a dimmed scrim, and dismisses via drag-down on the grab
 * handle, tap on the scrim, or programmatic close. Drag-to-dismiss is
 * controlled manually (not from the content) so inner scrolling doesn't
 * accidentally dismiss the sheet.
 */
export function MobileArtifactSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const controls = useDragControls();
  const y = useMotionValue(0);
  // Scrim fades in as the sheet slides up; also fades as the user drags down.
  const scrimOpacity = useTransform(y, [0, 300], [1, 0]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while the sheet is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ opacity: scrimOpacity }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0, transition: { duration: 0.36, ease: ease.smooth } }}
            exit={{ y: "100%", transition: { duration: 0.24, ease: ease.smooth } }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              const threshold = info.offset.y > 140 || info.velocity.y > 600;
              if (threshold) onClose();
              else y.set(0);
            }}
            style={{ y, height: "calc(100dvh - 2.5rem)" }}
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-3xl border-t border-border-strong/60 bg-background shadow-pop"
          >
            <div
              onPointerDown={(e) => controls.start(e)}
              className="flex shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
              aria-label="Drag to dismiss"
              role="button"
            >
              <div className="h-1.5 w-10 rounded-full bg-fg-dim/40" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
