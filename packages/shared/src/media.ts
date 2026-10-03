import { z } from "zod";

/**
 * Question images. Uploads are validated and re-encoded on the server (WebP, metadata
 * stripped, several sizes) and stored in object storage; only metadata lives in Postgres.
 */

export const IMAGE_FITS = ["CONTAIN", "COVER"] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];
export const IMAGE_POSITIONS = ["CENTER", "TOP", "BOTTOM"] as const;
export type ImagePosition = (typeof IMAGE_POSITIONS)[number];

/** What a browser may send. Anything else (SVG, GIF, HEIC, executables…) is refused. */
export const MEDIA_ACCEPT = ["image/png", "image/jpeg", "image/webp"] as const;
export const MEDIA_ACCEPT_LABEL = "PNG, JPG or WEBP";
/** Upper bound the server accepts for one upload. */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
/** Browsers shrink bigger photos before sending, so uploads stay quick on venue Wi-Fi. */
export const MEDIA_CLIENT_TARGET_BYTES = 3 * 1024 * 1024;
export const MEDIA_CLIENT_MAX_SIDE = 2560;
export const MEDIA_MIN_SIDE = 64;
export const MEDIA_MAX_SIDE = 12000;
/** Longest side of the stored full-size rendition, and the smaller renditions' widths. */
export const MEDIA_FULL_SIDE = 1920;
export const MEDIA_VARIANT_WIDTHS = [960, 480] as const;
export const MEDIA_NAME_MAX = 120;

export interface MediaAssetDto {
  id: string;
  name: string;
  url: string;
  /** Smaller renditions by width ("960", "480"); only those smaller than the original. */
  variants: Record<string, string>;
  placeholder: string;
  width: number;
  height: number;
  bytes: number;
  source: "UPLOAD" | "GOOGLE_DRIVE";
  usageCount: number;
  createdAt: string;
}

export interface MediaConfigDto {
  enabled: boolean;
  /** Where files go: the server's disk (development) or S3-compatible object storage. */
  driver: "local" | "s3" | "none";
  maxBytes: number;
  /** Why uploads are off, for the organiser. */
  reason: string | null;
  googleDrive: boolean;
}

export const mediaRenameSchema = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(1).max(MEDIA_NAME_MAX)),
});

export const mediaListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  sort: z.enum(["recent", "name", "size"]).default("recent"),
  unused: z.enum(["1", "0"]).optional(),
});

/** A display name from an uploaded file's name: never trusted as a path, only as a label. */
export function mediaNameFromFile(filename: string | undefined | null): string {
  const base = (filename ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[_]+/g, " ")
    .trim()
    .slice(0, MEDIA_NAME_MAX);
  return base || "Image";
}

/** Picks the smallest rendition at least `width` CSS pixels wide (for srcset / phones). */
export function mediaSrcSet(asset: Pick<MediaAssetDto, "url" | "variants" | "width">): string {
  const entries = Object.entries(asset.variants)
    .map(([w, url]) => `${url} ${w}w`)
    .concat(`${asset.url} ${Math.min(asset.width, MEDIA_FULL_SIDE)}w`);
  return entries.join(", ");
}
