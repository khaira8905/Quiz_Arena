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

/* ------------------------------------------------------------------------------- video */

/** Question videos: stored as uploaded (no server transcoding), so only formats every
 *  projector browser plays are accepted. */
export const VIDEO_ACCEPT = ["video/mp4", "video/webm"] as const;
export type VideoMime = (typeof VIDEO_ACCEPT)[number];
export const VIDEO_ACCEPT_LABEL = "MP4 (H.264) or WebM";
/** Large enough for a minute or two of 1080p; the bucket serves it, not the game server. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
/** Drive videos pass through the game server's memory, so they get a tighter cap. */
export const VIDEO_DRIVE_MAX_BYTES = 40 * 1024 * 1024;
/** A question clip, not a film: longer videos are refused before uploading. */
export const VIDEO_MAX_DURATION_MS = 5 * 60 * 1000;

export const MEDIA_KINDS = ["IMAGE", "VIDEO"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export interface MediaAssetDto {
  id: string;
  kind: MediaKind;
  name: string;
  /** The image, or for a video the video file itself. */
  url: string;
  mimeType: string;
  /** Video only: length, and a still frame (null until the browser has sent one). */
  durationMs: number | null;
  posterUrl: string | null;
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
  videoMaxBytes: number;
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
  kind: z.enum(["image", "video"]).optional(),
});

/** Step 1 of a video upload: what's coming. The server answers with where to send it. */
export const videoUploadRequestSchema = z.object({
  name: z.string().max(260),
  mimeType: z.enum(VIDEO_ACCEPT),
  bytes: z.number().int().min(1).max(VIDEO_MAX_BYTES),
});

/** Where the browser sends the file: straight to the bucket, or to the game server. */
export interface VideoUploadTicketDto {
  ticket: string;
  target: { url: string; method: "PUT"; headers: Record<string, string> };
}

/** Step 3: the file is up; the browser reports what it decoded. */
export const videoCompleteSchema = z.object({
  ticket: z.string().min(20).max(2000),
  durationMs: z.number().int().min(1).max(VIDEO_MAX_DURATION_MS),
  width: z.number().int().min(16).max(8192),
  height: z.number().int().min(16).max(8192),
});

/** Question video as players and the stage see it. */
export interface QuestionVideo {
  url: string;
  posterUrl: string | null;
  durationMs: number | null;
}

/**
 * A display name from an uploaded file's name: never trusted as a path, only as a label.
 * `fallback` names a file that had no usable name ("Image", or "Video" for videos).
 */
export function mediaNameFromFile(
  filename: string | undefined | null,
  fallback: "Image" | "Video" = "Image",
): string {
  const base = (filename ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[_]+/g, " ")
    .trim()
    .slice(0, MEDIA_NAME_MAX);
  return base || fallback;
}

/** Picks the smallest rendition at least `width` CSS pixels wide (for srcset / phones). */
export function mediaSrcSet(asset: Pick<MediaAssetDto, "url" | "variants" | "width">): string {
  const entries = Object.entries(asset.variants)
    .map(([w, url]) => `${url} ${w}w`)
    .concat(`${asset.url} ${Math.min(asset.width, MEDIA_FULL_SIDE)}w`);
  return entries.join(", ");
}
