"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Standalone artifact viewer. Used by the "open in new tab" button on the
 * in-app artifact panel. The code is passed in via sessionStorage (key=`k`)
 * to avoid URL-length limits — falls back to a `code` param for very small
 * artifacts.
 */
export default function ArtifactStandalone() {
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const kind = (params.get("kind") || "react") as
    | "react"
    | "html"
    | "svg"
    | "mermaid"
    | "markdown";
  const title = params.get("title") || "Artifact";
  const k = params.get("k");
  const inlineCode = params.get("code");

  let code = "";
  if (k && typeof window !== "undefined") {
    code = sessionStorage.getItem(k) || "";
  }
  if (!code && inlineCode) code = inlineCode;

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __artifact?: boolean; type?: string; message?: string };
      if (!d?.__artifact) return;
      if (d.type === "ready") {
        setReady(true);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "render", kind, code },
          "*",
        );
      } else if (d.type === "error") {
        setErr(d.message || "render error");
      } else if (d.type === "rendered") {
        setErr(null);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [kind, code]);

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {kind} artifact · standalone view
          </div>
        </div>
        <a
          href="/"
          className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ← back to chat
        </a>
      </header>
      <div className="relative flex-1">
        {!code && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            No artifact code found in this tab. The standalone link only works
            from the same browser session that opened it.
          </div>
        )}
        {!ready && code && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              loading…
            </span>
          </div>
        )}
        {code && (
          <iframe
            ref={iframeRef}
            src="/artifact-runner.html"
            sandbox="allow-scripts"
            className="absolute inset-0 h-full w-full bg-transparent"
            title={title}
          />
        )}
        {err && (
          <div className="absolute bottom-2 left-2 right-2 max-h-32 overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] text-red-300">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
