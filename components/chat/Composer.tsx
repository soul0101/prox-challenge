"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Square, Paperclip, Sparkles } from "lucide-react";
import { VoiceButton } from "./VoiceButton";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/ui/motion";

/**
 * Primary-surface chat composer. Floating glass card, rotating placeholder,
 * circular send, stop-radar while busy, voice halo. Keeps the textarea
 * controlled via props so ChatPanel still owns submission state.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  onVoiceTranscript,
  placeholders,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onStop: () => void;
  onVoiceTranscript: (t: string) => void;
  placeholders: string[];
  busy: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [phIndex, setPhIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectivePlaceholders = useMemo(() => {
    const defaults = [
      "Ask anything about the manual…",
      "Summarize the troubleshooting section",
      "Draw a flowchart for setup",
    ];
    return placeholders.length ? placeholders : defaults;
  }, [placeholders]);

  // Rotate placeholder every 4.5s when not focused and empty.
  useEffect(() => {
    if (focused || value) return;
    const t = setInterval(
      () => setPhIndex((i) => (i + 1) % effectivePlaceholders.length),
      4500,
    );
    return () => clearInterval(t);
  }, [focused, value, effectivePlaceholders.length]);

  // Shift-enter hint (once per session).
  useEffect(() => {
    if (!focused) return;
    try {
      if (localStorage.getItem("prox.composerHintSeen")) return;
    } catch {}
    setShowHint(true);
    const t = setTimeout(() => {
      setShowHint(false);
      try {
        localStorage.setItem("prox.composerHintSeen", "1");
      } catch {}
    }, 4000);
    return () => clearTimeout(t);
  }, [focused]);

  // Auto-resize textarea to content (up to a cap).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 220);
    el.style.height = `${Math.max(next, 44)}px`;
  }, [value]);

  const canSend = !busy && value.trim().length > 0;

  return (
    <div className="px-3 pb-4 pt-2 sm:px-4">
      <div className="relative mx-auto w-full max-w-3xl">
        {/* Focus glow */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-px rounded-2xl transition-opacity duration-300",
            focused ? "opacity-100" : "opacity-0",
          )}
          style={{
            boxShadow:
              "0 0 0 3px hsl(var(--brand-glow)), 0 12px 40px -16px hsl(var(--brand-glow))",
          }}
        />

        <div
          className={cn(
            "relative flex flex-col overflow-hidden rounded-2xl border bg-surface-2/85 backdrop-blur-xl transition-colors",
            focused ? "border-primary/60" : "border-border",
          )}
        >
          {/* Placeholder layer — visible only when empty */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) onSubmit(value);
                }
              }}
              rows={1}
              disabled={busy}
              aria-label="Message"
              className="w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-transparent disabled:opacity-60"
            />
            {!value && (
              <AnimatePresence mode="wait">
                <motion.span
                  key={effectivePlaceholders[phIndex]}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: ease.smooth }}
                  className="pointer-events-none absolute left-4 top-3.5 select-none text-[14.5px] text-fg-dim"
                >
                  {effectivePlaceholders[phIndex]}
                </motion.span>
              </AnimatePresence>
            )}
          </div>

          {/* Control row */}
          <div className="flex items-center justify-between gap-2 border-t border-border-subtle/60 bg-surface-1/40 px-2 py-1.5">
            <div className="flex items-center gap-1">
              <VoiceButton onTranscript={onVoiceTranscript} disabled={busy} />
              <button
                type="button"
                disabled
                title="Image input — coming soon"
                aria-label="Attach image (coming soon)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="ml-1 hidden items-center gap-1 font-mono text-[10.5px] text-fg-faint sm:inline-flex">
                <Sparkles className="h-3 w-3" />
                Multimodal
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] text-fg-faint">
                {value.length > 0 ? `${value.length}` : ""}
              </span>
              {busy ? (
                <motion.button
                  type="button"
                  onClick={onStop}
                  whileTap={{ scale: 0.92 }}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-soft"
                  aria-label="Stop"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
                  <Square className="relative h-3.5 w-3.5" />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={() => canSend && onSubmit(value)}
                  disabled={!canSend}
                  whileTap={canSend ? { scale: 0.94 } : undefined}
                  whileHover={canSend ? { y: -1 } : undefined}
                  aria-label="Send"
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full transition-all",
                    canSend
                      ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-brand"
                      : "bg-surface-3/80 text-fg-faint",
                  )}
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                </motion.button>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showHint && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute -top-7 right-2 inline-flex items-center gap-1 font-mono text-[10.5px] text-fg-dim"
            >
              <kbd className="rounded border border-border-subtle bg-surface-2 px-1 py-0.5 text-[9.5px]">
                ⇧
              </kbd>
              <span>+</span>
              <kbd className="rounded border border-border-subtle bg-surface-2 px-1 py-0.5 text-[9.5px]">
                ↵
              </kbd>
              <span>newline</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
