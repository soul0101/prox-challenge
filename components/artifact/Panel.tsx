"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Sparkles,
  Shapes,
  Workflow,
  FileCode,
  FileText,
  AlertTriangle,
} from "lucide-react";
import {
  type ArtifactAttachment,
  type ArtifactVersion,
  activeVersion,
} from "@/lib/client/chat-types";
import { ease } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

type Tab = "view" | "code";

const KIND_GLYPH: Record<string, React.ComponentType<{ className?: string }>> = {
  react: Code2,
  html: FileCode,
  svg: Shapes,
  mermaid: Workflow,
  markdown: FileText,
  flowchart: Workflow,
};

const KIND_TINT: Record<string, { ring: string; text: string; bg: string }> = {
  react: { ring: "ring-amber-500/30", text: "text-amber-200", bg: "bg-amber-500/10" },
  html: { ring: "ring-cyan-500/30", text: "text-cyan-200", bg: "bg-cyan-500/10" },
  svg: { ring: "ring-emerald-500/30", text: "text-emerald-200", bg: "bg-emerald-500/10" },
  mermaid: { ring: "ring-violet-500/30", text: "text-violet-200", bg: "bg-violet-500/10" },
  markdown: { ring: "ring-zinc-500/30", text: "text-zinc-200", bg: "bg-zinc-500/10" },
  flowchart: { ring: "ring-orange-500/30", text: "text-orange-200", bg: "bg-orange-500/10" },
};

