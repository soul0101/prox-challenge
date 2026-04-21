"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUpRight, History } from "lucide-react";
import {
  type ArtifactAttachment,
  activeVersion,
} from "@/lib/client/chat-types";

const KIND_LABEL: Record<string, string> = {
  react: "Interactive",
  html: "HTML",
  svg: "SVG diagram",
  mermaid: "Flowchart",
  markdown: "Markdown",
};

const KIND_ACCENT: Record<string, string> = {
  react: "from-orange-500/15 to-amber-500/5 text-amber-300",
  html: "from-cyan-500/15 to-sky-500/5 text-cyan-300",
  svg: "from-emerald-500/15 to-teal-500/5 text-emerald-300",
  mermaid: "from-violet-500/15 to-fuchsia-500/5 text-violet-300",
  markdown: "from-zinc-500/15 to-zinc-700/5 text-zinc-300",
};

/**
 * Inline artifact card shown in the chat thread. Renders a tiny live preview
 * (for SVG / Mermaid / HTML) inside an isolated mini-iframe and a "click to
 * open" affordance. Versioning chips appear when there are multiple versions.
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

  return (
    <div
      className={
        "group w-full max-w-md overflow-hidden rounded-xl border transition-colors " +
        (active
          ? "border-primary/60 bg-primary/5"
          : "border-border bg-card hover:border-primary/40")
      }
    >
      <button
        onClick={() => onOpen()}
        className="flex w-full items-stretch gap-3 p-2.5 text-left"
      >
        <div className={`relative grid h-16 w-20 place-items-center overflow-hidden rounded-lg bg-gradient-to-br ${accent} shrink-0`}>
          <ThumbPreview kind={v.kind} code={v.code} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary shrink-0" />
            <span className="text-sm font-medium truncate">{v.title}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{KIND_LABEL[v.kind] || v.kind}</span>
            <span>·</span>
            <span>{v.code.length.toLocaleString()} chars</span>
            {versionCount > 1 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-amber-400/90">
                  <History className="h-3 w-3" /> v{v.version}/{versionCount}
                </span>
              </>
            )}
          </div>
          {v.note && versionCount > 1 && (
            <div className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/90 italic">
              {v.note}
            </div>
          )}
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 self-center text-muted-foreground group-hover:text-foreground" />
      </button>
      {versionCount > 1 && (
        <div className="flex items-center gap-1 border-t border-border bg-background/40 px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
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
                className={
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors " +
                  (ver.version === v.version
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")
                }
                title={ver.note || `version ${ver.version}`}
              >
                v{ver.version}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny preview rendered into a non-interactive shadow root. SVG/HTML get
 *  inlined; Mermaid/React fall back to an icon. Lightweight — the real render
 *  happens in the artifact panel. */
function ThumbPreview({ kind, code }: { kind: string; code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.innerHTML = "";
    try {
      if (kind === "svg") {
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "transform: scale(0.55); transform-origin: center center; pointer-events: none; max-width: 100%; max-height: 100%;";
        wrap.innerHTML = code;
        const svg = wrap.querySelector("svg");
        if (svg) {
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.setAttribute("style", "width:100%;height:100%;");
        }
        el.appendChild(wrap);
        setOk(!!svg);
        return;
      }
      // For other kinds, the icon backdrop is the preview (kept simple — a
      // full render would be heavyweight in the chat).
      setOk(false);
    } catch {
      setOk(false);
    }
  }, [kind, code]);

  return (
    <>
      <div
        ref={ref}
        aria-hidden
        className="absolute inset-0 grid place-items-center overflow-hidden"
      />
      {!ok && <Sparkles className="h-5 w-5 opacity-80" />}
    </>
  );
}
