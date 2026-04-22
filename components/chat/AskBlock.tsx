"use client";
import { motion } from "framer-motion";
import { HelpCircle, ArrowRight } from "lucide-react";
import type { AskBlock as AskType } from "@/lib/client/chat-types";

export function AskBlock({
  ask,
  onAnswer,
  disabled,
}: {
  ask: AskType;
  onAnswer: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1/70 backdrop-blur-sm"
    >
      <div className="flex items-start gap-2.5 px-4 pt-3">
        <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <HelpCircle className="h-3.5 w-3.5" />
        </div>
        <div className="text-[13.5px] font-medium leading-snug text-fg">
          {ask.question}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-2.5">
        {ask.options.map((o) => (
          <motion.button
            key={o.id}
            onClick={() => onAnswer(o.label)}
            disabled={disabled}
            whileHover={!disabled ? { y: -1 } : undefined}
            whileTap={!disabled ? { scale: 0.97 } : undefined}
            className="group inline-flex flex-col items-start gap-0.5 rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-1.5 text-left text-xs transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:opacity-50"
            title={o.detail}
          >
            <span className="inline-flex items-center gap-1 font-medium text-fg">
              {o.label}
              <ArrowRight className="h-3 w-3 translate-x-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-primary" />
            </span>
            {o.detail && (
              <span className="text-[10.5px] text-fg-dim">{o.detail}</span>
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
