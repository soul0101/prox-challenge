# Manual Copilot — multimodal agent for the Vulcan OmniPro 220

A reasoning agent built on the **Claude Agent SDK** that turns a stack of product manuals into an expert you can talk to. Ships pre-ingested with the Vulcan OmniPro 220 owner's manual, quick-start guide, and selection chart — but the pipeline is **document-agnostic**: drop any PDF into `files/`, re-run ingest, and it works the same.

<img src="product.webp" alt="Vulcan OmniPro 220" width="380" /> <img src="product-inside.webp" alt="Vulcan OmniPro 220 — inside panel" width="380" />

## Why this isn't just RAG

A welder manual's hardest content doesn't exist as text. Polarity diagrams. Socket photos. Weld-diagnosis charts. Wiring schematics. Duty-cycle matrices. A text-embedding RAG system skims right past all of it.

This agent is **vision-first from the first second of ingest through the last second of the response**:

1. **Ingest.** Every page is rendered to PNG and fed to Claude as an image. Claude emits a structured record per page — summary, **figure captions**, **tables** (as real rows), keywords, a flag for "this page is mostly visual". That record is indexed for search.
2. **Retrieval.** BM25 over the vision-generated index — so a query like *"what does porosity look like?"* can hit the page because Claude's extraction captioned the photo with that phrase.
3. **Answering.** The runtime agent's `open_page` tool returns **the full page image** back into Claude's context. Claude literally re-reads the diagram before answering.
4. **Presenting.** Two first-class multimodal output channels:
   - **`show_source`** selects real pixels from the manual (optionally cropped to the exact region). The agent can't hallucinate — it's pointing at the source.
   - **`emit_artifact`** streams code (SVG / Mermaid / HTML / React TSX) into a sandboxed iframe. Interactive calculators, decision trees, labeled diagrams — Claude writes the code, the browser runs it.

## Quick start

```bash
git clone <your-fork>
cd prox-challenge
npm install
npm run dev
```

Open **http://localhost:3000**.

**Auth:** the app uses the Claude Agent SDK, which inherits auth from your local `claude` CLI login. If you have a Claude Pro/Team subscription and `claude` is logged in, it just works. Otherwise, put `ANTHROPIC_API_KEY=sk-...` in a `.env` file.

The `knowledge/` directory and rendered page images in `public/sources/` are committed, so the first question you ask works in under 60 seconds with no pre-processing.

### Re-ingesting (only needed if you change `files/`)

```bash
npm run ingest          # incremental (skips files whose hashes haven't changed)
npm run ingest:force    # re-ingest everything
```

Drop a different manual into `files/` and it'll become part of the copilot's knowledge base alongside the OmniPro — the rest of the app (agent, tools, UI) is unchanged.

## What the demo looks like

Ask:

- *"What's the duty cycle for MIG welding at 200A on 240V?"* → text answer with the exact number (25%), a citation chip to p.7 of the owner manual, the cropped spec row inline, and a **React artifact calculator** that lets you slide voltage/mode/current and see the duty cycle update in real time.
- *"I'm getting porosity in my flux-cored welds. What should I check?"* → a **Mermaid decision tree** rooted at "porosity", branching into checks (gas coverage, wire type, contamination, travel speed) with the manual page cited at each leaf — plus the manual's weld-diagnosis photo surfaced inline.
- *"What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?"* → confident text answer, a **cropped region** of the polarity diagram on p.24, and optionally an **SVG of the socket layout** with labels.
- Ambiguous: *"How do I weld?"* → the agent calls `ask_user` and renders quick-reply buttons (MIG / TIG / Stick / Flux-Cored) instead of hallucinating.

Every factual claim gets a **clickable page chip**. Click one → the source viewer pane opens to that page with prev/next paging.

## Architecture

