# Manual Copilot

A multimodal reasoning agent for technical product manuals, built on the **Claude Agent SDK**. Drop any PDF into `files/`, run ingest, and you get a chat interface that can answer questions with real page citations, cropped diagrams, and interactive artifacts (SVGs, decision trees, custom-components) generated on the fly.

Shipped pre-ingested with a welder owner's manual as a demo corpus, but the pipeline, tools, agent, and UI are completely document-agnostic — nothing in the runtime knows or cares what the PDF is about.

## Run it

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

**Auth.** The Claude Agent SDK inherits auth from your local `claude` CLI. If you're signed in via Claude Pro/Team, no key is needed. Otherwise put `ANTHROPIC_API_KEY=sk-...` in `.env`.

The demo corpus in `knowledge/` and the rendered page PNGs in `public/sources/` are committed, so the first question works in under 60 seconds with zero pre-processing.

## Using it with your own manuals

```bash
# 1. Put your PDFs in files/
cp my-device-manual.pdf files/

# 2. Ingest (incremental — only processes new/changed files)
npm run ingest

# 3. Run
npm run dev
```

That's it. The new manual joins whatever is already in `knowledge/` and shows up in the library drawer, the suggested prompts, and the agent's retrieval scope. No code changes, no config.

```bash
npm run ingest:force    # re-ingest everything from scratch
```

## The core idea

Technical manuals' hardest content isn't text — it's diagrams, schematics, labeled photos, decision matrices. Text-embedding RAG skims right past all of it.

So this agent is **vision-first from the first second of ingest through the last second of the response**, and every answer lands in one of two verifiable channels:

