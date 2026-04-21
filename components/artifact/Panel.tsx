"use client";
import { useEffect, useRef, useState } from "react";
import { X, Code2, Eye, Copy, Check } from "lucide-react";
import type { ArtifactAttachment } from "@/lib/client/chat-types";

export function ArtifactPanel({
  artifact,
  onClose,
}: {
  artifact: ArtifactAttachment | null;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<"view" | "code">("view");
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Wait for iframe "ready" postMessage, then send render payload.
  useEffect(() => {
    if (!artifact) return;
    setReady(false);
    setErr(null);
    setTab("view");

    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __artifact?: boolean; type?: string; message?: string };
      if (!d?.__artifact) return;
      if (d.type === "ready") {
        setReady(true);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "render", kind: artifact.kind, code: artifact.code },
          "*",
        );
      } else if (d.type === "rendered") {
        setErr(null);
      } else if (d.type === "error") {
        setErr(d.message || "artifact error");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [artifact]);

  // If the iframe was already loaded (from a previous artifact), re-post.
  useEffect(() => {
    if (artifact && ready) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "render", kind: artifact.kind, code: artifact.code },
        "*",
      );
    }
  }, [artifact, ready]);

  if (!artifact) return null;

  return (
    <aside className="flex h-full flex-col border-l border-border bg-background/60 backdrop-blur">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid place-items-center h-7 w-7 rounded bg-primary/10 text-primary shrink-0">
            <Code2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{artifact.title}</div>
            <div className="text-[10px] text-muted-foreground uppercase">{artifact.kind}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setTab("view")}
              className={
                "px-2.5 py-1 text-xs flex items-center gap-1 " +
                (tab === "view" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50")
              }
            >
              <Eye className="h-3 w-3" /> View
            </button>
            <button
              onClick={() => setTab("code")}
              className={
                "px-2.5 py-1 text-xs flex items-center gap-1 " +
                (tab === "code" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50")
              }
            >
              <Code2 className="h-3 w-3" /> Code
            </button>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(artifact.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
            title="Copy source"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div className={tab === "view" ? "absolute inset-0" : "absolute inset-0 hidden"}>
          <iframe
            ref={iframeRef}
            src="/artifact-runner.html"
            sandbox="allow-scripts"
            className="h-full w-full bg-transparent"
            title={artifact.title}
          />
          {err && (
            <div className="absolute bottom-2 left-2 right-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] text-red-300">
              {err}
            </div>
          )}
        </div>
        <div className={tab === "code" ? "absolute inset-0 overflow-auto scrollbar-thin" : "hidden"}>
          <pre className="whitespace-pre-wrap p-3 font-mono text-[12px] leading-relaxed">
            {artifact.code}
          </pre>
        </div>
      </div>
    </aside>
  );
}
