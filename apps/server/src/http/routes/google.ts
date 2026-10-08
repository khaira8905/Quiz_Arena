import { randomBytes, timingSafeEqual } from "node:crypto";
import { mediaNameFromFile, VIDEO_DRIVE_MAX_BYTES, VIDEO_MAX_DURATION_MS } from "@quizarena/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { GoogleDriveClient, TokenCipher } from "../../lib/google-drive";
import { newId } from "../../lib/random";
import { mediaDto, recordVideo, saveImage } from "../../media/service";
import { videoExtension } from "../../media/video";
import { requireUser, type AppContext } from "../context";

const STATE_COOKIE = "qa_google_state";
const filesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  pageToken: z.string().max(500).optional(),
  kind: z.enum(["image", "video"]).default("image"),
});
const fileParams = z.object({ fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/) });
const importBody = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
  kind: z.enum(["image", "video"]).default("image"),
});

export interface GoogleContext {
  client: GoogleDriveClient;
  cipher: TokenCipher;
}

/**
 * The popup that ran the Google consent screen ends here: tell the editor (its opener, same
 * origin) and close. Without an opener (popup blocked → full-page flow) go to the library.
 */
function finishPage(reply: FastifyReply, result: { ok: boolean; message?: string }) {
  const payload = JSON.stringify({ type: "qa:google", ...result }).replace(/</g, "\\u003c");
  const fallback = result.ok ? "/admin/media?google=connected" : "/admin/media?google=error";
  return reply
    .header("cache-control", "no-store")
    .type("text/html; charset=utf-8")
    .send(
      `<!doctype html><meta charset="utf-8"><title>Google Drive</title>` +
        `<body style="font:16px system-ui;background:#0b0d12;color:#e8eaf0;display:grid;place-items:center;height:100vh;margin:0">` +
        `<p>${result.ok ? "Google Drive connected. You can close this window." : "Couldn't connect Google Drive."}</p>` +
        `<script>(function(){var m=${payload};if(window.opener){window.opener.postMessage(m,location.origin);window.close();}else{location.replace(${JSON.stringify(fallback)});}})();</script>`,
    );
}

