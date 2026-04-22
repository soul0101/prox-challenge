"use client";
import React, { useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
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
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`([.!?:])[ \\t]*(?=${esc}\\b)`, "g");
    out = out.replace(re, "$1\n\n");
  }
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

/**
 * Normalize markdown tables produced by a streaming LLM before handing them to
 * remark-gfm. Handles three real-world failure modes:
 *
 *   (a) Entire table on one line:
 *         "| H1 | H2 | |---|---| | a | b | | c | d |"
 *       -> split into proper rows using the delimiter row's column count.
 *
 *   (b) Body rows concatenated on one line, even though header/delimiter are
 *       on their own lines:
 *         "| 1 | foo | | 2 | bar | | 3 | baz |"
 *       -> detected by tracking active table column count across lines;
 *          split into rows once inside a table.
 *
 *   (c) Blank lines inserted between header/delimiter/body rows (GFM treats a
 *       blank line as end-of-table):
 *         "| H1 | H2 |\n\n|---|---|\n\n| a | b |"
 *       -> emit the rows contiguously, absorbing blank lines.
 *
 * Operates line-by-line with a tiny state machine (not-in-table / in-table).
 * When NOT in a table, a header row is recognized by lookahead: a pipe row
 * whose next non-blank line is a delimiter row with the same cell count.
 */
function reflowInlineTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  const rowLineRe = /^\s*\|.*\|\s*$/;
  const delimLineRe = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;
  const embeddedDelimRe = /\|\s*:?-{3,}:?\s*\|/;
  const pipeCount = (s: string) => (s.match(/\|/g) || []).length;
  const cellCount = (s: string) => Math.max(0, pipeCount(s) - 1);

  const splitByCols = (line: string, cols: number): string[] => {
    const pipes: number[] = [];
    for (let k = 0; k < line.length; k++) if (line[k] === "|") pipes.push(k);
    const perRow = cols + 1;
    if (pipes.length < perRow || pipes.length % perRow !== 0) return [];
    const rows: string[] = [];
    const n = pipes.length / perRow;
    for (let k = 0; k < n; k++) {
      const start = pipes[k * perRow];
      const end = pipes[(k + 1) * perRow - 1] + 1;
      rows.push(line.slice(start, end).trim());
    }
    return rows;
  };

  const splitConcatenated = (line: string): { prefix: string; rows: string[]; tail: string; cols: number } => {
    const delimRun = line.match(/(?:\|\s*:?-{3,}:?\s*)+\|/);
    const cols = delimRun ? (delimRun[0].match(/-{3,}/g) || []).length : 0;
    if (cols < 1) {
      const fallback = line
        .replace(/\|\s+\|/g, "|\n|")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      return { prefix: "", rows: fallback, tail: "", cols: 0 };
    }
    const pipes: number[] = [];
    for (let k = 0; k < line.length; k++) if (line[k] === "|") pipes.push(k);
    const perRow = cols + 1;
    if (pipes.length < perRow || pipes.length % perRow !== 0) {
      const fallback = line
        .replace(/\|\s+\|/g, "|\n|")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      return { prefix: "", rows: fallback, tail: "", cols };
    }
    const prefix = line.slice(0, pipes[0]).trim();
    const tail = line.slice(pipes[pipes.length - 1] + 1).trim();
    const rows: string[] = [];
    const n = pipes.length / perRow;
    for (let k = 0; k < n; k++) {
      const start = pipes[k * perRow];
      const end = pipes[(k + 1) * perRow - 1] + 1;
      rows.push(line.slice(start, end).trim());
    }
    return { prefix, rows, tail, cols };
  };

  const ensureBlankBefore = () => {
    if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
  };

  let i = 0;
  let tableCols = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (tableCols === 0) {
      // (a) A line that mashes header + delimiter (+ maybe rows) together.
      if (embeddedDelimRe.test(line) && !delimLineRe.test(line)) {
        const { prefix, rows, tail, cols } = splitConcatenated(line);
        if (prefix) out.push(prefix);
        ensureBlankBefore();
        for (const r of rows) out.push(r);
        tableCols = cols;
        if (tail) {
          // Any trailing non-table text terminates the table.
          out.push("");
          out.push(tail);
          tableCols = 0;
        }
        i++;
        continue;
      }

      // Header row followed (possibly after blank lines) by a delimiter row.
      if (rowLineRe.test(line)) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (
          j < lines.length &&
          delimLineRe.test(lines[j]) &&
          cellCount(line) === cellCount(lines[j])
        ) {
          ensureBlankBefore();
          out.push(line.trim());
          out.push(lines[j].trim());
          tableCols = cellCount(line);
          i = j + 1;
          continue;
        }
      }

      out.push(line);
      i++;
      continue;
    }

    // In-table: absorb blank lines, split concatenated rows, terminate on
    // the first non-row line.
    if (line.trim() === "") {
      // Peek ahead — if the next non-blank line is still a row, absorb the
      // blank(s). Otherwise, the table ends here.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && rowLineRe.test(lines[j])) {
        i = j;
        continue;
      }
      out.push("");
      tableCols = 0;
      i = j;
      continue;
    }

    if (rowLineRe.test(line)) {
      const perRow = tableCols + 1;
      const pc = pipeCount(line);
      if (pc > perRow && pc % perRow === 0) {
        const split = splitByCols(line, tableCols);
        if (split.length) {
          for (const r of split) out.push(r);
          i++;
          continue;
        }
      }
      out.push(line.trim());
      i++;
      continue;
    }

    // Non-row content encountered mid-table — close the table.
    out.push("");
    tableCols = 0;
    // fallthrough — re-handle this line in non-table state.
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
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

  const processed = React.useMemo(
    () => reflowInlineTables(normalizeAssistantText(text)),
    [text],
  );

  const cite = React.useCallback(
    (children: React.ReactNode) =>
      processCitations(children, docBySlug, docByTitleWord, primarySlug, onCite),
    [docBySlug, docByTitleWord, primarySlug, onCite],
  );

  const components: Components = React.useMemo(
    () => ({
      p: ({ children }) => <p>{cite(children)}</p>,
      li: ({ children }) => <li>{cite(children)}</li>,
      td: ({ children }) => <td>{cite(children)}</td>,
      th: ({ children }) => <th>{cite(children)}</th>,
      h1: ({ children }) => <h2>{cite(children)}</h2>,
      h2: ({ children }) => <h2>{cite(children)}</h2>,
      h3: ({ children }) => <h3>{cite(children)}</h3>,
      h4: ({ children }) => <h4>{cite(children)}</h4>,
      h5: ({ children }) => <h4>{cite(children)}</h4>,
      h6: ({ children }) => <h4>{cite(children)}</h4>,
      strong: ({ children }) => <strong>{cite(children)}</strong>,
      em: ({ children }) => <em>{cite(children)}</em>,
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:opacity-80"
        >
          {cite(children)}
        </a>
      ),
      table: ({ children }) => (
        <div className="my-2.5 overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full border-collapse text-[13px]">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      hr: () => <hr className="my-4 border-border-subtle" />,
    }),
    [cite],
  );

  return (
    <div className="prose-chat">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {processed}
      </Markdown>
    </div>
  );
}

