import {
  MEDIA_FULL_SIDE,
  MEDIA_MAX_SIDE,
  MEDIA_MIN_SIDE,
  MEDIA_VARIANT_WIDTHS,
} from "@quizarena/shared";
import sharp, { type Metadata } from "sharp";
import { AppError } from "../lib/errors";

export interface Rendition {
  /** "full" or the width, e.g. "960". */
  size: string;
  buffer: Buffer;
  width: number;
  height: number;
}

export interface ProcessedImage {
  renditions: Rendition[];
  placeholder: string;
  width: number;
  height: number;
}

const ALLOWED = new Set(["png", "jpeg", "webp"]);

/**
 * Validates an upload by its actual bytes (never its name or claimed type) and produces the
 * stored renditions: EXIF-rotated, metadata stripped, re-encoded as WebP — so whatever was
 * uploaded, only a clean, decoded-and-re-encoded image is ever served.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    // limitInputPixels guards against decompression bombs (tiny file, gigantic canvas).
    meta = await sharp(input, { limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new AppError("UNSUPPORTED_MEDIA", "That file isn't an image we can read.");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new AppError("UNSUPPORTED_MEDIA");
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (Math.min(width, height) < MEDIA_MIN_SIDE) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      `That image is too small (${width}×${height}). Use one at least ${MEDIA_MIN_SIDE}px on each side.`,
    );
  }
  if (Math.max(width, height) > MEDIA_MAX_SIDE) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      `That image is too large (${width}×${height}). Use one at most ${MEDIA_MAX_SIDE}px on a side.`,
    );
  }

  const base = () => sharp(input, { limitInputPixels: 80_000_000, failOn: "error" }).rotate();
  const encode = async (size: string, box: number, widthOnly: boolean) => {
    const { data, info } = await base()
      .resize(
        widthOnly
          ? { width: box, withoutEnlargement: true }
          : { width: box, height: box, fit: "inside", withoutEnlargement: true },
      )
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { size, buffer: data, width: info.width, height: info.height };
  };

  let full: Rendition;
  try {
    full = await encode("full", MEDIA_FULL_SIDE, false);
  } catch {
    throw new AppError("UNSUPPORTED_MEDIA", "That image is damaged or incomplete.");
  }
  const renditions: Rendition[] = [full];
  for (const w of MEDIA_VARIANT_WIDTHS) {
    if (full.width > w) renditions.push(await encode(String(w), w, true));
  }
  const tiny = await base()
    .resize({ width: 24, height: 24, fit: "inside" })
    .webp({ quality: 40 })
    .toBuffer();
  return {
    renditions,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
    width: full.width,
    height: full.height,
  };
}