export function ArtifactPanel({
  artifact,
  onClose,
  onPickVersion,
  onError,
}: {
  artifact: ArtifactAttachment | null;
  onClose: () => void;
  onPickVersion: (groupId: string, version: number) => void;
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
  const reportedRef = useRef<Set<string>>(new Set());

  const v: ArtifactVersion | null = artifact ? activeVersion(artifact) : null;

  useEffect(() => {
    if (!v) return;
    setReady(false);
    setErr(null);
    setAutoFixing(false);
    setTab("view");
  }, [v?.id]);

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
    const key = `artifact:${artifact.group_id}:${v.version}`;
    try {
      sessionStorage.setItem(key, v.code);
      params.set("k", key);
    } catch {
      params.set("code", v.code);
    }
    window.open(
      `/artifact/${encodeURIComponent(artifact.group_id)}?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const wrapper = fullscreen ? "fixed inset-0 z-50 bg-background" : "h-full";
  const KindIcon = KIND_GLYPH[v.kind] || Sparkles;
  const tint = KIND_TINT[v.kind] || KIND_TINT.markdown;

  return (
    <aside className={cn("flex flex-col glass border-l border-l-border-strong/50", wrapper)}>
      {/* Top row: title + actions */}
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 pb-2.5 pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1",
              tint.bg,
              tint.text,
              tint.ring,
            )}
          >
            <KindIcon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-semibold tracking-tight">
              {v.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wide text-fg-dim">
              <span>{v.kind}</span>
              <span>·</span>
              <span>{v.code.length.toLocaleString()} chars</span>
              {versionCount > 1 && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-primary/90">
                    v{v.version}/{versionCount}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {versionCount > 1 && (
            <div className="mr-1 flex items-center rounded-lg border border-border-subtle bg-surface-2/70">
              <IconBtn title="Previous version" onClick={() => goVersion(-1)} disabled={currentIdx === 0}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconBtn>
              <span className="min-w-[2rem] px-1 text-center font-mono text-[10.5px] text-fg-muted">
                v{v.version}
              </span>
              <IconBtn
                title="Next version"
                onClick={() => goVersion(+1)}
                disabled={currentIdx === versionCount - 1}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          )}
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
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
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
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn title="Close" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      {/* Tab row: segmented control */}
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
        <SegmentedTabs tab={tab} onChange={setTab} />
        {v.note && versionCount > 1 && (
          <div className="truncate font-mono text-[10.5px] text-fg-dim">
            <span className="text-fg-muted">v{v.version} —</span> {v.note}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        <div className={tab === "view" ? "absolute inset-0 p-3" : "absolute inset-0 hidden"}>
          <div className="relative h-full overflow-hidden rounded-xl border border-border-subtle bg-background shadow-soft">
            {!ready && (
              <div className="absolute inset-0 grid place-items-center bg-surface-1/50">
                <motion.div
                  animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className={cn("grid h-12 w-12 place-items-center rounded-xl", tint.bg, tint.text)}
                >
                  <KindIcon className="h-5 w-5" />
                </motion.div>
                <span className="absolute bottom-6 font-mono text-[11px] text-fg-dim">
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
          </div>
          <AnimatePresence>
            {err && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-4 left-4 right-4 space-y-1.5"
              >
                {autoFixing && (
                  <div className="flex items-center gap-2 overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-200 shimmer-diagonal">
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" />
                      <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                    </span>
                    <span>
                      <span className="font-medium">Auto-fixing</span> — asking
                      Claude for a corrected version
                    </span>
                  </div>
                )}
                <details className="group overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11.5px] text-red-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="font-medium">Render error</span>
                    <span className="truncate text-red-300/80">{err.split("\n")[0]}</span>
                  </summary>
                  <pre className="max-h-44 overflow-auto border-t border-destructive/30 bg-background/40 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-red-300/90 scrollbar-thin">
                    {err}
                  </pre>
                </details>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={tab === "code" ? "absolute inset-0 overflow-auto scrollbar-thin" : "hidden"}>
          <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-fg-muted">
            {v.code}
          </pre>
        </div>
      </div>

      {/* Version rail */}
      {versionCount > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border-subtle bg-surface-1/60 px-3 py-2 scrollbar-thin">
          <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wider text-fg-dim">
            history
          </span>
          <div className="flex gap-1">
            {artifact.versions.map((ver) => (
              <button
                key={ver.id}
                onClick={() => onPickVersion(artifact.group_id, ver.version)}
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] transition-all",
                  ver.version === v.version
                    ? "border-primary/60 bg-primary/15 text-primary shadow-[0_0_10px_hsl(var(--brand-glow))]"
                    : "border-border-subtle text-fg-dim hover:border-primary/40 hover:text-fg",
                )}
                title={ver.note || `version ${ver.version}`}
              >
                v{ver.version}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function SegmentedTabs({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="relative flex items-center gap-0 rounded-full border border-border-subtle bg-surface-1/80 p-0.5">
      {(["view", "code"] as const).map((t) => {
        const active = tab === t;
        const Icon = t === "view" ? Eye : Code2;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors"
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-primary/90 shadow-brand"
              />
            )}
            <span
              className={cn(
                "relative inline-flex items-center gap-1.5",
                active ? "text-primary-foreground" : "text-fg-muted",
              )}
            >
              <Icon className="h-3 w-3" />
              {t === "view" ? "View" : "Code"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim transition-all hover:bg-surface-3/70 hover:text-fg active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30"
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
      function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
      try {
        if (kind === "svg") root.innerHTML = code;
        else if (kind === "html") root.innerHTML = code;
        else if (kind === "markdown") root.innerHTML = marked.parse(code);
        else if (kind === "mermaid") {
          const { svg } = await mermaid.render("m", code);
          root.innerHTML = svg;
        } else if (kind === "flowchart") {
          // Downloads render a static tree view of the flow (no interactivity).
          // The in-app panel is the place to walk through it step-by-step.
          const spec = JSON.parse(code);
          const glyph = (k) => k === 'question' ? '?' : k === 'action' ? '&#9656;' : '&#9679;';
          const tint = (k) => k === 'question' ? '#fbbf24' : k === 'action' ? '#38bdf8' : '#34d399';
          const rendered = new Set();
          const lines = [];
          function walk(id, depth, via) {
            const node = spec.nodes[id];
            const pad = depth * 20 + 8;
            if (!node) { lines.push('<div style="padding-left:' + pad + 'px;color:#fca5a5;">missing: ' + esc(id) + '</div>'); return; }
            if (rendered.has(id)) {
              lines.push('<div style="padding-left:' + pad + 'px;color:#71717a;font-size:12px;">' + (via ? 'via <em>' + esc(via) + '</em> ' : '') + '&#8617; back to "' + esc(node.title.slice(0,40)) + '"</div>');
              return;
            }
            rendered.add(id);
            const cite = node.citation ? ' <span style="font-family:ui-monospace,monospace;color:#a1a1aa;font-size:11px;">' + esc(node.citation) + '</span>' : '';
            const viaLabel = via ? '<div style="font-family:ui-monospace,monospace;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">via ' + esc(via) + '</div>' : '';
            const warn = node.warning ? '<div style="margin-top:6px;padding:6px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;color:#fde68a;font-size:12px;">&#9888; ' + esc(node.warning) + '</div>' : '';
            const detail = node.detail ? '<div style="color:#d4d4d8;font-size:13px;margin-top:4px;">' + esc(node.detail) + '</div>' : '';
            const outcome = node.outcome ? ' <span style="background:rgba(251,146,60,0.2);color:#fdba74;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:600;">' + esc(node.outcome) + '</span>' : '';
            lines.push('<div style="padding:8px 12px 8px ' + pad + 'px;border-left:2px solid rgba(255,255,255,0.08);margin-bottom:2px;">' + viaLabel + '<div style="display:flex;align-items:baseline;gap:8px;"><span style="color:' + tint(node.kind) + ';font-weight:600;">' + glyph(node.kind) + '</span><span style="font-weight:600;color:#f4f4f5;">' + esc(node.title) + '</span>' + cite + outcome + '</div>' + detail + warn + '</div>');
            if (node.kind === 'question') for (const b of node.branches) walk(b.next, depth + 1, b.label);
            else if (node.kind === 'action') walk(node.next, depth + 1);
          }
          walk(spec.start, 0);
          const header = '<div style="margin-bottom:16px;"><div style="font-size:20px;font-weight:700;color:#fafafa;">' + esc(spec.title) + '</div>' + (spec.subtitle ? '<div style="color:#a1a1aa;font-size:13px;margin-top:4px;">' + esc(spec.subtitle) + '</div>' : '') + '<div style="font-family:ui-monospace,monospace;font-size:10.5px;color:#71717a;margin-top:6px;text-transform:uppercase;letter-spacing:0.05em;">Static flow reference &middot; view in app for interactive stepper</div></div>';
          const sources = spec.citations && spec.citations.length ? '<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#71717a;">Sources: ' + spec.citations.map(esc).join(', ') + '</div>' : '';
          root.innerHTML = header + lines.join('') + sources;
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
