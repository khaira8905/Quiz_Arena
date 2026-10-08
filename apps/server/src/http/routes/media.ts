import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import {
  MEDIA_MAX_BYTES,
  type MediaConfigDto,
  mediaListQuerySchema,
  mediaNameFromFile,
  mediaRenameSchema,
  VIDEO_MAX_BYTES,
  videoCompleteSchema,
  videoUploadRequestSchema,
  type VideoUploadTicketDto,
} from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../../db";
import { AppError } from "../../lib/errors";
import { newId } from "../../lib/random";
import {
  assetKeys,
  mediaDto,
  recordVideo,
  saveImage,
  savePoster,
  withUsage,
} from "../../media/service";
import {
  contentTypeFor,
  LocalStorage,
  STORAGE_KEY_PATTERN,
  TooLargeError,
} from "../../media/storage";
import { issueTicket, readTicket, videoExtension } from "../../media/video";
import { requireUser, type AppContext } from "../context";

const idParams = z.object({ id: z.string().min(1).max(64) });

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
      videoMaxBytes: VIDEO_MAX_BYTES,
      reason,
      googleDrive: !!ctx.google,
    };
  });

  app.get("/api/media", async (req) => {
    const userId = await requireUser(ctx, req);
    const { q, sort, unused, kind } = mediaListQuerySchema.parse(req.query);
    const where: Prisma.MediaAssetWhereInput = {
      ownerId: userId,
      ...(kind ? { kind: kind === "video" ? "VIDEO" : "IMAGE" } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(unused === "1" ? { questions: { none: {} }, videoQuestions: { none: {} } } : {}),
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

  /* ----------------------------------------------------------------------------- video */

  // Raw video bodies (the local upload target) arrive as a stream, never buffered.
  app.addContentTypeParser(/^video\//, (_req, payload, done) => done(null, payload));

  /**
   * Video, step 1: a signed ticket and where to send the file. With object storage that's a
   * presigned bucket URL (the game server never holds the video); with local storage it's
   * the PUT endpoint below.
   */
  app.post(
    "/api/media/videos/uploads",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req): Promise<VideoUploadTicketDto> => {
      const userId = await requireUser(ctx, req);
      if (!storage) throw new AppError("MEDIA_UNAVAILABLE", reason ?? undefined);
      const input = videoUploadRequestSchema.parse(req.body);
      const key = `media/${userId.toLowerCase()}/${newId()}`;
      const ticket = issueTicket(
        {
          owner: userId,
          key,
          mime: input.mimeType,
          bytes: input.bytes,
          name: mediaNameFromFile(input.name, "Video"),
        },
        ctx.config.JWT_SECRET,
      );
      const fileKey = `${key}.${videoExtension(input.mimeType)}`;
      const direct = await storage.directUpload(fileKey, input.mimeType);
      return {
        ticket,
        target: direct
          ? { url: direct.url, method: "PUT", headers: direct.headers }
          : {
              url: "/api/media/videos/uploads/local",
              method: "PUT",
              headers: { "content-type": input.mimeType, "x-upload-ticket": ticket },
            },
      };
    },
  );

  /** Video, step 2 (local storage only): the file itself, streamed to disk. */
  app.put("/api/media/videos/uploads/local", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    if (!(storage instanceof LocalStorage)) throw new AppError("NOT_FOUND");
    const header = req.headers["x-upload-ticket"];
    const t = readTicket(typeof header === "string" ? header : "", userId, ctx.config.JWT_SECRET);
    const body = req.body as Readable | undefined;
    if (!body || typeof body.pipe !== "function") {
      throw new AppError("BAD_REQUEST", "Send the video as the request body.");
    }
    try {
      await storage.write(
        `${t.key}.${videoExtension(t.mime)}`,
        body,
        Math.min(t.bytes, VIDEO_MAX_BYTES),
      );
    } catch (err) {
      if (err instanceof TooLargeError) throw new AppError("FILE_TOO_LARGE");
      throw err;
    }
    return reply.code(204).send();
  });

  /** Video, step 3: the file is in storage; check it and add it to the library. */
  app.post("/api/media/videos", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    if (!storage) throw new AppError("MEDIA_UNAVAILABLE", reason ?? undefined);
    const input = videoCompleteSchema.parse(req.body);
    const t = readTicket(input.ticket, userId, ctx.config.JWT_SECRET);
    const asset = await recordVideo(ctx.db, storage, {
      ownerId: userId,
      key: t.key,
      mime: t.mime,
      maxBytes: Math.min(t.bytes, VIDEO_MAX_BYTES),
      name: t.name,
      source: "UPLOAD",
      durationMs: input.durationMs,
      width: input.width,
      height: input.height,
    });
    return reply.code(201).send({ asset: mediaDto(asset) });
  });

  /** A video's poster frame, captured by the browser (multipart field "file"). */
  app.post(
    "/api/media/:id/poster",
    { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (req) => {
      const userId = await requireUser(ctx, req);
      if (!storage) throw new AppError("MEDIA_UNAVAILABLE", reason ?? undefined);
      const { id } = idParams.parse(req.params);
      const asset = await owned(userId, id);
      if (asset.kind !== "VIDEO") throw new AppError("BAD_REQUEST", "Only videos have posters.");
      if (!req.isMultipart()) throw new AppError("BAD_REQUEST", "Send the frame as form data.");
      const file = await req.file({ limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } });
      if (!file) throw new AppError("BAD_REQUEST", "No frame was attached.");
      const buffer = await file.toBuffer().catch(() => {
        throw new AppError("FILE_TOO_LARGE");
      });
      return { asset: mediaDto(await savePoster(ctx.db, storage, asset, buffer)) };
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
    const uses = asset._count.questions + asset._count.videoQuestions;
    if (uses > 0 && !force) {
      throw new AppError(
        "CONFLICT",
        `This ${asset.kind === "VIDEO" ? "video" : "image"} is used by ${uses} question${uses === 1 ? "" : "s"}.`,
        { usageCount: uses },
      );
    }
    await ctx.db.$transaction([
      ctx.db.question.updateMany({
        where: { imageAssetId: id },
        data: { imageAssetId: null, imageUrl: null },
      }),
      ctx.db.question.updateMany({ where: { videoAssetId: id }, data: { videoAssetId: null } }),
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
      reply
        .header("cache-control", "public, max-age=31536000, immutable")
        .header("accept-ranges", "bytes")
        .type(contentTypeFor(key));
      // Byte ranges, so video seeking and replays work the way they do from a bucket.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
        const end =
          range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        if (start > end || start >= info.size) {
          return reply.code(416).header("content-range", `bytes */${info.size}`).send();
        }
        return reply
          .code(206)
          .header("content-range", `bytes ${start}-${end}/${info.size}`)
          .header("content-length", end - start + 1)
          .send(createReadStream(file, { start, end }));
      }
      return reply.header("content-length", info.size).send(createReadStream(file));
    });
  }
}
