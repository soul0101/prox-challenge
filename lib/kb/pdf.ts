import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas, DOMMatrix } from "@napi-rs/canvas";

// pdfjs-dist needs a few browser-ish globals present in node.
// We install them once at import time.
const g = globalThis as unknown as {
  DOMMatrix?: unknown;
  Promise: typeof Promise;
};
if (!g.DOMMatrix) g.DOMMatrix = DOMMatrix;

type PDFPageProxy = {
  getViewport: (opts: { scale: number }) => {
    width: number;
    height: number;
    transform: number[];
  };
  render: (opts: {
    canvasContext: unknown;
    viewport: unknown;
    canvasFactory?: unknown;
  }) => { promise: Promise<void> };
  getTextContent: () => Promise<{
    items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>;
  }>;
};
type PDFDocProxy = {
  numPages: number;
  getPage: (n: number) => Promise<PDFPageProxy>;
  destroy?: () => Promise<void>;
};

async function loadPdfjs() {
  const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Node has no Worker: point GlobalWorkerOptions at the bundled worker script
  // so pdfjs doesn't try to construct a browser Worker.
  const workerUrl = new URL(
    "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  );
  (mod as any).GlobalWorkerOptions.workerSrc = workerUrl.href;
  return mod as any;
}

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(cc: { canvas: any }, width: number, height: number) {
    cc.canvas.width = Math.max(1, Math.floor(width));
    cc.canvas.height = Math.max(1, Math.floor(height));
  }
  destroy(cc: { canvas: any }) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
  }
}

export interface RenderedPage {
  page: number;
  width: number;
  height: number;
  text: string;
  pngPath: string;
}

/** Render every page of `pdfPath` to `outDir/p-NNN.png` and return per-page metadata. */
export async function renderPdf(
  pdfPath: string,
  outDir: string,
  opts: { scale?: number; onProgress?: (page: number, total: number) => void } = {},
): Promise<RenderedPage[]> {
  const scale = opts.scale ?? 2.0; // ~180 DPI at 72 DPI base
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const doc: PDFDocProxy = await pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    useWorkerFetch: false,
    cMapUrl: path.join(process.cwd(), "node_modules/pdfjs-dist/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/"),
  }).promise;

  await fs.mkdir(outDir, { recursive: true });
  const factory = new NodeCanvasFactory();
  const out: RenderedPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    opts.onProgress?.(i, doc.numPages);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const { canvas, context } = factory.create(viewport.width, viewport.height);

    await page.render({
      canvasContext: context as unknown as object,
      viewport,
      canvasFactory: factory,
    }).promise;

    const pngPath = path.join(outDir, `p-${String(i).padStart(3, "0")}.png`);
    const buf = (canvas as any).toBuffer("image/png");
    await fs.writeFile(pngPath, buf);

    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    out.push({
      page: i,
      width: viewport.width,
      height: viewport.height,
      text,
      pngPath,
    });
    factory.destroy({ canvas });
  }

  await doc.destroy?.();
  return out;
}
