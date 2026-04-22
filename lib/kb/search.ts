import MiniSearch from "minisearch";
import { stemmer } from "stemmer";
import type { PageRecord, SearchHit } from "./types";

export interface IndexDoc {
  id: string;
  doc: string;
  doc_title: string;
  page: number;
  section_hint: string;
  summary: string;
  text: string;
  keywords: string;
  /** captions + figure keywords */
  figure_text: string;
  /** kinds only (e.g. "schematic", "photo", "chart") so kind-typed queries hit */
  figure_kinds: string;
  /** table titles, separately so they outrank cell text */
  table_titles: string;
  /** column headers + row cells */
  table_text: string;
}

export const INDEX_FIELDS: (keyof IndexDoc)[] = [
  "summary",
  "text",
  "keywords",
  "figure_text",
  "figure_kinds",
  "table_titles",
  "table_text",
  "section_hint",
];

const BOOST = {
  summary: 2,
  keywords: 2.2,
  figure_text: 1.8,
  figure_kinds: 1.5,
  table_titles: 2.5,
  table_text: 1.4,
  text: 1,
  section_hint: 1.1,
};

export function pageToIndexDoc(page: PageRecord, docTitle: string): IndexDoc {
  const figureText = page.figures
    .map((f) => `${f.caption} ${f.keywords.join(" ")}`)
    .join(" \n ");
  const figureKinds = page.figures
    .map((f) => f.kind)
    .filter(Boolean)
    .concat(page.is_mostly_visual ? ["visual", "diagram"] : [])
    .join(" ");
  const tableTitles = page.tables.map((t) => t.title).filter(Boolean).join(" \n ");
  const tableText = page.tables
    .map(
      (t) =>
        `${t.columns.join(" ")} ${t.rows.map((r) => r.join(" ")).join(" \n ")}`,
    )
    .join(" \n ");
  return {
    id: `${page.doc}#${page.page}`,
    doc: page.doc,
    doc_title: docTitle,
    page: page.page,
    section_hint: page.section_hint,
    summary: page.summary,
    text: page.text,
    keywords: page.keywords.join(" "),
    figure_text: figureText,
    figure_kinds: figureKinds,
    table_titles: tableTitles,
    table_text: tableText,
  };
}

const STORE_FIELDS = [
  "doc",
  "doc_title",
  "page",
  "section_hint",
  "summary",
  "figure_text",
] as (keyof IndexDoc)[];

/**
 * Fold morphology into a shared root — "welding", "welded", "welds" → "weld" —
 * so queries match regardless of tense/plural. Preserve all-caps tokens
 * (DCEP, FCAW, MIG) verbatim: they're codes, not words, and Porter mangles
 * them ("FCAW" → "fcaw" still fine, but "AC" → "ac" is OK; we just guard
 * against over-stemming 2–3 letter abbreviations that happen to end in "s").
 *
 * Applied identically at index and query time, so the query token shape always
 * matches the index. Paired with `prefix: true` (catches longer derivations
 * the stemmer left alone) and `fuzzy: 0.15` (catches typos).
 */
function processTerm(term: string): string | null {
  const t = term.toLowerCase();
  if (!t || t.length < 2) return null;
  if (/^[a-z0-9]{2,5}$/i.test(term) && term === term.toUpperCase()) {
    // Short all-caps token: probably a code / abbreviation. Don't stem.
    return t;
  }
  return stemmer(t);
}

const SEARCH_OPTIONS = {
  boost: BOOST,
  prefix: true,
  fuzzy: 0.15,
  processTerm,
};

const INDEX_OPTIONS = {
  idField: "id" as const,
  fields: INDEX_FIELDS as string[],
  storeFields: STORE_FIELDS,
  processTerm,
  searchOptions: SEARCH_OPTIONS,
};

export function createIndex(docs: IndexDoc[]): MiniSearch<IndexDoc> {
  const ms = new MiniSearch<IndexDoc>(INDEX_OPTIONS);
  ms.addAll(docs);
  return ms;
}

export function loadIndexFromJSON(json: unknown): MiniSearch<IndexDoc> {
  return MiniSearch.loadJS(json as any, INDEX_OPTIONS);
}

function resultToHit(r: any): SearchHit {
  const summary = String(r.summary || "");
  const figureText = String(r.figure_text || "");
  return {
    doc: String(r.doc),
    doc_title: String(r.doc_title),
    page: Number(r.page),
    summary,
    section_hint: String(r.section_hint || ""),
    snippet: summary.slice(0, 280),
    figures: figureText
      .split(" \n ")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3),
    score: Number(r.score),
  };
}

export function hitsFromResults(
  ms: MiniSearch<IndexDoc>,
  query: string,
  opts: { top_k?: number; doc?: string } = {},
): SearchHit[] {
  const results = ms.search(query, {
    filter: opts.doc ? (r) => (r as any).doc === opts.doc : undefined,
  });
  return results.slice(0, opts.top_k ?? 6).map(resultToHit);
}

/**
 * Run several paraphrased queries and fuse their results into one ranked list.
 *
 * The orchestrator (Sonnet) expands the user question into 2–4 variants
 * (synonyms, abbreviation expansions, jargon forms) and hands them here. For
 * each page, we take the MAX score across variants — a page that ranked #1
 * under any paraphrase deserves to surface — plus a small multi-hit bonus so
 * pages that land under multiple paraphrases edge out single-variant hits.
 *
 * Deduped by `doc#page`. Cheaper than making the agent issue N tool calls.
 */
export function hitsFromQueries(
  ms: MiniSearch<IndexDoc>,
  queries: string[],
  opts: { top_k?: number; doc?: string } = {},
): SearchHit[] {
  const clean = queries.map((q) => q.trim()).filter(Boolean);
  if (clean.length === 0) return [];
  if (clean.length === 1) return hitsFromResults(ms, clean[0], opts);

  const filter = opts.doc ? (r: any) => r.doc === opts.doc : undefined;
  const merged = new Map<string, { hit: SearchHit; matches: number }>();

  for (const q of clean) {
    for (const r of ms.search(q, { filter })) {
      const id = `${(r as any).doc}#${(r as any).page}`;
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, { hit: resultToHit(r), matches: 1 });
      } else {
        existing.matches += 1;
        const score = Number((r as any).score);
        if (score > existing.hit.score) existing.hit.score = score;
      }
    }
  }

  // Small multi-match bonus: 1.0× for 1 paraphrase, 1.15× for 2, 1.25× for 3+.
  // Rewards pages that multiple paraphrases agree on, without letting a weak
  // match beat a strong single-variant hit.
  const bonus = (n: number) => (n <= 1 ? 1 : n === 2 ? 1.15 : 1.25);
  const ranked = [...merged.values()]
    .map((v) => ({ ...v.hit, score: v.hit.score * bonus(v.matches) }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, opts.top_k ?? 6);
}
