"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Code2,
  Eye,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Download,
  ExternalLink,
  History,
  ChevronLeft,
  ChevronRight,
  RotateCw,
} from "lucide-react";
import {
  type ArtifactAttachment,
  type ArtifactVersion,
  activeVersion,
} from "@/lib/client/chat-types";

type Tab = "view" | "code";

export function ArtifactPanel({
  artifact,
  onClose,
  onPickVersion,
  onError,
}: {
  artifact: ArtifactAttachment | null;
  onClose: () => void;
  onPickVersion: (groupId: string, version: number) => void;
  /** Fired once per failing version when the iframe reports a render error.
   *  Parent can use this to auto-request a regenerated v(n+1) from the agent. */
  onError?: (groupId: string, version: number, errorMsg: string, code: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<Tab>("view");
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /** Track which version ids we've already reported errors for (avoids
   *  reporting the same failure twice on re-mount / reload). */
  const reportedRef = useRef<Set<string>>(new Set());

  const v: ArtifactVersion | null = artifact ? activeVersion(artifact) : null;

  // Reset ready/err state whenever the active version changes. Also clear
  // the "auto-fixing" flag — a NEW version arriving means the fix landed.
  useEffect(() => {
    if (!v) return;
    setReady(false);
    setErr(null);
    setAutoFixing(false);
    setTab("view");
  }, [v?.id]);

  // postMessage protocol with the iframe.
  useEffect(() => {
    if (!v) return;

    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __artifact?: boolean; type?: string; message?: string };
      if (!d?.__artifact) return;
      if (d.type === "ready") {
        setReady(true);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "render", kind: v.kind, code: v.code },
          "*",
        );
      } else if (d.type === "rendered") {
        setErr(null);
      } else if (d.type === "error") {
        const msg = d.message || "artifact error";
        setErr(msg);
        if (artifact && v && onError && !reportedRef.current.has(v.id)) {
          reportedRef.current.add(v.id);
          setAutoFixing(true);
          onError(artifact.group_id, v.version, msg, v.code);
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [v?.id, reloadKey, artifact?.group_id, onError]);

  useEffect(() => {
    if (v && ready) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "render", kind: v.kind, code: v.code },
        "*",
      );
    }
  }, [v?.id, ready]);

  // Esc to exit fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const versionCount = artifact?.versions.length || 0;
  const currentIdx = useMemo(() => {
    if (!artifact || !v) return 0;
    return artifact.versions.findIndex((x) => x.version === v.version);
  }, [artifact, v]);

  if (!artifact || !v) return null;

  const goVersion = (delta: number) => {
    const next = artifact.versions[currentIdx + delta];
    if (next) onPickVersion(artifact.group_id, next.version);
  };

  const downloadStandalone = () => {
    const blob = new Blob([buildStandaloneHtml(v)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = slugify(v.title) + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openInNewTab = () => {
    const params = new URLSearchParams();
    params.set("kind", v.kind);
    params.set("title", v.title);
    // Use sessionStorage for the code (URL params would blow up for big React).
    const key = `artifact:${artifact.group_id}:${v.version}`;
    try {
      sessionStorage.setItem(key, v.code);
      params.set("k", key);
    } catch {
      // fall back to inline code (truncated if too big)
      params.set("code", v.code);
    }
    window.open(
      `/artifact/${encodeURIComponent(artifact.group_id)}?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const wrapper = fullscreen
    ? "fixed inset-0 z-50 bg-background"
    : "h-full";

  return (
    <aside className={`${wrapper} flex flex-col border-l border-border bg-background/60 backdrop-blur`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-primary/10 text-primary">
            <Code2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{v.title}</div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>{v.kind}</span>
              {versionCount > 1 && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                    <History className="h-3 w-3" /> v{v.version} of {versionCount}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {versionCount > 1 && (
            <div className="mr-1 flex items-center rounded-md border border-border bg-secondary/40">
              <button
                disabled={currentIdx === 0}
                onClick={() => goVersion(-1)}
                className="rounded-l px-1.5 py-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                title="previous version"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="px-1 text-[10px] font-medium text-muted-foreground">
                v{v.version}
              </span>
              <button
                disabled={currentIdx === versionCount - 1}
                onClick={() => goVersion(+1)}
                className="rounded-r px-1.5 py-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                title="next version"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => setTab("view")}
              className={
                "flex items-center gap-1 px-2.5 py-1 text-xs " +
                (tab === "view"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50")
              }
            >
              <Eye className="h-3 w-3" /> View
            </button>
            <button
              onClick={() => setTab("code")}
              className={
                "flex items-center gap-1 px-2.5 py-1 text-xs " +
                (tab === "code"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50")
              }
            >
              <Code2 className="h-3 w-3" /> Code
            </button>
          </div>
          <IconBtn
            title="Reload"
            onClick={() => {
              setErr(null);
              setReady(false);
              setReloadKey((k) => k + 1);
            }}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title={copied ? "Copied!" : "Copy source"}
            onClick={() => {
              navigator.clipboard.writeText(v.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn title="Download as HTML" onClick={downloadStandalone}>
            <Download className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Open in new tab" onClick={openInNewTab}>
            <ExternalLink className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </IconBtn>
          <IconBtn title="Close" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </header>

      {v.note && versionCount > 1 && (
        <div className="border-b border-border bg-secondary/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">v{v.version} —</span>{" "}
          {v.note}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div className={tab === "view" ? "absolute inset-0" : "absolute inset-0 hidden"}>
          {!ready && (
            <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                rendering artifact…
              </span>
            </div>
          )}
          <iframe
            key={`${v.id}-${reloadKey}`}
            ref={iframeRef}
            src="/artifact-runner.html"
            sandbox="allow-scripts"
            className="h-full w-full bg-transparent"
            title={v.title}
          />
          {err && (
            <div className="absolute bottom-2 left-2 right-2 space-y-1.5">
              {autoFixing && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200 animate-fade-in">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  auto-fixing — asked Claude to regenerate as a new version
                </div>
              )}
              <div className="max-h-32 overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] text-red-300">
                {err}
              </div>
            </div>
          )}
        </div>
        <div className={tab === "code" ? "absolute inset-0 overflow-auto scrollbar-thin" : "hidden"}>
          <pre className="whitespace-pre-wrap p-3 font-mono text-[12px] leading-relaxed">
            {v.code}
          </pre>
        </div>
      </div>
    </aside>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "artifact"
  );
}

/** Build a self-contained HTML file the user can open offline. Uses the same
 *  esm.sh import map and sucrase pipeline as the in-app runner. */
function buildStandaloneHtml(v: ArtifactVersion): string {
  const escape = (s: string) =>
    s.replace(/<\/script>/gi, "<\\/script>").replace(/<!--/g, "<\\!--");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(v.title)}</title>
    <script src="https://cdn.tailwindcss.com?plugins=typography,forms,aspect-ratio"></script>
    <style>
      :root { color-scheme: dark light; }
      html, body, #root { margin:0; padding:0; min-height:100vh; background:#0d1018; color:#e8eaee; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
      #root { padding: 24px; }
      .artifact-err { font-family: ui-monospace, Menlo, monospace; background:#2a1111; color:#fca5a5; padding:14px 16px; border:1px solid #5b2222; border-radius:10px; white-space:pre-wrap; font-size:12px; }
    </style>
    <script>window.__ARTIFACT__ = ${JSON.stringify({ kind: v.kind, code: v.code })};</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@18.3.1",
          "react-dom": "https://esm.sh/react-dom@18.3.1",
          "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
          "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
          "recharts": "https://esm.sh/recharts@2.12.7?deps=react@18.3.1,react-dom@18.3.1",
          "lucide-react": "https://esm.sh/lucide-react@0.471.0?deps=react@18.3.1",
          "framer-motion": "https://esm.sh/framer-motion@11.15.0?deps=react@18.3.1,react-dom@18.3.1",
          "clsx": "https://esm.sh/clsx@2.1.1",
          "sucrase": "https://esm.sh/sucrase@3.35.0",
          "mermaid": "https://esm.sh/mermaid@11.4.1",
          "marked": "https://esm.sh/marked@14.1.4"
        }
      }
    </script>
    <script type="module">
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { transform } from "sucrase";
      import mermaid from "mermaid";
      import { marked } from "marked";

      const root = document.getElementById("root");
      const { kind, code } = window.__ARTIFACT__;
      mermaid.initialize({ startOnLoad: false, theme: "dark" });

      function err(m) { root.innerHTML = '<pre class="artifact-err">' + String(m) + '</pre>'; }
      try {
        if (kind === "svg") root.innerHTML = code;
        else if (kind === "html") root.innerHTML = code;
        else if (kind === "markdown") root.innerHTML = marked.parse(code);
        else if (kind === "mermaid") {
          const { svg } = await mermaid.render("m", code);
          root.innerHTML = svg;
        } else if (kind === "react") {
          const pre = "import React from 'react';\\nimport { useState, useEffect, useRef, useMemo, useCallback, useReducer, useLayoutEffect, useContext, createContext, Fragment } from 'react';\\n";
          const cleaned = code.replace(/^[ \\t]*import\\s+(?:[\\w*{}\\s,]+\\s+from\\s+)?['\\"]react['\\"][\\s;]*$/gm, "");
          const out = transform(pre + cleaned, { transforms: ["typescript", "jsx"], jsxRuntime: "classic", production: true }).code;
          const blob = new Blob([out], { type: "text/javascript" });
          const url = URL.createObjectURL(blob);
          const mod = await import(url);
          createRoot(root).render(React.createElement(mod.default));
        }
      } catch (e) { err(e?.stack || e); }
    </script>
  </body>
</html>`;
}
