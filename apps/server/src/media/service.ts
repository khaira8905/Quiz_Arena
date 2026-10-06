import { type MediaAssetDto, VIDEO_ACCEPT_LABEL, type VideoMime } from "@quizarena/shared";
import type { Db, MediaAsset } from "../db";
import { AppError } from "../lib/errors";
import { newId } from "../lib/random";
import { processImage } from "./process";
import type { MediaStorage } from "./storage";
import { sniffVideo, videoExtension } from "./video";

/** Counts how many questions use an asset, as an image or as a video. */
export const withUsage = { _count: { select: { questions: true, videoQuestions: true } } } as const;

export const mediaDto = (
  a: MediaAsset & { _count?: { questions: number; videoQuestions?: number } },
): MediaAssetDto => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  url: a.url,
  mimeType: a.mimeType,
  durationMs: a.durationMs,
  posterUrl: a.posterUrl,
  variants: (a.variants ?? {}) as Record<string, string>,
  placeholder: a.placeholder,
  width: a.width,
  height: a.height,
  bytes: a.bytes,
  source: a.source,
  usageCount: (a._count?.questions ?? 0) + (a._count?.videoQuestions ?? 0),
  createdAt: a.createdAt.toISOString(),
});

export const keyFor = (storageKey: string, size: string) =>
  size === "full" ? `${storageKey}.webp` : `${storageKey}-${size}.webp`;

/** Every object key an asset owns: the image (or a video's poster) and its renditions, and
 *  for a video the file itself. */
export function assetKeys(a: Pick<MediaAsset, "storageKey" | "variants" | "kind" | "mimeType">) {
  return [
    ...(a.kind === "VIDEO"
      ? [`${a.storageKey}.${a.mimeType === "video/webm" ? "webm" : "mp4"}`]
      : []),
    keyFor(a.storageKey, "full"),
    ...Object.keys((a.variants ?? {}) as Record<string, string>).map((w) =>
      keyFor(a.storageKey, w),
    ),
  ];
}

/**
 * Validate → optimize → store → record. Used by device uploads and Google Drive imports
 * alike, so every image takes the same path no matter where it came from.
 */
export async function saveImage(
  db: Db,
  storage: MediaStorage | null,
  reason: string | null,
  input: { ownerId: string; buffer: Buffer; name: string; source: "UPLOAD" | "GOOGLE_DRIVE" },
) {
  if (!storage) throw new AppError("MEDIA_UNAVAILABLE", reason ?? undefined);
  const image = await processImage(input.buffer);
  const storageKey = `media/${input.ownerId.toLowerCase()}/${newId()}`;
  const stored: string[] = [];
  const urls: Record<string, string> = {};
  try {
    for (const r of image.renditions) {
      const key = keyFor(storageKey, r.size);
      urls[r.size] = await storage.put(key, r.buffer, "image/webp");
      stored.push(key);
    }
  } catch (err) {
    await storage.remove(stored).catch(() => {});
    throw err;
  }
  const { full, ...variants } = urls;
  const asset = await db.mediaAsset.create({
    data: {
      ownerId: input.ownerId,
      name: input.name,
      storageKey,
      url: full!,
      variants,
      placeholder: image.placeholder,
      bytes: image.renditions.reduce((n, r) => n + r.buffer.length, 0),
      width: image.width,
      height: image.height,
      source: input.source,
    },
    include: withUsage,
  });
  return asset;
}

/**
 * Records a video whose file is already in storage at `<key>.<ext>`, after checking it's
 * there, the size is what was promised and its bytes say MP4 or WebM. A file that fails is
 * deleted. Duration and dimensions come from the uploader's browser, which decoded it.
 */
export async function recordVideo(
  db: Db,
  storage: MediaStorage,
  input: {
    ownerId: string;
    key: string;
    mime: VideoMime;
    maxBytes: number;
    name: string;
    source: "UPLOAD" | "GOOGLE_DRIVE";
    durationMs: number;
    width: number;
    height: number;
  },
) {
  const fileKey = `${input.key}.${videoExtension(input.mime)}`;
  const bytes = await storage.size(fileKey);
  if (bytes === null) throw new AppError("BAD_REQUEST", "The video didn't finish uploading.");
  const sniffed = bytes > 0 ? sniffVideo(await storage.head(fileKey, 16)) : null;
  if (bytes > input.maxBytes || sniffed !== input.mime) {
    await storage.remove([fileKey]).catch(() => {});
    if (bytes > input.maxBytes) throw new AppError("FILE_TOO_LARGE");
    throw new AppError("UNSUPPORTED_MEDIA", `That file isn't an ${VIDEO_ACCEPT_LABEL} video.`);
  }
  return db.mediaAsset.create({
    data: {
      ownerId: input.ownerId,
      kind: "VIDEO",
      name: input.name,
      storageKey: input.key,
      url: storage.publicUrl(fileKey),
      mimeType: input.mime,
      bytes,
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      source: input.source,
    },
    include: withUsage,
  });
}

/**
 * A video's poster: a still the uploader's browser captured, put through the same decode
 * and re-encode as any image and stored beside the video. Replaces an earlier poster.
 */
export async function savePoster(db: Db, storage: MediaStorage, asset: MediaAsset, buffer: Buffer) {
  const image = await processImage(buffer);
  const urls: Record<string, string> = {};
  for (const r of image.renditions) {
    urls[r.size] = await storage.put(keyFor(asset.storageKey, r.size), r.buffer, "image/webp");
  }
  const { full, ...variants } = urls;
  const posterBytes = image.renditions.reduce((n, r) => n + r.buffer.length, 0);
  const videoKey = `${asset.storageKey}.${videoExtension(asset.mimeType as VideoMime)}`;
  const videoBytes = (await storage.size(videoKey)) ?? asset.bytes;
  return db.mediaAsset.update({
    where: { id: asset.id },
    data: {
      // Cache-busting: the key is reused, so the URL carries a version.
      posterUrl: `${full!}?v=${Date.now().toString(36)}`,
      variants,
      placeholder: image.placeholder,
      bytes: videoBytes + posterBytes,
    },
    include: withUsage,
  });
}
