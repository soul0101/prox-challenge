import MiniSearch from "minisearch";
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

const SEARCH_OPTIONS = {
  boost: BOOST,
  prefix: true,
  fuzzy: 0.15,
};

export function createIndex(docs: IndexDoc[]): MiniSearch<IndexDoc> {
  const ms = new MiniSearch<IndexDoc>({
    idField: "id",
    fields: INDEX_FIELDS as string[],
    storeFields: STORE_FIELDS,
    searchOptions: SEARCH_OPTIONS,
  });
  ms.addAll(docs);
  return ms;
}

export function loadIndexFromJSON(json: unknown): MiniSearch<IndexDoc> {
  return MiniSearch.loadJS(json as any, {
    idField: "id",
    fields: INDEX_FIELDS as string[],
    storeFields: STORE_FIELDS,
    searchOptions: SEARCH_OPTIONS,
  });
}

export function hitsFromResults(
  ms: MiniSearch<IndexDoc>,
  query: string,
  opts: { top_k?: number; doc?: string } = {},
): SearchHit[] {
  const results = ms.search(query, {
    filter: opts.doc ? (r) => (r as any).doc === opts.doc : undefined,
  });
  const top = results.slice(0, opts.top_k ?? 6);
  return top.map((r) => {
    const summary = String((r as any).summary || "");
    const figureText = String((r as any).figure_text || "");
    const snippet = summary.slice(0, 280);
    return {
      doc: String((r as any).doc),
      doc_title: String((r as any).doc_title),
      page: Number((r as any).page),
      summary,
      section_hint: String((r as any).section_hint || ""),
      snippet,
      figures: figureText
        .split(" \n ")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
      score: Number((r as any).score),
    };
  });
}
