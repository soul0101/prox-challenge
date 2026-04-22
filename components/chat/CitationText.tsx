"use client";
import React, { useRef, useState } from "react";
import type { ManifestEntry } from "@/lib/kb/types";

interface Props {
  text: string;
  documents: ManifestEntry[];
  onCite: (doc: string, page: number) => void;
}

/**
 * The model frequently streams multiple narration "steps" concatenated into a
 * single assistant turn — e.g.
 *   "I'll build that. Let me find the relevant pages.Now let me open the
 *    settings chart…Based on what I found, here's…"
 * without paragraph breaks. This function inserts a paragraph break in front
 * of well-known narration transitions so each step renders as its own
 * paragraph. Conservative — only acts after a sentence-ending punctuation
 * mark (with or without whitespace) so it never splits mid-sentence.
 */
function normalizeAssistantText(text: string): string {
  if (!text) return text;
  const transitions = [
    "Let me",
    "Let's",
    "Now let me",
    "Now let's",
    "Now I",
    "First, let",
    "First I",
    "Next, let",
    "Next,",
    "Then,",
    "Based on",
    "Looking at",
    "Checking",
    "Perfect",
    "Great",
    "However,",
    "I can see",
    "I'll",
    "I will",
    "Got it",
  ];
  let out = text;
  for (const t of transitions) {
    // Escape regex specials in transition phrase.
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Sentence-ender (., !, ?, or :) optionally followed by whitespace,
    // before the transition starter at a word boundary.
    const re = new RegExp(`([.!?:])[ \\t]*(?=${esc}\\b)`, "g");
    out = out.replace(re, "$1\n\n");
  }
  // Also collapse 3+ consecutive newlines down to a clean 2.
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

export function CitationText({ text, documents, onCite }: Props) {
  const docBySlug = React.useMemo(
    () => new Map(documents.map((d) => [d.slug.toLowerCase(), d])),
    [documents],
  );
  const docByTitleWord = React.useMemo(() => {
    const m = new Map<string, ManifestEntry>();
    for (const d of documents) {
      for (const w of d.title.toLowerCase().split(/\s+/)) {
        if (w.length > 3) m.set(w, d);
      }
    }
    return m;
  }, [documents]);

  const primarySlug = documents[0]?.slug;
  const blocks = normalizeAssistantText(text).split(/\n{2,}/);

  return (
    <div className="prose-chat">
      {blocks.map((block, i) => (
        <RenderBlock
          key={i}
          text={block}
          docBySlug={docBySlug}
          docByTitleWord={docByTitleWord}
          primarySlug={primarySlug}
          onCite={onCite}
        />
      ))}
    </div>
  );
}

function RenderBlock({
  text,
  docBySlug,
  docByTitleWord,
  primarySlug,
  onCite,
}: {
  text: string;
  docBySlug: Map<string, ManifestEntry>;
  docByTitleWord: Map<string, ManifestEntry>;
  primarySlug: string | undefined;
  onCite: (doc: string, page: number) => void;
}) {
  const lines = text.split(/\n/);

  const m = /^(#{1,6})\s+(.*)$/.exec(lines[0] || "");
  if (m && lines.length === 1) {
    const level = Math.min(4, m[1].length + 1);
    const inner = renderInline(m[2], docBySlug, docByTitleWord, primarySlug, onCite);
    if (level === 2) return <h2>{inner}</h2>;
    if (level === 3) return <h3>{inner}</h3>;
    return <h4>{inner}</h4>;
  }

  if (lines.every((l) => /^\s*([-*•])\s+/.test(l))) {
    return (
      <ul>
        {lines.map((l, idx) => {
          const content = l.replace(/^\s*([-*•])\s+/, "");
          return (
            <li key={idx}>
              {renderInline(content, docBySlug, docByTitleWord, primarySlug, onCite)}
            </li>
          );
        })}
      </ul>
    );
  }

  if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol>
        {lines.map((l, idx) => {
          const content = l.replace(/^\s*\d+\.\s+/, "");
          return (
            <li key={idx}>
              {renderInline(content, docBySlug, docByTitleWord, primarySlug, onCite)}
            </li>
          );
        })}
      </ol>
    );
  }

  if (lines[0]?.startsWith("```") && lines[lines.length - 1]?.startsWith("```")) {
    const body = lines.slice(1, -1).join("\n");
    return (
      <pre>
        <code>{body}</code>
      </pre>
    );
  }

  return <p>{renderInline(text, docBySlug, docByTitleWord, primarySlug, onCite)}</p>;
}

