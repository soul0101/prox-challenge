"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Square, Paperclip, Sparkles, X } from "lucide-react";
import { VoiceButton } from "./VoiceButton";
import type { ImageAttachment } from "@/lib/client/chat-types";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/ui/motion";

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB — base64-inflated, still fits comfortably in Anthropic's 5MB-per-image budget.

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
  attachment,
  onAttach,
  onClearAttachment,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onStop: () => void;
  onVoiceTranscript: (t: string) => void;
  placeholders: string[];
  busy: boolean;
  attachment: ImageAttachment | null;
  onAttach: (att: ImageAttachment) => void;
  onClearAttachment: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [phIndex, setPhIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const canSend = !busy && (value.trim().length > 0 || !!attachment);

  const pickImage = () => {
    if (busy) return;
    setAttachError(null);
    fileInputRef.current?.click();
  };

  const handleFile = (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as typeof ACCEPTED_IMAGE_TYPES[number])) {
      setAttachError("Unsupported format. Use PNG, JPEG, WebP, or GIF.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — 8 MB max.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) {
        setAttachError("Couldn't read the file.");
        return;
      }
      onAttach({
        id: Math.random().toString(36).slice(2, 10),
        src,
        mediaType: file.type as ImageAttachment["mediaType"],
        name: file.name,
      });
    };
    reader.onerror = () => setAttachError("Couldn't read the file.");
    reader.readAsDataURL(file);
  };

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

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            // Reset so picking the same file twice still fires change.
            e.target.value = "";
          }}
        />

        <div
          className={cn(
            "relative flex flex-col overflow-hidden rounded-2xl border bg-surface-2/85 backdrop-blur-xl transition-colors",
            focused ? "border-primary/60" : "border-border",
          )}
        >
          <AnimatePresence>
            {attachment && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-b border-border-subtle/60 bg-surface-1/40 px-3 pt-3"
              >
                <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-border-subtle bg-surface-2 py-1.5 pl-1.5 pr-2 shadow-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.src}
                    alt={attachment.name || "Attached image"}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-fg">
                      {attachment.name || "image"}
                    </div>
                    <div className="font-mono text-[10px] text-fg-dim">
                      {attachment.mediaType.replace("image/", "").toUpperCase()} · attached
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearAttachment}
                    aria-label="Remove attachment"
                    className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                onClick={pickImage}
                disabled={busy}
                title={attachment ? "Replace attached image" : "Attach an image"}
                aria-label={attachment ? "Replace attached image" : "Attach an image"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  attachment
                    ? "bg-primary/15 text-primary hover:bg-primary/25"
                    : "text-fg-dim hover:bg-surface-3/70 hover:text-fg-muted",
                )}
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
          {attachError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              onAnimationComplete={() => {
                setTimeout(() => setAttachError(null), 3200);
              }}
              className="mt-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11.5px] text-red-300"
            >
              {attachError}
            </motion.div>
          )}
        </AnimatePresence>

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