```
┌─── Ingest pipeline (one-shot, document-agnostic) ──────────────────────────┐
│                                                                            │
│  files/ ─► pdf.ts  ─► p-001.png, p-002.png, …    (pdfjs + @napi-rs/canvas) │
│                 └─► raw text layer                                         │
│                                                                            │
│  For each page: claude-agent-sdk query() with Read tool                    │
│    → Claude sees the image, returns { summary, figures, tables,            │
│                                       keywords, is_mostly_visual, … }      │
│                                                                            │
│  Another query() consolidates page summaries → map.json (outline)          │
│                                 + 4 suggested prompts per document         │
│                                                                            │
│  BM25 index (minisearch) over summaries / figures / tables / text          │
│                                                                            │
│  Output: knowledge/manifest.json · knowledge/<slug>/{pages,map}.json       │
│          knowledge/index.json    · public/sources/<slug>/p-NNN.png         │
└────────────────────────────────────────────────────────────────────────────┘

┌─── Runtime (Next.js 15 single process) ────────────────────────────────────┐
│                                                                            │
│  app/page.tsx        → three-pane shell: chat · artifact iframe · source   │
│  app/api/chat        → SSE endpoint, wraps the agent loop                  │
│  app/api/manifest    → serves the library metadata                         │
│                                                                            │
│  lib/agent/runtime.ts                                                      │
│    claude-agent-sdk query() with:                                          │
│      - model:  claude-sonnet-4-5  (CLAUDE_MODEL env overrides)             │
│      - system: generated from manifest → outline + rules                   │
│      - tools:  in-process MCP server exposing 8 generic tools              │
│                                                                            │
│  Tools (lib/agent/tools.ts) — all document-agnostic:                       │
│    list_documents     enumerate ingested corpora                           │
│    search             BM25 over the vision-generated index                 │
│    open_page(s)       return page IMAGES + text + metadata                 │
│    crop_region        vision-locate a sub-region and return a crop         │
│    show_source        emit a 'source' SSE event to the UI                  │
│    emit_artifact      emit an 'artifact' SSE event (svg/mermaid/html/tsx)  │
│    ask_user           emit an 'ask' SSE event with quick-reply options     │
│                                                                            │
│  public/artifact-runner.html                                               │
│    sandboxed iframe (sandbox="allow-scripts"), null origin                 │
│    bundled: React 18, Tailwind, sucrase (in-browser TSX), mermaid,         │
│             recharts, lucide-react, framer-motion, marked                  │
│    postMessage protocol: parent → { render, kind, code }                   │
│                          iframe → { ready | rendered | error }             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Why Claude "drawing" works without generating images

Two orthogonal channels, both first-class:

- **Source-grounded pixels (select, don't generate).** When the answer is a photo in the manual — a defective weld, a wiring harness, the front panel — `show_source` surfaces real pixels. The agent cannot hallucinate this channel; it can only point.
- **Generative code artifacts (write code, render in sandbox).** When the answer has structure — a socket map, a decision tree, a parametric calculator — the agent writes code and the browser renders it. React TSX is transformed in-browser with `sucrase` (5–10× faster than Babel-standalone), mounted with an error boundary inside a sandboxed iframe. Artifact code can't touch the parent document, can't read cookies, can't phone home.

This means **every claim is verifiable**: either you see the manual's own page, or you see the code the agent wrote.

### Key design decisions and trade-offs

- **Vision-first ingest, not text-first.** The per-page Claude call costs money once, then every query is free to use the structured output forever. Reviewers see it as a committed `knowledge/` directory, so the 2-minute setup holds. The alternative — embedding-based text RAG — misses all image-only content, which is exactly the content this manual's hardest questions depend on.
- **Claude Agent SDK with `claude` CLI auth.** Reviewers with a Claude subscription don't need an API key at all. The SDK spawns `claude` as a subprocess per query; the message stream is mapped to SSE events. In-process MCP server (`createSdkMcpServer`) exposes custom tools with zero wire-protocol overhead.
- **`open_page` returns the page image, not just text.** Claude literally re-reads the page. This is the thing that makes the agent answer "what does porosity look like?" correctly: it sees the photo.
- **SSE with a shared event bus.** Tools run in the same Node process as the API route, so they emit events directly onto an in-memory bus that the SSE stream drains. `show_source`/`emit_artifact`/`ask_user` are modeled as SSE events, not tool-result text — the agent says "I showed it" and the UI actually shows it, without any client-side parsing.
- **Sandboxed iframe with sucrase, not a Vite bundle.** A single `public/artifact-runner.html` with an import map loads React/Tailwind/recharts/mermaid from esm.sh and transforms TSX in-browser. Zero build step for the sandbox. The iframe is `sandbox="allow-scripts"` (null origin, no cookies, no same-origin privileges).
- **Citations are parsed, not templated.** The chat renderer scans for `(slug p.N)` / `(p.N)` / "page N of the Foo Manual" and turns them into clickable chips. The agent is instructed to cite but the UI is resilient to any form.
- **Voice input is a one-line Web Speech API toggle.** Push-to-talk, no backend involvement. Keeps the setup story to "npm install && npm run dev".

### What's explicitly *not* done (and why)

- **No authentication / multi-tenancy.** Single-user tool, local-only. The `claude` CLI's auth is the auth.
- **No vector embeddings.** BM25 over vision-generated field boosts beats embeddings on a corpus this small with such structured content (figure captions, table rows, part names). Would reconsider at 10+ documents / 1000+ pages.
- **No session persistence across reloads.** Intentional — keeps the demo UX clean. Add a sqlite or IndexedDB layer if you want it.
- **No ingest-time retries per page.** Vision pass uses bounded concurrency; a single-page failure falls back to OCR-text-only for that page. Full ingest of the OmniPro corpus (51 pages) completes in ~2 minutes.

## Project layout

```
app/
  page.tsx                       three-pane shell
  api/chat/route.ts              SSE endpoint wrapping the agent loop
  api/manifest/route.ts          library metadata
  layout.tsx · globals.css       shell + design tokens