type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "cite"; doc: string; page: number; label: string; docTitle?: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string };

function parseInline(
  text: string,
  docBySlug: Map<string, ManifestEntry>,
  docByTitleWord: Map<string, ManifestEntry>,
  primarySlug: string | undefined,
): InlineNode[] {
  const nodes: InlineNode[] = [];
  const citeRe =
    /\(([a-z0-9-]+)\s+p\.?\s*(\d+)\)|\[([a-z0-9-]+)\s+p\.?\s*(\d+)\]|\(p\.?\s*(\d+)\)|\[p\.?\s*(\d+)\]|page\s+(\d+)\s+of\s+the\s+([A-Z][\w\s]+)/gi;

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = citeRe.exec(text))) {
    if (match.index > lastIdx) {
      nodes.push({ kind: "text", text: text.slice(lastIdx, match.index) });
    }
    let doc: string | undefined;
    let page: number | undefined;
    let label = match[0];

    if (match[1] && match[2]) {
      doc = match[1];
      page = Number(match[2]);
      label = `${doc} p.${page}`;
    } else if (match[3] && match[4]) {
      doc = match[3];
      page = Number(match[4]);
      label = `${doc} p.${page}`;
    } else if (match[5]) {
      doc = primarySlug;
      page = Number(match[5]);
      label = `p.${page}`;
    } else if (match[6]) {
      doc = primarySlug;
      page = Number(match[6]);
      label = `p.${page}`;
    } else if (match[7] && match[8]) {
      page = Number(match[7]);
      const title = match[8].toLowerCase();
      for (const w of title.split(/\s+/)) {
        if (docByTitleWord.has(w)) {
          doc = docByTitleWord.get(w)!.slug;
          break;
        }
      }
      doc ??= primarySlug;
      label = match[0];
    }

    if (doc && page && docBySlug.has(doc)) {
      nodes.push({
        kind: "cite",
        doc,
        page,
        label,
        docTitle: docBySlug.get(doc)?.title,
      });
    } else {
      nodes.push({ kind: "text", text: match[0] });
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push({ kind: "text", text: text.slice(lastIdx) });
  }

  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.kind !== "text") {
      out.push(n);
      continue;
    }
    const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
    let last = 0;
    let m2: RegExpExecArray | null;
    while ((m2 = re.exec(n.text))) {
      if (m2.index > last)
        out.push({ kind: "text", text: n.text.slice(last, m2.index) });
      if (m2[1]) out.push({ kind: "bold", text: m2[1] });
      else if (m2[2]) out.push({ kind: "code", text: m2[2] });
      last = m2.index + m2[0].length;
    }
    if (last < n.text.length) out.push({ kind: "text", text: n.text.slice(last) });
  }
  return out;
}

function renderInline(
  text: string,
  docBySlug: Map<string, ManifestEntry>,
  docByTitleWord: Map<string, ManifestEntry>,
  primarySlug: string | undefined,
  onCite: (doc: string, page: number) => void,
): React.ReactNode[] {
  const nodes = parseInline(text, docBySlug, docByTitleWord, primarySlug);
  return nodes.map((n, i) => {
    if (n.kind === "cite") {
      return (
        <CitationChip
          key={i}
          label={n.label}
          doc={n.doc}
          page={n.page}
          docTitle={n.docTitle}
          onCite={onCite}
        />
      );
    }
    if (n.kind === "bold") return <strong key={i}>{n.text}</strong>;
    if (n.kind === "code") return <code key={i}>{n.text}</code>;
    return <React.Fragment key={i}>{n.text}</React.Fragment>;
  });
}

function CitationChip({
  label,
  doc,
  page,
  docTitle,
  onCite,
}: {
  label: string;
  doc: string;
  page: number;
  docTitle?: string;
  onCite: (doc: string, page: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setHover(true), 160);
  };
  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHover(false);
  };

  return (
    <span className="relative inline-flex">
      <button
        className="citation-chip"
        onClick={() => onCite(doc, page)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        title={`Open ${label}`}
      >
        {label}
      </button>
      {hover && (
        <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong/70 bg-surface-2/95 px-2.5 py-1.5 text-[11px] shadow-pop backdrop-blur-xl">
          <span className="block font-medium text-fg">
            {docTitle || doc}
          </span>
          <span className="block font-mono text-[10px] text-fg-dim">
            page {page} · click to open
          </span>
        </span>
      )}
    </span>
  );
}
