"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Code2,
  FileCode,
  FileText,
  History,
  ListChecks,
  RotateCw,
  Shapes,
  Sparkles,
  Tag,
  Workflow,
} from "lucide-react";
import {
  type ArtifactAttachment,
  type ArtifactVersion,
  activeVersion,
} from "@/lib/client/chat-types";
import { cn } from "@/lib/utils";

/**
 * Inline artifact card that actually renders the artifact in chat. Uses
 * the same sandboxed iframe as the full panel, at a constrained height so
 * it reads as a single "cell" in the chat flow. There's no "expand"
 * action — the artifact lives where it belongs (inline), and the right
 * pane is reserved for manual sources so the user never loses chat context.
 *
 * The iframe handshake: the child posts `{__artifact: true, type: "ready"}`
 * when the runner boots, we reply with `{type: "render", kind, code}`.
 * Errors are relayed to `onError` so the agent can auto-fix via a re-emit.
 */

const KIND_GLYPH: Record<string, React.ComponentType<{ className?: string }>> = {
  react: Code2,
  html: FileCode,
  svg: Shapes,
  mermaid: Workflow,
  markdown: FileText,
  flowchart: Workflow,
  procedure: ListChecks,
  "image-labeling": Tag,
};

const KIND_LABEL: Record<string, string> = {
  react: "Interactive",
  html: "HTML",
  svg: "Diagram",
  mermaid: "Diagram",
  markdown: "Markdown",
  flowchart: "Decision tree",
  procedure: "Walkthrough",
  "image-labeling": "Labelled image",
};

const KIND_TINT: Record<string, { ring: string; text: string; bg: string }> = {
  react: { ring: "ring-amber-500/30", text: "text-amber-200", bg: "bg-amber-500/10" },
  html: { ring: "ring-cyan-500/30", text: "text-cyan-200", bg: "bg-cyan-500/10" },
  svg: { ring: "ring-emerald-500/30", text: "text-emerald-200", bg: "bg-emerald-500/10" },
  mermaid: { ring: "ring-violet-500/30", text: "text-violet-200", bg: "bg-violet-500/10" },
  markdown: { ring: "ring-zinc-500/30", text: "text-zinc-200", bg: "bg-zinc-500/10" },
  flowchart: { ring: "ring-orange-500/30", text: "text-orange-200", bg: "bg-orange-500/10" },
  procedure: { ring: "ring-sky-500/30", text: "text-sky-200", bg: "bg-sky-500/10" },
  "image-labeling": { ring: "ring-rose-500/30", text: "text-rose-200", bg: "bg-rose-500/10" },
};

export function InlineArtifact({
  artifact,
  onPickVersion,
  onError,
}: {
  artifact: ArtifactAttachment;
  onPickVersion: (groupId: string, version: number) => void;
  onError?: (groupId: string, version: number, errorMsg: string, code: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reportedRef = useRef<Set<string>>(new Set());

  const v: ArtifactVersion = activeVersion(artifact);
  const versionCount = artifact.versions.length;
  const currentIdx = useMemo(
    () => artifact.versions.findIndex((x) => x.version === v.version),
    [artifact, v],
  );

  // Reset on version change.
  useEffect(() => {
    setReady(false);
    setErr(null);
  }, [v.id, reloadKey]);

  // Listen for ready/rendered/error messages from the iframe runner.
  // Critical: scope to messages from our OWN iframe. Multiple InlineArtifact
  // instances can coexist on a single thread, and every handler would
  // otherwise fire for every iframe (causing phantom errors + crosstalk).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
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
        if (onError && !reportedRef.current.has(v.id)) {
          reportedRef.current.add(v.id);
          onError(artifact.group_id, v.version, msg, v.code);
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [v.id, v.kind, v.code, v.version, reloadKey, artifact.group_id, onError]);

  // Re-send render if the version changes while iframe is already ready.
  useEffect(() => {
    if (ready) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "render", kind: v.kind, code: v.code },
        "*",
      );
    }
  }, [v.id, v.kind, v.code, ready]);

  const KindIcon = KIND_GLYPH[v.kind] || Sparkles;
  const tint = KIND_TINT[v.kind] || KIND_TINT.markdown;
  const kindLabel = KIND_LABEL[v.kind] || v.kind;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1/60"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-2/40 px-3 py-2">
        <div
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1",
            tint.bg,
            tint.text,
            tint.ring,
          )}
        >
          <KindIcon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{v.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-fg-dim">
            <span className={tint.text}>{kindLabel}</span>
            {versionCount > 1 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5 text-primary">
                  <History className="h-2.5 w-2.5" /> v{v.version}/{versionCount}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn
            title="Reload"
            onClick={() => {
              setReady(false);
              setErr(null);
              setReloadKey((k) => k + 1);
            }}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      {/* Live artifact — iframe takes the full inner width, fixed height */}
      <div className="relative h-[520px] w-full bg-surface-1">
        <iframe
          key={v.id + ":" + reloadKey}
          ref={iframeRef}
          src="/artifact-runner.html"
          sandbox="allow-scripts"
          className="block h-full w-full border-0"
          title={v.title}
        />

        {!ready && !err && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-1/50">
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-fg-dim">
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary" />
              <span>rendering {kindLabel.toLowerCase()}…</span>
            </div>
          </div>
        )}

        {err && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11.5px] text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Render error</div>
              <div className="mt-0.5 truncate font-mono text-[10.5px] opacity-80">
                {err}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Version strip */}
      {versionCount > 1 && (
        <div className="flex items-center gap-1.5 border-t border-border-subtle bg-surface-2/30 px-3 py-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-fg-dim">
            versions
          </span>
          <div className="flex flex-wrap gap-1">
            {artifact.versions.map((ver) => (
              <button
                key={ver.id}
                onClick={() => onPickVersion(artifact.group_id, ver.version)}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-medium transition-all",
                  ver.version === v.version
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border-subtle text-fg-dim hover:border-primary/40 hover:text-fg",
                )}
                title={ver.note || "version " + ver.version}
              >
                v{ver.version}
              </button>
            ))}
          </div>
          <div className="ml-auto font-mono text-[9.5px] text-fg-dim">
            idx {currentIdx + 1}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}