export function googleRoutes(app: FastifyInstance, ctx: AppContext) {
  const google = ctx.google;

  const requireGoogle = () => {
    if (!google)
      throw new AppError(
        "MEDIA_UNAVAILABLE",
        "Google Drive isn't set up on this server (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).",
      );
    return google;
  };

  /** A fresh access token for this organiser, or GOOGLE_NOT_CONNECTED. */
  const accessFor = async (userId: string) => {
    const g = requireGoogle();
    const account = await ctx.db.googleAccount.findUnique({ where: { userId } });
    const refresh = account ? g.cipher.decrypt(account.refreshToken) : null;
    if (!refresh) throw new AppError("GOOGLE_NOT_CONNECTED");
    try {
      return await g.client.accessToken(refresh);
    } catch (err) {
      // A dead grant is forgotten so the UI offers "Connect" again.
      if (err instanceof AppError && err.code === "GOOGLE_NOT_CONNECTED")
        await ctx.db.googleAccount.delete({ where: { userId } }).catch(() => {});
      throw err;
    }
  };

  app.get("/api/google/status", async (req) => {
    const userId = await requireUser(ctx, req);
    if (!google) return { configured: false, connected: false, email: null };
    const account = await ctx.db.googleAccount.findUnique({
      where: { userId },
      select: { email: true },
    });
    return { configured: true, connected: !!account, email: account?.email ?? null };
  });

  /** Starts the consent flow (opened in a popup by the editor). */
  app.get(
    "/api/google/connect",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const userId = await requireUser(ctx, req);
      const g = requireGoogle();
      const nonce = randomBytes(16).toString("base64url");
      const state = await ctx.tokens.signOAuthState(userId, nonce);
      reply.setCookie(STATE_COOKIE, nonce, {
        httpOnly: true,
        secure: ctx.config.isProd,
        sameSite: "lax",
        path: "/api/google",
        maxAge: 600,
      });
      return reply.redirect(g.client.authUrl(state));
    },
  );

  app.get("/api/google/callback", async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };
    const cookieNonce = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: "/api/google" });
    try {
      const userId = await requireUser(ctx, req);
      const g = requireGoogle();
      if (query.error) {
        return finishPage(reply, {
          ok: false,
          message:
            query.error === "access_denied" ? "Access wasn't granted." : "Google sign-in failed.",
        });
      }
      const state = query.state ? await ctx.tokens.verifyOAuthState(query.state) : null;
      // The state must be ours, for this signed-in organiser, and match this browser's nonce
      // cookie — so a link from someone else can't attach their Drive to your account.
      const sameNonce =
        !!state &&
        !!cookieNonce &&
        state.nonce.length === cookieNonce.length &&
        timingSafeEqual(Buffer.from(state.nonce), Buffer.from(cookieNonce));
      if (!state || state.userId !== userId || !sameNonce || !query.code) {
        return finishPage(reply, { ok: false, message: "The sign-in link expired. Try again." });
      }
      const tokens = await g.client.exchange(query.code);
      const data = {
        email: tokens.email,
        refreshToken: g.cipher.encrypt(tokens.refreshToken),
        scope: tokens.scope,
      };
      await ctx.db.googleAccount.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      return finishPage(reply, { ok: true });
    } catch (err) {
      req.log.warn({ err }, "google: connect failed");
      return finishPage(reply, {
        ok: false,
        message: err instanceof AppError ? err.message : "Couldn't connect Google Drive.",
      });
    }
  });

  app.delete("/api/google/connection", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const account = await ctx.db.googleAccount.findUnique({ where: { userId } });
    if (account) {
      const refresh = google?.cipher.decrypt(account.refreshToken);
      if (refresh) await google!.client.revoke(refresh);
      await ctx.db.googleAccount.delete({ where: { userId } });
    }
    return reply.code(204).send();
  });

  app.get(
    "/api/google/files",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const userId = await requireUser(ctx, req);
      const { q, pageToken, kind } = filesQuery.parse(req.query);
      const token = await accessFor(userId);
      return requireGoogle().client.listImages(token, { q, pageToken, kind });
    },
  );

  app.get(
    "/api/google/thumbnail/:fileId",
    { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const userId = await requireUser(ctx, req);
      const { fileId } = fileParams.parse(req.params);
      const token = await accessFor(userId);
      const thumb = await requireGoogle().client.thumbnail(token, fileId);
      if (!thumb) throw new AppError("NOT_FOUND");
      return reply
        .header("cache-control", "private, max-age=600")
        .type(thumb.type)
        .send(thumb.body);
    },
  );

  /** Copies a Drive image into the media library (same validation + optimization as uploads). */
  app.post(
    "/api/google/import",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const userId = await requireUser(ctx, req);
      const { fileId, kind } = importBody.parse(req.body);
      const storage = ctx.media.storage;
      if (!storage) throw new AppError("MEDIA_UNAVAILABLE", ctx.media.reason ?? undefined);
      const token = await accessFor(userId);
      if (kind === "video") {
        const video = await requireGoogle().client.downloadVideo(token, fileId);
        const key = `media/${userId.toLowerCase()}/${newId()}`;
        await storage.put(`${key}.${videoExtension(video.mime)}`, video.body, video.mime);
        const asset = await recordVideo(ctx.db, storage, {
          ownerId: userId,
          key,
          mime: video.mime,
          maxBytes: VIDEO_DRIVE_MAX_BYTES,
          name: mediaNameFromFile(video.name, "Video"),
          source: "GOOGLE_DRIVE",
          durationMs: Math.min(video.durationMs, VIDEO_MAX_DURATION_MS),
          width: video.width,
          height: video.height,
        });
        return reply.code(201).send({ asset: mediaDto(asset) });
      }
      const file = await requireGoogle().client.download(token, fileId);
      const asset = await saveImage(ctx.db, ctx.media.storage, ctx.media.reason, {
        ownerId: userId,
        buffer: file.body,
        name: mediaNameFromFile(file.name),
        source: "GOOGLE_DRIVE",
      });
      return reply.code(201).send({ asset: mediaDto(asset) });
    },
  );
}
