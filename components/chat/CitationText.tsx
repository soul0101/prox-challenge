"use client";
import React from "react";
import type { ManifestEntry } from "@/lib/kb/types";

interface Props {
  text: string;
  documents: ManifestEntry[];
  onCite: (doc: string, page: number) => void;
}

/**
 * Lightly render markdown-ish assistant text: bold, headings, lists, code,
 * and — most importantly — detect citations and make them clickable chips.
 *
 * Citation forms recognised:
 *   (owner-manual p.17)   → slug + page
 *   (p. 17)               → page-only: resolves to primary doc
 *   page 17 of the Owner Manual  → page + fuzzy-match on doc title
 *   [p.17]                → same as (p.17)
 */
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

  // Split the text into paragraph-level blocks, preserving newlines.
  const blocks = text.split(/\n{2,}/);

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

  // Heading?
  const m = /^(#{1,6})\s+(.*)$/.exec(lines[0] || "");
  if (m && lines.length === 1) {
    const level = Math.min(4, m[1].length + 1);
    const inner = renderInline(m[2], docBySlug, docByTitleWord, primarySlug, onCite);
    if (level === 2) return <h2>{inner}</h2>;
    if (level === 3) return <h3>{inner}</h3>;
    return <h4>{inner}</h4>;
  }

  // Bullet list?
  if (lines.every((l) => /^\s*([-*•])\s+/.test(l))) {
    return (
      <ul>
        {lines.map((l, idx) => {
          const content = l.replace(/^\s*([-*•])\s+/, "");
          return <li key={idx}>{renderInline(content, docBySlug, docByTitleWord, primarySlug, onCite)}</li>;
        })}
      </ul>
    );
  }

  // Ordered list?
  if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol>
        {lines.map((l, idx) => {
          const content = l.replace(/^\s*\d+\.\s+/, "");
          return <li key={idx}>{renderInline(content, docBySlug, docByTitleWord, primarySlug, onCite)}</li>;
        })}
      </ol>
    );
  }

  // Fenced code block?
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

type InlineNode = { kind: "text"; text: string } | { kind: "cite"; doc: string; page: number; label: string } | { kind: "bold"; text: string } | { kind: "code"; text: string };

function parseInline(
  text: string,
  docBySlug: Map<string, ManifestEntry>,
  docByTitleWord: Map<string, ManifestEntry>,
  primarySlug: string | undefined,
): InlineNode[] {
  // Citations first — they can contain spaces and numbers and punctuation.
  const nodes: InlineNode[] = [];
  const citeRe = /\(([a-z0-9-]+)\s+p\.?\s*(\d+)\)|\[([a-z0-9-]+)\s+p\.?\s*(\d+)\]|\(p\.?\s*(\d+)\)|\[p\.?\s*(\d+)\]|page\s+(\d+)\s+of\s+the\s+([A-Z][\w\s]+)/gi;

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
      // Fuzzy match doc by title words
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
      nodes.push({ kind: "cite", doc, page, label });
    } else {
      nodes.push({ kind: "text", text: match[0] });
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push({ kind: "text", text: text.slice(lastIdx) });
  }

  // Secondary pass: bold / code inside the text nodes.
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
      if (m2.index > last) out.push({ kind: "text", text: n.text.slice(last, m2.index) });
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
        <button
          key={i}
          className="citation-chip"
          onClick={() => onCite(n.doc, n.page)}
          title={`Open ${n.label}`}
        >
          {n.label}
        </button>
      );
    }
    if (n.kind === "bold") return <strong key={i}>{n.text}</strong>;
    if (n.kind === "code") return <code key={i}>{n.text}</code>;
    return <React.Fragment key={i}>{n.text}</React.Fragment>;
  });
}
