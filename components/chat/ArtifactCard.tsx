"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowUpRight,
  History,
  Code2,
  FileCode,
  Shapes,
  Workflow,
  FileText,
} from "lucide-react";
import {
  type ArtifactAttachment,
  activeVersion,
} from "@/lib/client/chat-types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  react: "Interactive",
  html: "HTML",
  svg: "SVG diagram",
  mermaid: "Diagram",
  markdown: "Markdown",
  flowchart: "Interactive flow",
};

const KIND_ACCENT: Record<
  string,
  { grad: string; text: string; ring: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  react: {
    grad: "from-orange-500/25 via-amber-500/10 to-transparent",
    text: "text-amber-200",
    ring: "ring-amber-500/30",
    Icon: Code2,
  },
  html: {
    grad: "from-cyan-500/25 via-sky-500/10 to-transparent",
    text: "text-cyan-200",
    ring: "ring-cyan-500/30",
    Icon: FileCode,
  },
  svg: {
    grad: "from-emerald-500/25 via-teal-500/10 to-transparent",
    text: "text-emerald-200",
    ring: "ring-emerald-500/30",
    Icon: Shapes,
  },
  mermaid: {
    grad: "from-violet-500/25 via-fuchsia-500/10 to-transparent",
    text: "text-violet-200",
    ring: "ring-violet-500/30",
    Icon: Workflow,
  },
  flowchart: {
    grad: "from-orange-500/25 via-amber-500/10 to-transparent",
    text: "text-orange-200",
    ring: "ring-orange-500/30",
    Icon: Workflow,
  },
  markdown: {
    grad: "from-zinc-500/20 via-zinc-500/5 to-transparent",
    text: "text-zinc-200",
    ring: "ring-zinc-500/30",
    Icon: FileText,
  },
};

/**
 * Inline artifact card shown in the chat thread. Shows a live mini-preview
 * for svg/html/markdown (safe, static kinds). Mermaid/React fall back to an
 * animated kind glyph since their runtimes are heavier.
 */
export function ArtifactCard({
  artifact,
  active,
  onOpen,
}: {
  artifact: ArtifactAttachment;
  active: boolean;
  onOpen: (version?: number) => void;
}) {
  const v = activeVersion(artifact);
  const versionCount = artifact.versions.length;
  const accent = KIND_ACCENT[v.kind] || KIND_ACCENT.markdown;
  const { Icon } = accent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative w-full max-w-md overflow-hidden rounded-2xl border transition-colors",
        active
          ? "border-primary/60 bg-primary/[0.05] shadow-brand"
          : "border-border-subtle bg-surface-1/70 hover:border-primary/40",
      )}
    >
      {/* Active left-side ribbon */}
      {active && (
        <div className="pointer-events-none absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-gradient-to-b from-primary via-primary to-primary/60" />
      )}

      <button
        onClick={() => onOpen()}
        className="flex w-full flex-col items-stretch gap-0 text-left"
      >
        {/* Preview */}
        <div
          className={cn(
            "relative h-28 w-full overflow-hidden border-b border-border-subtle bg-gradient-to-br",
            accent.grad,
          )}
        >
          <ThumbPreview kind={v.kind} code={v.code} Icon={Icon} />
          <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border-subtle bg-background/70 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-fg-muted backdrop-blur">
            {KIND_LABEL[v.kind] || v.kind}
          </div>
          {versionCount > 1 && (
            <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-background/70 px-1.5 py-0.5 font-mono text-[9.5px] text-primary backdrop-blur">
              <History className="h-2.5 w-2.5" /> v{v.version}/{versionCount}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 ring-1",
              accent.text,
              accent.ring,
            )}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{v.title}</div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] text-fg-dim">
              <span>{v.code.length.toLocaleString()} chars</span>
              {v.note && versionCount > 1 && (
                <>
                  <span>·</span>
                  <span className="truncate italic normal-case">{v.note}</span>
                </>
              )}
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-fg-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary">
            Open <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>

      {/* Version dots */}
      {versionCount > 1 && (
        <div className="flex items-center gap-1.5 border-t border-border-subtle bg-surface-1/70 px-3 py-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-fg-dim">
            versions
          </span>
          <div className="flex flex-wrap gap-1">
            {artifact.versions.map((ver) => (
              <button
                key={ver.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(ver.version);
                }}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-medium transition-all",
                  ver.version === v.version
                    ? "border-primary/60 bg-primary/15 text-primary shadow-[0_0_8px_hsl(var(--brand-glow))]"
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
    </motion.div>
  );
}

/**
 * Miniature live preview for safe, static artifact kinds. SVG gets inlined,
 * markdown renders as plain text with truncation, HTML mounts into a clipped
 * wrapper (scripts stripped — we keep this tiny, it's an overview only).
 * React / Mermaid fall back to a breathing glyph.
 */
function ThumbPreview({
  kind,
  code,
  Icon,
}: {
  kind: string;
  code: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.innerHTML = "";
    setRendered(false);

    // Keep the previews cheap — skip huge artifacts.
    if (code.length > 40_000) return;

    try {
      if (kind === "svg") {
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "width:100%;height:100%;display:grid;place-items:center;pointer-events:none;";
        wrap.innerHTML = code;
        const svg = wrap.querySelector("svg");
        if (svg) {
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.setAttribute("style", "width:100%;height:100%;max-width:100%;max-height:100%;");
        }
        el.appendChild(wrap);
        setRendered(!!svg);
        return;
      }
      if (kind === "html" && code.length < 8_000) {
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "transform:scale(0.42);transform-origin:top left;width:238%;height:238%;pointer-events:none;color:hsl(var(--fg));font-size:13px;";
        // Strip script tags for safety — this is a preview only.
        wrap.innerHTML = code.replace(/<script[\s\S]*?<\/script>/gi, "");
        el.appendChild(wrap);
        setRendered(true);
        return;
      }
      if (kind === "markdown" && code.length < 2_000) {
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "padding:10px 12px;font-size:10.5px;line-height:1.45;color:hsl(var(--fg-muted));white-space:pre-wrap;overflow:hidden;height:100%;";
        wrap.textContent = code.slice(0, 320);
        el.appendChild(wrap);
        setRendered(true);
        return;
      }
    } catch {
      setRendered(false);
    }
  }, [kind, code]);

  return (
    <>
      <div
        ref={ref}
        aria-hidden
        className="absolute inset-0 overflow-hidden"
      />
      {!rendered && (
        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Icon className="h-8 w-8 opacity-80" />
          </motion.div>
        </div>
      )}
    </>
  );
}
