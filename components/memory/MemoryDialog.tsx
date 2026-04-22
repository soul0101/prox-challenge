"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Pencil, Plus, Sparkles, Trash2, User, X } from "lucide-react";
import type { UserMemory, UserMemoryFact } from "@/lib/client/memory";
import { MAX_FACTS, MAX_FACT_LEN } from "@/lib/client/memory";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/ui/motion";

export function MemoryDialog({
  open,
  memory,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onClear,
}: {
  open: boolean;
  memory: UserMemory;
  onClose: () => void;
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [newFact, setNewFact] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const sorted = [...memory.facts].sort((a, b) => b.updatedAt - a.updatedAt);
  const autoCount = memory.facts.filter((f) => f.source === "auto").length;
  const manualCount = memory.facts.filter((f) => f.source === "manual").length;

  const commitAdd = () => {
    const t = newFact.trim();
    if (!t) return;
    onAdd(t);
    setNewFact("");
  };

  const beginEdit = (f: UserMemoryFact) => {
    setEditingId(f.id);
    setEditingDraft(f.text);
  };

  const commitEdit = () => {
    if (editingId && editingDraft.trim()) {
      onUpdate(editingId, editingDraft.trim());
    }
    setEditingId(null);
    setEditingDraft("");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="memory-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            key="memory-panel"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: ease.smooth }}
            className="relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 shadow-pop"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Memory"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle bg-surface-2">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold tracking-tight text-fg">
                    What I remember about you
                  </div>
                  <div className="font-mono text-[10.5px] text-fg-dim">
                    {memory.facts.length} / {MAX_FACTS} facts
                    {autoCount > 0 && ` · ${autoCount} auto`}
                    {manualCount > 0 && ` · ${manualCount} yours`}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Close memory"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="border-b border-border-subtle px-5 py-3">
              <div className="relative">
                <Plus className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-dim" />
                <input
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitAdd();
                  }}
                  maxLength={MAX_FACT_LEN}
                  placeholder="Add a fact the assistant should remember…"
                  className="h-10 w-full rounded-xl border border-border-subtle bg-surface-2/70 pl-9 pr-20 text-[13px] text-fg placeholder:text-fg-dim outline-none transition-colors focus:border-primary/60 focus:bg-surface-2"
                />
                <button
                  onClick={commitAdd}
                  disabled={!newFact.trim()}
                  className="absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded-lg border border-primary/50 bg-primary/10 px-2.5 text-[11px] font-medium text-fg transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <div className="mt-2 font-mono text-[10px] text-fg-dim">
                e.g. "Owns 2024 Model Y", "Prefers metric units", "First-time owner"
              </div>
            </div>

            <div className="max-h-[50vh] min-h-[160px] overflow-y-auto px-5 py-3 scrollbar-thin">
              {sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border-subtle bg-surface-2 text-fg-dim">
                    <Brain className="h-5 w-5" />
                  </div>
                  <div className="text-[13px] text-fg-muted">
                    Nothing remembered yet.
                  </div>
                  <div className="max-w-[340px] font-mono text-[10.5px] leading-relaxed text-fg-dim">
                    As you chat, I'll quietly note stable facts about you — your
                    product model, preferences, skill level — and use them to
                    tailor answers. You can edit anything here.
                  </div>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {sorted.map((f) => {
                    const isEditing = editingId === f.id;
                    return (
                      <li
                        key={f.id}
                        className={cn(
                          "group flex items-start gap-2 rounded-xl border px-3 py-2 transition-colors",
                          isEditing
                            ? "border-primary/50 bg-primary/10"
                            : "border-border-subtle bg-surface-2/40 hover:bg-surface-2/70",
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md",
                            f.source === "manual"
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-primary/10 text-primary",
                          )}
                          title={f.source === "manual" ? "You added this" : "Auto-extracted"}
                        >
                          {f.source === "manual" ? (
                            <User className="h-3 w-3" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingDraft}
                              onChange={(e) => setEditingDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit();
                                else if (e.key === "Escape") {
                                  setEditingId(null);
                                  setEditingDraft("");
                                }
                              }}
                              onBlur={commitEdit}
                              maxLength={MAX_FACT_LEN}
                              className="w-full rounded-md border border-primary/50 bg-surface-1 px-1.5 py-0.5 text-[13px] text-fg outline-none"
                            />
                          ) : (
                            <div className="break-words text-[13px] text-fg">
                              {f.text}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => beginEdit(f)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-dim hover:bg-surface-3 hover:text-fg"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => onRemove(f.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-dim hover:bg-destructive/15 hover:text-red-300"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-1/80 px-5 py-3">
              <div className="font-mono text-[10px] leading-relaxed text-fg-dim">
                Stored only in this browser. Sent with each chat request to
                tailor the assistant.
              </div>
              {confirmClear ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      onClear();
                      setConfirmClear(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-destructive/15 px-2 py-1 font-mono text-[10px] text-red-300 hover:bg-destructive/25"
                  >
                    forget everything
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[10px] text-fg-dim hover:bg-surface-2 hover:text-fg"
                  >
                    cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={memory.facts.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all
                </button>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Small toast shown top-center when new auto-facts land during a chat turn.
 * Kept deliberately subtle — memory shouldn't feel surveillant.
 */
export function MemoryToast({
  facts,
  onDismiss,
}: {
  facts: string[];
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (facts.length === 0) return;
    const t = setTimeout(onDismiss, 4200);
    return () => clearTimeout(t);
  }, [facts, onDismiss]);

  return (
    <AnimatePresence>
      {facts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: ease.smooth }}
          className="pointer-events-auto fixed left-1/2 top-4 z-50 max-w-[420px] -translate-x-1/2"
        >
          <div className="flex items-start gap-2.5 rounded-2xl border border-border-subtle bg-surface-1/95 px-3.5 py-2.5 shadow-pop backdrop-blur-xl">
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-fg-dim">
                Remembered
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {facts.slice(0, 3).map((f, i) => (
                  <li key={i} className="truncate text-[12.5px] text-fg">
                    {f}
                  </li>
                ))}
                {facts.length > 3 && (
                  <li className="text-[11px] text-fg-dim">
                    +{facts.length - 3} more
                  </li>
                )}
              </ul>
            </div>
            <button
              onClick={onDismiss}
              aria-label="dismiss"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-dim hover:bg-surface-3 hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
