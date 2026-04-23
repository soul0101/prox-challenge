"use client";
import { useEffect, useMemo, useState } from "react";

/**
 * A stable fact about the user, surfaced to the agent on every turn.
 * Kept short (one line) and concrete ("Owns 2024 Tesla Model Y", "Prefers
 * metric units"). The agent reads these; the user can edit or delete any fact.
 */
export interface UserMemoryFact {
  id: string;
  text: string;
  /** `auto` = extracted by Haiku after a turn. `manual` = user-entered. */
  source: "auto" | "manual";
  createdAt: number;
  updatedAt: number;
}

export interface UserMemory {
  facts: UserMemoryFact[];
  updatedAt: number;
}

const STORAGE_KEY = "manual-copilot:memory:v1";
/**
 * Hard cap on total facts (manual + auto). Keeps the system-prompt injection
 * bounded and prevents the memory from ever bloating regardless of how many
 * conversations you have. A healthy memory is 3–8 facts; 12 is headroom, not
 * a target. The server-side extractor enforces the same cap.
 */
export const MAX_FACTS = 12;
/** Per-fact character cap. */
export const MAX_FACT_LEN = 160;

export interface MemoryOps {
  /** Add a fact. Dedupes by case-insensitive text match. */
  add: (text: string, source?: "auto" | "manual") => void;
  /** Replace the entire auto-fact list (manual facts preserved). */
  replaceAuto: (texts: string[]) => UserMemoryFact[];
  update: (id: string, text: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

function emptyMemory(): UserMemory {
  return { facts: [], updatedAt: Date.now() };
}

function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_FACT_LEN);
}

function loadMemory(): UserMemory {
  if (typeof window === "undefined") return emptyMemory();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.facts)) return emptyMemory();
    const facts: UserMemoryFact[] = parsed.facts
      .filter((f: unknown) => f && typeof f === "object")
      .map((f: Partial<UserMemoryFact>) => ({
        id: String(f.id || newId()),
        text: normalize(String(f.text || "")),
        source: f.source === "manual" ? "manual" : "auto",
        createdAt: Number(f.createdAt) || Date.now(),
        updatedAt: Number(f.updatedAt) || Date.now(),
      }))
      .filter((f: UserMemoryFact) => f.text.length > 0)
      .slice(0, MAX_FACTS);
    return {
      facts,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return emptyMemory();
  }
}

function saveMemory(m: UserMemory) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    /* quota — ignore */
  }
}

let currentMemory: UserMemory | null = null;
const listeners = new Set<(m: UserMemory) => void>();

function broadcast(m: UserMemory) {
  currentMemory = m;
  for (const l of listeners) l(m);
}

function commit(next: UserMemory) {
  const sized = { ...next, facts: next.facts.slice(0, MAX_FACTS) };
  saveMemory(sized);
  broadcast(sized);
}

export function useUserMemory(): [UserMemory, MemoryOps] {
  const [memory, setMemory] = useState<UserMemory>(
    () => currentMemory ?? emptyMemory(),
  );

  useEffect(() => {
    if (currentMemory === null) currentMemory = loadMemory();
    setMemory(currentMemory);
    const listener = (m: UserMemory) => setMemory(m);
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) broadcast(loadMemory());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const ops = useMemo<MemoryOps>(
    () => ({
      add: (text: string, source: "auto" | "manual" = "manual") => {
        const t = normalize(text);
        if (!t) return;
        const base = currentMemory ?? loadMemory();
        const existing = base.facts.find(
          (f) => f.text.toLowerCase() === t.toLowerCase(),
        );
        const now = Date.now();
        if (existing) {
          commit({
            facts: base.facts.map((f) =>
              f.id === existing.id ? { ...f, updatedAt: now } : f,
            ),
            updatedAt: now,
          });
          return;
        }
        const fact: UserMemoryFact = {
          id: newId(),
          text: t,
          source,
          createdAt: now,
          updatedAt: now,
        };
        commit({ facts: [fact, ...base.facts], updatedAt: now });
      },
      replaceAuto: (texts: string[]): UserMemoryFact[] => {
        const base = currentMemory ?? loadMemory();
        const now = Date.now();
        const manual = base.facts.filter((f) => f.source === "manual");
        const manualLower = new Set(manual.map((f) => f.text.toLowerCase()));

        const cleaned: UserMemoryFact[] = [];
        const seen = new Set<string>();
        for (const raw of texts) {
          const t = normalize(raw);
          if (!t) continue;
          const key = t.toLowerCase();
          if (seen.has(key) || manualLower.has(key)) continue;
          seen.add(key);
          const prior = base.facts.find(
            (f) => f.source === "auto" && f.text.toLowerCase() === key,
          );
          cleaned.push(
            prior
              ? { ...prior, text: t, updatedAt: now }
              : {
                  id: newId(),
                  text: t,
                  source: "auto",
                  createdAt: now,
                  updatedAt: now,
                },
          );
        }
        const next = { facts: [...manual, ...cleaned], updatedAt: now };
        commit(next);
        const priorAuto = new Set(
          base.facts
            .filter((f) => f.source === "auto")
            .map((f) => f.text.toLowerCase()),
        );
        return cleaned.filter((f) => !priorAuto.has(f.text.toLowerCase()));
      },
      update: (id: string, text: string) => {
        const t = normalize(text);
        if (!t) return;
        const base = currentMemory ?? loadMemory();
        commit({
          facts: base.facts.map((f) =>
            f.id === id ? { ...f, text: t, updatedAt: Date.now() } : f,
          ),
          updatedAt: Date.now(),
        });
      },
      remove: (id: string) => {
        const base = currentMemory ?? loadMemory();
        commit({
          facts: base.facts.filter((f) => f.id !== id),
          updatedAt: Date.now(),
        });
      },
      clear: () => {
        commit({ facts: [], updatedAt: Date.now() });
      },
    }),
    [],
  );

  return [memory, ops];
}

/** Serialize memory for transport to the server (just the fact texts). */
export function factsAsLines(m: UserMemory): string[] {
  return m.facts.map((f) => f.text);
}