- **Source-grounded pixels (select, don't generate).** When the answer *is* a picture in the manual, the agent selects real pixels from the real page, optionally cropped to the exact region. It can't hallucinate this channel — it can only point.
- **Generative code artifacts (write code, render in a sandbox).** When the answer has structure — a wiring diagram, a decision tree, a parametric calculator — the agent writes SVG / Mermaid / HTML / React TSX, and the browser renders it in a sandboxed iframe.

Every claim is verifiable: you either see the manual's own page, or you see the code the agent wrote.

## How knowledge is extracted

```
files/*.pdf
  │
  ▼
pdfjs + @napi-rs/canvas      →  one PNG per page + raw text layer
  │
  ▼
Claude Agent SDK query(), per page, with the page image
  │
  ▼                            {
  per-page record               "summary":   "...",
                                "figures":   [{caption, kind, ...}],
                                "tables":    [{title, rows}],
                                "keywords":  [...],
                                "is_mostly_visual": true/false
                              }
  │
  ▼
second query() consolidates page summaries
  │
  ▼                            map.json — sections, outline,
  per-document outline         4 suggested prompts
  │
  ▼
minisearch BM25 index over { summary, figures, tables, keywords, text }
```

The vision pass is the expensive part and runs once. Everything it produces is written to `knowledge/` — so once a manual is ingested, every subsequent query uses the structured output for free.

## How knowledge is represented

- `knowledge/manifest.json` — document registry (title, slug, page count, suggested prompts)
- `knowledge/<slug>/pages.json` — the per-page vision records above, one per PDF page
- `knowledge/<slug>/map.json` — the consolidated outline per document
- `knowledge/index.json` — the BM25 search index
- `public/sources/<slug>/p-NNN.png` — the rendered page images, served directly

At query time these are lazy-loaded into a single in-process `KnowledgeBase` object. The retrieval index is pure BM25 with field boosts (figure captions and table rows are boosted over body text) — at typical manual sizes, with this much structure, BM25 beats embeddings and needs no vector store.

## How the agent uses it

`lib/agent/runtime.ts` opens a Claude Agent SDK `query()` with a manifest-aware system prompt and an **in-process MCP server** (`createSdkMcpServer`) that exposes eight generic tools:

| tool | what it does |
|------|--------------|
| `list_documents` | enumerate ingested corpora |
| `search` | BM25 over the vision-generated index |
| `open_page` / `open_pages` | return page **images** + text + metadata back into Claude's context |
| `crop_region` | vision-locate a sub-region of a page, return a crop |
| `show_source` | emit a `source` event to the UI (pixel citation) |
| `emit_artifact` | emit an `artifact` event (svg / mermaid / html / tsx) |
| `ask_user` | emit an `ask` event with quick-reply options |

The single most important line in the whole system is `open_page` returning the **image**, not just text. Claude literally re-reads the diagram before answering — which is what lets it answer visual questions ("what does this part look like?", "which socket goes where?") correctly, not just verbally.

`show_source`, `emit_artifact`, and `ask_user` are modeled as SSE events on an in-memory `AgentEventBus`, not as tool-result text. The agent saying *"I showed it"* and the UI *actually* showing it are the same action, with zero client-side parsing.

## Design decisions worth defending

- **Vision-first ingest over text-first RAG.** One-time cost, permanent benefit. The alternative misses all image-only content, which is exactly what most hard manual questions depend on.
- **`open_page` returns the image.** Text-only would have made the whole vision-first ingest pointless at answer time.
- **Two output channels, both first-class.** Pixels for verifiable "here it is", code for "let me show you interactively". Anything the model produces is either grounded in real pixels or runs as sandboxed code the user can inspect.
- **In-process MCP server + SSE event bus.** Tools live in the same Node process as the API route, so they emit UI events directly. No socket, no protocol, no glue — the tool result *is* the UI action.
- **Sandboxed iframe with sucrase, not a Vite bundle.** One `public/artifact-runner.html` with an import map loads React / Tailwind / recharts / mermaid from esm.sh and transforms TSX in-browser with sucrase (5–10× faster than Babel-standalone). Zero build step for the sandbox; `sandbox="allow-scripts"` gives it null origin, no cookies, no same-origin privileges.
- **Claude Agent SDK with CLI auth as the default.** Reviewers with a Claude subscription skip the API-key dance entirely. API-key mode is the fallback, not the requirement.
- **Citations are parsed, not templated.** The renderer scans for `(slug p.N)` / `(p.N)` / *"page N of the Foo manual"* and turns each into a clickable chip that opens the source viewer at that page. The agent is told to cite; the UI is resilient to any form.
- **BM25 beats embeddings at this scale.** Field boosts on figure captions and table rows, on structurally rich corpora. Would reconsider at 10+ documents / 1000+ pages.
- **No auth, no session persistence, no vector DB.** Each is a deliberate subtraction to keep setup under 2 minutes.

## Architecture

```
┌─── Ingest (one-shot, document-agnostic) ────────────────────────────┐
│  files/*.pdf                                                        │
│     ├─ pdfjs + canvas → public/sources/<slug>/p-NNN.png             │
│     └─ per-page query() → pages.json (summary + figures + tables)   │
│         └─ consolidation query() → map.json (outline + prompts)     │
│     └─ minisearch → index.json                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─── Runtime (Next.js 15 single process) ─────────────────────────────┐
│  app/page.tsx            three-pane shell: chat · artifact · source │
│  app/api/chat            SSE endpoint, wraps the agent loop         │
│  app/api/manifest        library metadata                           │
│                                                                     │
│  lib/agent/runtime.ts                                               │
│    claude-agent-sdk query() with:                                   │
│      - model:   claude-sonnet-4-5 (CLAUDE_MODEL env overrides)      │
│      - system:  manifest-aware outline + tone rules                 │
│      - tools:   in-process MCP server (8 generic tools)             │
│    message stream → AgentEventBus → SSE                             │
│                                                                     │
│  public/artifact-runner.html                                        │
│    sandboxed iframe (allow-scripts, null origin)                    │
│    React 18 + Tailwind + sucrase + mermaid + recharts via esm.sh    │
│    postMessage: parent → {render, kind, code}                       │
│                 iframe → {ready | rendered | error}                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Project layout

```
app/
  page.tsx                       three-pane shell
  api/chat/route.ts              SSE endpoint wrapping the agent loop
  api/manifest/route.ts          library metadata
components/
  chat/                          chat stream, citations, tool chips, voice
  artifact/Panel.tsx             iframe host for artifacts
  source/Viewer.tsx              page viewer with prev/next
  library/Drawer.tsx             manifest + section outline
lib/
  agent/                         runtime, tools, system prompt, event bus
  kb/                            pdf rendering, vision pass, search, crop
scripts/
  ingest.ts                      the generic ingest runner
public/
  artifact-runner.html           sandboxed iframe runtime
  sources/<slug>/p-NNN.png       rendered page images (committed)
knowledge/
  manifest.json · <slug>/pages.json · <slug>/map.json · index.json
```

## Running against a different model

```bash
CLAUDE_MODEL=opus     npm run dev       # runtime
INGEST_MODEL=sonnet   npm run ingest    # ingest
```
