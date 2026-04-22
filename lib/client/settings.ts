"use client";
import { useCallback, useEffect, useState } from "react";

export type ModelTier = "haiku" | "sonnet" | "opus";

export interface Settings {
  /** Anthropic API key stored in the browser. Empty = defer to server env. */
  apiKey: string;
  /** Model tier for the chat orchestrator. */
  model: ModelTier;
  /** Model tier for the dedicated artifact author. */
  artifactModel: ModelTier;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "sonnet",
  artifactModel: "opus",
};

export const MODEL_TIERS: {
  value: ModelTier;
  label: string;
  blurb: string;
}[] = [
  { value: "haiku", label: "Fast · Haiku", blurb: "Lowest latency, cheapest." },
  { value: "sonnet", label: "Balanced · Sonnet", blurb: "Strong reasoning + fast." },
  { value: "opus", label: "Deep · Opus", blurb: "Highest quality, slower." },
];

const STORAGE_KEY = "manual-copilot:settings:v2";
const ONBOARDED_KEY = "manual-copilot:onboarded:v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return {
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
      model: pick(MODEL_TIERS, p.model, DEFAULT_SETTINGS.model),
      artifactModel: pick(MODEL_TIERS, p.artifactModel, DEFAULT_SETTINGS.artifactModel),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function pick<T extends string>(
  options: { value: T }[],
  candidate: unknown,
  fallback: T,
): T {
  return options.some((o) => o.value === candidate) ? (candidate as T) : fallback;
}

function saveSettings(s: Settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — ignore */
  }
}

/**
 * Has the user seen the settings dialog at least once? First-visit detection
 * so we can auto-open settings on initial load.
 */
export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return Boolean(window.localStorage.getItem(ONBOARDED_KEY));
  } catch {
    return true;
  }
}

export function markOnboarded() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Stateful hook. Persists to localStorage and broadcasts to other tabs via
 * the `storage` event, so opening settings in one tab doesn't race another.
 */
export function useSettings(): [Settings, (update: Partial<Settings>) => void, () => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(loadSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return [settings, update, reset];
}

export interface ChatSettingsPayload {
  apiKey?: string;
  model?: ModelTier;
  artifactModel?: ModelTier;
}

export function toPayload(s: Settings): ChatSettingsPayload {
  return {
    apiKey: s.apiKey || undefined,
    model: s.model,
    artifactModel: s.artifactModel,
  };
}
