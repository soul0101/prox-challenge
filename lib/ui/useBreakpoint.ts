"use client";
import { useEffect, useState } from "react";

/**
 * Reactive media-query matcher. SSR-safe: on the server, returns `fallback`;
 * on the client, syncs to `matchMedia` before first paint when possible and
 * subscribes to changes.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return fallback;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    // Sync after mount too — in case the query changed or SSR default was wrong.
    setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Desktop = viewport ≥ 1024px. Below that, right-side panels become a
 *  bottom sheet instead of a docked sidebar. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)", true);
}
