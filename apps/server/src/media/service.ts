import type { MediaAssetDto } from "@quizarena/shared";
import type { Db, MediaAsset } from "../db";
import { AppError } from "../lib/errors";
import { newId } from "../lib/random";
import { processImage } from "./process";
import type { MediaStorage } from "./storage";

export const mediaDto = (a: MediaAsset & { _count?: { questions: number } }): MediaAssetDto => ({
  id: a.id,
  name: a.name,
  url: a.url,
  variants: (a.variants ?? {}) as Record<string, string>,
  placeholder: a.placeholder,
  width: a.width,
  height: a.height,
  bytes: a.bytes,
  source: a.source,
  usageCount: a._count?.questions ?? 0,
  createdAt: a.createdAt.toISOString(),
});

export const keyFor = (storageKey: string, size: string) =>
  size === "full" ? `${storageKey}.webp` : `${storageKey}-${size}.webp`;

/** Every object key an asset owns (full size plus its renditions). */
export function assetKeys(a: Pick<MediaAsset, "storageKey" | "variants">) {
  return [
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
    include: { _count: { select: { questions: true } } },
  });
  return asset;
}
