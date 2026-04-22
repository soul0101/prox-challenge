"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

export function ScrollToLatest({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.92 }}
          transition={{ duration: 0.18 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.94 }}
          onClick={onClick}
          aria-label="Scroll to latest message"
          className="absolute bottom-24 right-6 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-strong/70 bg-surface-2/90 text-fg shadow-pop backdrop-blur-xl transition-colors hover:border-primary/60 hover:text-primary"
        >
          <ArrowDown className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
