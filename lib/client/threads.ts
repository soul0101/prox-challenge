"use client";
import { useEffect, useMemo, useState } from "react";
import type {
  ArtifactAttachment,
  AskBlock,
  ChatMessage,
  SourceAttachment,
  ToolChip,
} from "./chat-types";

/**
 * Persisted message. Mirrors ChatMessage but drops transient UI state
 * (`streaming`) — artifact bodies live on the thread (not here) so this stays
 * compact.
 */
export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolChips: ToolChip[];
  sources: SourceAttachment[];
  artifactGroups: string[];
  ask?: AskBlock;
  ts: number;
}

export interface Thread {
  id: string;
  /** Human label. Auto-derived from the first user message; user can rename. */
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  /** Per-thread artifact store — keyed by group_id. */
  artifacts: Record<string, ArtifactAttachment>;
}

export interface ThreadsState {
  threads: Thread[];
  activeId: string | null;
}

export interface ThreadOps {
  create: () => string;
  setActive: (id: string) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  /** Shallow-update the currently-active thread. */
  updateActive: (patch: Partial<Pick<Thread, "messages" | "artifacts" | "title">>) => void;
}

const STORAGE_KEY = "manual-copilot:threads:v1";
const MAX_THREADS = 40;
/** Hard cap — localStorage is typically ~5MB per origin. */
const MAX_STORAGE_BYTES = 3_500_000;

export function fromChatMessage(m: ChatMessage): StoredMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    toolChips: m.toolChips,
    sources: m.sources,
    artifactGroups: m.artifactGroups,
    ask: m.ask,
    ts: Date.now(),
  };
}

export function toChatMessage(m: StoredMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    toolChips: m.toolChips,
    sources: m.sources,
    artifactGroups: m.artifactGroups,
    ask: m.ask,
  };
}

/** Derive a short title from the first user message. */
export function deriveTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const t = first.content.trim().replace(/\s+/g, " ");
  return t.length > 48 ? t.slice(0, 48) + "…" : t || "New chat";
}

function newId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

function emptyState(): ThreadsState {
  return { threads: [], activeId: null };
}

function createThread(): Thread {
  const now = Date.now();
  return {
    id: newId(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    artifacts: {},
  };
}

function loadState(): ThreadsState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.threads)) return emptyState();
    const threads: Thread[] = parsed.threads
      .filter((t: unknown) => t && typeof t === "object")
      .map((t: Partial<Thread>) => ({
        id: String(t.id || newId()),
        title: typeof t.title === "string" ? t.title : "New chat",
        createdAt: Number(t.createdAt) || Date.now(),
        updatedAt: Number(t.updatedAt) || Date.now(),
        messages: Array.isArray(t.messages) ? (t.messages as StoredMessage[]) : [],
        artifacts:
          t.artifacts && typeof t.artifacts === "object"
            ? (t.artifacts as Record<string, ArtifactAttachment>)
            : {},
      }));
    const activeId =
      typeof parsed.activeId === "string" &&
      threads.some((t) => t.id === parsed.activeId)
        ? parsed.activeId
        : threads[0]?.id || null;
    return { threads, activeId };
  } catch {
    return emptyState();
  }
}

/**
 * Write ThreadsState to localStorage. If the payload exceeds budget, evict the
 * oldest threads (but never the active one) until it fits.
 */
function writeState(state: ThreadsState): ThreadsState {
  if (typeof window === "undefined") return state;
  let working = state;
  for (let i = 0; i < 8; i++) {
    const serialized = JSON.stringify(working);
    if (serialized.length <= MAX_STORAGE_BYTES) {
      try {
        window.localStorage.setItem(STORAGE_KEY, serialized);
        return working;
      } catch {
        // Quota — drop one thread and retry.
      }
    }
    const victimIdx = working.threads
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => t.id !== working.activeId)
      .sort((a, b) => a.t.updatedAt - b.t.updatedAt)[0]?.idx;
    if (victimIdx === undefined) break;
    working = {
      ...working,
      threads: working.threads.filter((_, idx) => idx !== victimIdx),
    };
  }
  return working;
}

// Module-level shared store — every useThreads() caller in the same tab
// subscribes so updates propagate without a page reload. See useSettings
// for the same pattern.
let currentState: ThreadsState | null = null;
const listeners = new Set<(s: ThreadsState) => void>();

function broadcast(s: ThreadsState) {
  currentState = s;
  for (const l of listeners) l(s);
}

function commit(next: ThreadsState) {
  const persisted = writeState(capThreads(next));
  broadcast(persisted);
}

function capThreads(s: ThreadsState): ThreadsState {
  if (s.threads.length <= MAX_THREADS) return s;
  const sorted = [...s.threads].sort((a, b) => b.updatedAt - a.updatedAt);
  const keep = sorted.slice(0, MAX_THREADS);
  // Never drop the active thread.
  if (s.activeId && !keep.some((t) => t.id === s.activeId)) {
    const active = s.threads.find((t) => t.id === s.activeId);
    if (active) keep[keep.length - 1] = active;
  }
  return { ...s, threads: keep };
}

export function useThreads(): [ThreadsState, ThreadOps, Thread | null] {
  const [state, setState] = useState<ThreadsState>(
    () => currentState ?? emptyState(),
  );

  useEffect(() => {
    if (currentState === null) currentState = loadState();
    setState(currentState);
    const listener = (s: ThreadsState) => setState(s);
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) broadcast(loadState());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Stable across renders — none of these close over state, they all read
  // `currentState` lazily at call time.
  const ops = useMemo<ThreadOps>(
    () => ({
      create: () => {
        const base = currentState ?? loadState();
        const t = createThread();
        commit({ threads: [t, ...base.threads], activeId: t.id });
        return t.id;
      },
      setActive: (id: string) => {
        const base = currentState ?? loadState();
        if (!base.threads.some((t) => t.id === id)) return;
        commit({ ...base, activeId: id });
      },
      rename: (id: string, title: string) => {
        const base = currentState ?? loadState();
        const trimmed = title.trim().slice(0, 80) || "New chat";
        commit({
          ...base,
          threads: base.threads.map((t) =>
            t.id === id ? { ...t, title: trimmed, updatedAt: Date.now() } : t,
          ),
        });
      },
      remove: (id: string) => {
        const base = currentState ?? loadState();
        const next = base.threads.filter((t) => t.id !== id);
        const activeId =
          base.activeId === id ? next[0]?.id || null : base.activeId;
        commit({ threads: next, activeId });
      },
      updateActive: (
        patch: Partial<Pick<Thread, "messages" | "artifacts" | "title">>,
      ) => {
        const base = currentState ?? loadState();
        if (!base.activeId) return;
        commit({
          ...base,
          threads: base.threads.map((t) =>
            t.id === base.activeId
              ? { ...t, ...patch, updatedAt: Date.now() }
              : t,
          ),
        });
      },
    }),
    [],
  );

  const active =
    state.activeId != null
      ? state.threads.find((t) => t.id === state.activeId) || null
      : null;

  return [state, ops, active];
}