/**
 * Walks React children and replaces in-string citation patterns with
 * <CitationChip/> elements. Non-string children (already-rendered <strong>,
 * <code>, etc. produced by react-markdown) pass through unchanged.
 */
function processCitations(
  children: React.ReactNode,
  docBySlug: Map<string, ManifestEntry>,
  docByTitleWord: Map<string, ManifestEntry>,
  primarySlug: string | undefined,
  onCite: (doc: string, page: number) => void,
): React.ReactNode {
  const arr = React.Children.toArray(children);
  const out: React.ReactNode[] = [];
  arr.forEach((child, i) => {
    if (typeof child === "string") {
      out.push(
        ...renderCitationString(
          child,
          docBySlug,
          docByTitleWord,
          primarySlug,
          onCite,
          `s${i}`,
        ),
      );
    } else {
      out.push(child);
    }
  });
  return out;
}

function renderCitationString(
  text: string,
  docBySlug: Map<string, ManifestEntry>,
  docByTitleWord: Map<string, ManifestEntry>,
  primarySlug: string | undefined,
  onCite: (doc: string, page: number) => void,
  keyPrefix: string,
): React.ReactNode[] {
  const citeRe =
    /\(([a-z0-9-]+)\s+p\.?\s*(\d+)\)|\[([a-z0-9-]+)\s+p\.?\s*(\d+)\]|\(p\.?\s*(\d+)\)|\[p\.?\s*(\d+)\]|page\s+(\d+)\s+of\s+the\s+([A-Z][\w\s]+)/gi;

  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = citeRe.exec(text))) {
    if (match.index > lastIdx) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-t${idx}`}>
          {text.slice(lastIdx, match.index)}
        </React.Fragment>,
      );
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
      nodes.push(
        <CitationChip
          key={`${keyPrefix}-c${idx}`}
          label={label}
          doc={doc}
          page={page}
          docTitle={docBySlug.get(doc)?.title}
          onCite={onCite}
        />,
      );
    } else {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-c${idx}`}>{match[0]}</React.Fragment>,
      );
    }
    lastIdx = match.index + match[0].length;
    idx++;
  }
  if (lastIdx < text.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}-tail`}>
        {text.slice(lastIdx)}
      </React.Fragment>,
    );
  }
  return nodes.length ? nodes : [text];
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
