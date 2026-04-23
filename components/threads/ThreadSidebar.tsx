"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Check,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { Thread } from "@/lib/client/threads";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/ui/motion";

export function ThreadSidebar({
  open,
  threads,
  activeId,
  onClose,
  onCreate,
  onSelect,
  onRename,
  onDelete,
  onOpenMemory,
  memoryCount,
}: {
  open: boolean;
  threads: Thread[];
  activeId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenMemory: () => void;
  memoryCount: number;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [threads, q]);

  const beginEdit = (t: Thread) => {
    setEditingId(t.id);
    setDraft(t.title);
    setConfirmDeleteId(null);
  };

  const commitEdit = () => {
    if (editingId) onRename(editingId, draft);
    setEditingId(null);
    setDraft("");
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.28, ease: ease.smooth }}
            className="flex w-[340px] max-w-[92vw] flex-col glass border-r border-r-border-strong/60 shadow-pop"
          >
            <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 ring-1 ring-border-subtle text-primary">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold tracking-tight">
                    Conversations
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wide text-fg-dim">
                    {threads.length} saved · on this device
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-surface-3/70 hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2.5">
              <button
                onClick={() => {
                  onCreate();
                  onClose();
                }}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/50 bg-primary/10 px-3 text-[12.5px] font-medium text-fg transition-colors hover:bg-primary/20"
              >
                <Plus className="h-3.5 w-3.5" />
                New chat
              </button>
              <button
                onClick={onOpenMemory}
                className="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-surface-2/60 px-3 text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                title="Memory — facts I remember about you"
              >
                <Brain className="h-3.5 w-3.5" />
                Memory
                {memoryCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9.5px] text-primary">
                    {memoryCount}
                  </span>
                )}
              </button>
            </div>

            <div className="border-b border-border-subtle px-3 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-dim" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search conversations…"
                  className="h-9 w-full rounded-xl border border-border-subtle bg-surface-2/70 pl-8 pr-8 text-[13px] text-fg placeholder:text-fg-dim outline-none transition-colors focus:border-primary/60 focus:bg-surface-2"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear"
                    className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-fg-dim hover:bg-surface-3 hover:text-fg"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto scrollbar-thin">
              {threads.length === 0 && (
                <div className="p-6 text-sm text-fg-muted">
                  No conversations yet. Start one with{" "}
                  <span className="font-mono text-fg">New chat</span>.
                </div>
              )}
              {q && filtered.length === 0 && threads.length > 0 && (
                <div className="px-6 py-8 text-center text-[13px] text-fg-dim">
                  No matches for <span className="font-mono">“{query}”</span>
                </div>
              )}
              <ul className="py-1">
                {filtered.map((t) => {
                  const active = t.id === activeId;
                  const isEditing = editingId === t.id;
                  const askingDelete = confirmDeleteId === t.id;
                  return (
                    <li key={t.id}>
                      <div
                        onClick={() => {
                          if (isEditing) return;
                          onSelect(t.id);
                          onClose();
                        }}
                        className={cn(
                          "group relative mx-2 my-0.5 flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 transition-all",
                          active
                            ? "border-primary/40 bg-primary/10"
                            : "border-transparent hover:border-border-subtle hover:bg-surface-2/60",
                        )}
                      >
                        <div
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            active ? "bg-primary" : "bg-border",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit();
                                else if (e.key === "Escape") {
                                  setEditingId(null);
                                  setDraft("");
                                }
                              }}
                              onBlur={commitEdit}
                              className="w-full rounded-md border border-primary/50 bg-surface-2 px-1.5 py-0.5 text-[13px] text-fg outline-none"
                            />
                          ) : (
                            <div
                              className={cn(
                                "truncate text-[13px] font-medium",
                                active ? "text-fg" : "text-fg-muted",
                              )}
                            >
                              {t.title}
                            </div>
                          )}
                          <div className="truncate font-mono text-[10px] text-fg-dim">
                            {t.messages.length} message{t.messages.length === 1 ? "" : "s"}
                            {" · "}
                            {formatRelative(t.updatedAt)}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity",
                            (active || isEditing || askingDelete) && "opacity-100",
                            "group-hover:opacity-100",
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {askingDelete ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(t.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="inline-flex h-6 items-center gap-1 rounded-md bg-destructive/15 px-1.5 font-mono text-[10px] text-red-300 hover:bg-destructive/25"
                                title="Confirm delete"
                              >
                                <Check className="h-3 w-3" />
                                delete
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-dim hover:bg-surface-3 hover:text-fg"
                                title="Cancel"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  beginEdit(t);
                                }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-dim hover:bg-surface-3 hover:text-fg"
                                title="Rename"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(t.id);
                                }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-dim hover:bg-destructive/15 hover:text-red-300"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <footer className="border-t border-border-subtle px-4 py-2.5">
              <div className="font-mono text-[10px] leading-relaxed text-fg-dim">
                Conversations and memory live in this browser. Clearing site
                data or switching devices resets them.
              </div>
            </footer>
          </motion.div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-label="close drawer"
            className="flex-1 bg-background/40 backdrop-blur-md"
          />
        </div>
      )}
    </AnimatePresence>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
