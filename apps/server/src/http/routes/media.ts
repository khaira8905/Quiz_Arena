import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  MEDIA_MAX_BYTES,
  type MediaConfigDto,
  mediaListQuerySchema,
  mediaNameFromFile,
  mediaRenameSchema,
} from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../../db";
import { AppError } from "../../lib/errors";
import { assetKeys, mediaDto, saveImage } from "../../media/service";
import { LocalStorage, STORAGE_KEY_PATTERN } from "../../media/storage";
import { requireUser, type AppContext } from "../context";

const idParams = z.object({ id: z.string().min(1).max(64) });
const withUsage = { _count: { select: { questions: true } } } as const;

export function mediaRoutes(app: FastifyInstance, ctx: AppContext) {
  const { storage, reason } = ctx.media;

  const owned = async (userId: string, id: string) => {
    const asset = await ctx.db.mediaAsset.findFirst({
      where: { id, ownerId: userId },
      include: withUsage,
    });
    if (!asset) throw new AppError("NOT_FOUND");
    return asset;
  };

  app.get("/api/media/config", async (req): Promise<MediaConfigDto> => {
    await requireUser(ctx, req);
    return {
      enabled: !!storage,
      driver: storage?.driver ?? "none",
      maxBytes: MEDIA_MAX_BYTES,
      reason,
      googleDrive: !!ctx.google,
    };
  });

  app.get("/api/media", async (req) => {
    const userId = await requireUser(ctx, req);
    const { q, sort, unused } = mediaListQuerySchema.parse(req.query);
    const where: Prisma.MediaAssetWhereInput = {
      ownerId: userId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(unused === "1" ? { questions: { none: {} } } : {}),
    };
    const assets = await ctx.db.mediaAsset.findMany({
      where,
      include: withUsage,
      orderBy:
        sort === "name"
          ? { name: "asc" }
          : sort === "size"
            ? { bytes: "desc" }
            : { createdAt: "desc" },
      take: 500,
    });
    return { assets: assets.map(mediaDto) };
  });

  /** One image per request, as multipart/form-data (field "file"). Never over the socket. */
  app.post(
    "/api/media",
    { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const userId = await requireUser(ctx, req);
      if (!storage) throw new AppError("MEDIA_UNAVAILABLE", reason ?? undefined);
      if (!req.isMultipart()) throw new AppError("BAD_REQUEST", "Send the image as form data.");
      const file = await req.file({ limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } });
      if (!file) throw new AppError("BAD_REQUEST", "No image was attached.");
      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch {
        throw new AppError("FILE_TOO_LARGE");
      }
      if (file.file.truncated) throw new AppError("FILE_TOO_LARGE");
      const asset = await saveImage(ctx.db, storage, reason, {
        ownerId: userId,
        buffer,
        name: mediaNameFromFile(file.filename),
        source: "UPLOAD",
      });
      return reply.code(201).send({ asset: mediaDto(asset) });
    },
  );

  app.patch("/api/media/:id", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const { name } = mediaRenameSchema.parse(req.body);
    await owned(userId, id);
    const asset = await ctx.db.mediaAsset.update({
      where: { id },
      data: { name },
      include: withUsage,
    });
    return { asset: mediaDto(asset) };
  });

  /**
   * Deleting an image that questions still use needs ?force=1; those questions lose the
   * image (they keep their text and answers).
   */
  app.delete("/api/media/:id", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const force = (req.query as { force?: string } | undefined)?.force === "1";
    const asset = await owned(userId, id);
    if (asset._count.questions > 0 && !force) {
      throw new AppError(
        "CONFLICT",
        `This image is used by ${asset._count.questions} question${asset._count.questions === 1 ? "" : "s"}.`,
        { usageCount: asset._count.questions },
      );
    }
    await ctx.db.$transaction([
      ctx.db.question.updateMany({
        where: { imageAssetId: id },
        data: { imageAssetId: null, imageUrl: null },
      }),
      ctx.db.mediaAsset.delete({ where: { id } }),
    ]);
    // The record is gone either way; a storage hiccup only leaves an orphaned file.
    await storage
      ?.remove(assetKeys(asset))
      .catch((err) => req.log.warn({ err, id }, "media: couldn't delete stored files"));
    return reply.code(204).send();
  });

  // Development storage serves its own files. Public (like any CDN URL): players load them.
  if (storage instanceof LocalStorage) {
    app.get("/api/media/files/*", async (req, reply) => {
      const key = (req.params as { "*": string })["*"];
      if (!STORAGE_KEY_PATTERN.test(key)) throw new AppError("NOT_FOUND");
      const file = storage.filePath(key);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) throw new AppError("NOT_FOUND");
      return reply
        .header("cache-control", "public, max-age=31536000, immutable")
        .header("content-length", info.size)
        .type("image/webp")
        .send(createReadStream(file));
    });
  }
}