components/
  chat/                          chat stream, citations, tool chips, voice
  artifact/Panel.tsx             iframe host for artifacts
  source/Viewer.tsx              page viewer with prev/next
  library/Drawer.tsx             manifest + section outline
lib/
  agent/
    runtime.ts                   query() ↔ SSE event mapping
    tools.ts                     MCP tool definitions (all generic)
    system.ts                    manifest-aware system prompt
    sdk-query.ts                 thin wrapper + JSON extractor
    models.ts                    model selection (CLAUDE_MODEL env)
    events.ts                    AgentEventBus → SSE events
  kb/
    pdf.ts                       pdfjs + @napi-rs/canvas renderer
    vision.ts                    analysePage · buildDocMap · locateRegion
    search.ts                    minisearch index + hit rendering
    crop.ts                      sharp-based page region crop (cached)
    load.ts                      KB loader (cached per-process)
    paths.ts · types.ts
scripts/
  ingest.ts                      the generic ingest runner
public/
  artifact-runner.html           sandboxed iframe runtime
  sources/<slug>/p-NNN.png       rendered page images (committed)
  crops/<slug>/…                 on-demand crops (generated at runtime)
knowledge/
  manifest.json                  document index (committed)
  <slug>/pages.json              per-page vision records
  <slug>/map.json                outline + suggested prompts
  index.json                     BM25 index
```

## Running against a different model

```bash
# Runtime
CLAUDE_MODEL=opus npm run dev     # or sonnet (default), haiku, or a full model id

# Ingest
INGEST_MODEL=sonnet npm run ingest
```

## Testing it yourself

The README examples are the best place to start; they're baked in as suggested prompts on the welcome screen. A few harder ones that also work:

- *"I've got a 1/8″ mild steel fillet weld on 240V single phase. What settings should I dial in?"* — needs cross-referencing the selection chart + operating charts
- *"Show me the wire feed tensioner."* — pure visual retrieval, proves vision-in-the-loop
- *"What does a weld with too much wire speed look like?"* — photo-only answer

## Notes on deploying

This runs clean on Vercel or Railway. Two caveats:

1. The `claude` CLI subprocess works in any Node host but is heaviest under cold start. Warm a single worker or keep the instance alive.
2. `@napi-rs/canvas` and `sharp` both need prebuilt binaries for the deploy target (Linux x64 or arm64 generally). Vercel handles both automatically.

---

Built for the Prox Founding Engineer Challenge. The Claude Agent SDK does the heavy lifting; the design choices here — vision-first ingest, two-channel multimodal output, in-process MCP tools mapped onto an SSE event bus — are the thing I'd defend.
