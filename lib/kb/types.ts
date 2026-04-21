export interface Figure {
  kind: string;
  caption: string;
  keywords: string[];
  /** normalised [x0,y0,x1,y1] in 0..1 page coords, if the vision pass could localise it */
  bbox_hint?: [number, number, number, number];
}

export interface Table {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface PageRecord {
  doc: string;
  page: number;
  width: number;
  height: number;
  text: string;
  summary: string;
  section_hint: string;
  figures: Figure[];
  tables: Table[];
  keywords: string[];
  is_mostly_visual: boolean;
  image_path: string;
}

export interface DocMapSection {
  title: string;
  pages: [number, number];
  children?: DocMapSection[];
}

export interface DocMap {
  slug: string;
  title: string;
  page_count: number;
  sections: DocMapSection[];
  suggested_prompts: string[];
}

export interface ManifestEntry {
  slug: string;
  title: string;
  source_file: string;
  page_count: number;
  hash: string;
  ingested_at: string;
  kind: "pdf" | "image" | "html";
  map: DocMap;
}

export interface Manifest {
  version: 1;
  generated_at: string;
  documents: ManifestEntry[];
}

export interface SearchHit {
  doc: string;
  doc_title: string;
  page: number;
  summary: string;
  section_hint: string;
  snippet: string;
  figures: string[];
  score: number;
}
