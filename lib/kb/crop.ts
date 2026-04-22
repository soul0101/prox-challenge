import fs from "node:fs/promises";
import sharp from "sharp";
import { paths } from "./paths";

export interface CropResult {
  /** `data:image/png;base64,...` URL. Embedded directly in SSE events so the
   *  UI can render without any server-side filesystem writes — works
   *  identically on localhost and on Vercel's read-only deploy filesystem. */
  url: string;
  /** The raw PNG bytes. Callers that need to forward the image back into
   *  Claude's context (e.g. crop_region tool) use this directly instead of
   *  re-reading the data URL. */
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Crop a normalised bbox [x0,y0,x1,y1] (0..1) out of a rendered page image
 * and return it as an inline data URL. In-memory only — no filesystem writes,
 * so this works on Vercel serverless (where only /tmp is writable and isn't
 * persistent across invocations anyway).
 *
 * Cost is one `sharp().extract().toBuffer()` per crop. On a 50-page corpus
 * the source PNG is small and the operation is ~10-30 ms — fine to redo on
 * each agent tool call. The browser dedupes identical data URLs visually.
 */
export async function cropPage(args: {
  slug: string;
  page: number;
  bbox: [number, number, number, number];
}): Promise<CropResult> {
  const { slug, page, bbox } = args;
  const srcPath = paths.pageImage(slug, page);
  const srcBuf = await fs.readFile(srcPath);

  const meta = await sharp(srcBuf).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  const left = Math.max(0, Math.floor(bbox[0] * W));
  const top = Math.max(0, Math.floor(bbox[1] * H));
  const right = Math.min(W, Math.ceil(bbox[2] * W));
  const bottom = Math.min(H, Math.ceil(bbox[3] * H));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const out = await sharp(srcBuf)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  return {
    url: `data:image/png;base64,${out.toString("base64")}`,
    buffer: out,
    width,
    height,
  };
}
