import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { paths } from "./paths";

export interface CropResult {
  url: string;
  file: string;
  width: number;
  height: number;
}

/**
 * Crop a normalised bbox [x0,y0,x1,y1] (0..1) out of a rendered page image.
 * Results are cached by content hash so repeated requests are free.
 */
export async function cropPage(args: {
  slug: string;
  page: number;
  bbox: [number, number, number, number];
}): Promise<CropResult> {
  const { slug, page, bbox } = args;
  const srcPath = paths.pageImage(slug, page);

  const id = crypto
    .createHash("sha1")
    .update(`${slug}|${page}|${bbox.map((v) => v.toFixed(4)).join(",")}`)
    .digest("hex")
    .slice(0, 10);

  const outPath = paths.crop(slug, page, id);
  const outUrl = paths.cropUrl(slug, page, id);

  try {
    const stat = await fs.stat(outPath);
    if (stat.size > 0) {
      const meta = await sharp(outPath).metadata();
      return { url: outUrl, file: outPath, width: meta.width || 0, height: meta.height || 0 };
    }
  } catch {
    // not cached
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const meta = await sharp(srcPath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  const left = Math.max(0, Math.floor(bbox[0] * W));
  const top = Math.max(0, Math.floor(bbox[1] * H));
  const right = Math.min(W, Math.ceil(bbox[2] * W));
  const bottom = Math.min(H, Math.ceil(bbox[3] * H));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  await sharp(srcPath).extract({ left, top, width, height }).png().toFile(outPath);
  return { url: outUrl, file: outPath, width, height };
}
