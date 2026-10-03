import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { ApiErrorBody } from "@quizarena/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Config } from "./config";
import type { Db } from "./db";
import { GameManager } from "./game/game-manager";
import { PrismaGamePersistence, type GamePersistence } from "./game/persistence";
import type { AppContext } from "./http/context";
import { authRoutes } from "./http/routes/auth";
import { quizRoutes } from "./http/routes/quizzes";
import { importRoutes } from "./http/routes/imports";
import { googleRoutes, type GoogleContext } from "./http/routes/google";
import { mediaRoutes } from "./http/routes/media";
import { sessionRoutes } from "./http/routes/sessions";
import { TokenService } from "./lib/auth";
import { isAppError } from "./lib/errors";
import { GoogleDriveClient, TokenCipher } from "./lib/google-drive";
import { createStorage, type StorageChoice } from "./media/storage";
import { attachGateway, createIo, createRoomOutput, type IoServer } from "./realtime/gateway";

export interface BuiltApp {
  app: FastifyInstance;
  io: IoServer;
  games: GameManager;
}

export async function buildApp(
  config: Config,
  db: Db,
  options: {
    persistence?: GamePersistence;
    logger?: boolean;
    media?: StorageChoice;
    /** Tests inject a mocked Google; null disables it. */
    google?: GoogleContext | null;
  } = {},
): Promise<BuiltApp> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            ...(config.isProd
              ? {}
              : { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } }),
            redact: ["req.headers.cookie", "req.headers.authorization"],
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 256 * 1024,
  });

  await app.register(cors, {
    origin: config.webOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });
  await app.register(cookie);
  // Uploads only; the per-route limits (size, one file) are set where the file is read.
  await app.register(multipart, { limits: { fields: 4, files: 1, parts: 6 } });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
      },
    }),
  });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
  });

  app.setErrorHandler((err, req, reply) => {
    let status = 500;
    let body: ApiErrorBody = {
      error: { code: "INTERNAL", message: "Something went wrong on our side." },
    };
    if (isAppError(err)) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (err instanceof ZodError) {
      status = 400;
      body = {
        error: {
          code: "BAD_REQUEST",
          message: err.issues[0]?.message ?? "Invalid request",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      };
    } else if (typeof err === "object" && err && "statusCode" in err && err.statusCode === 429) {
      status = 429;
      body = {
        error: {
          code: "RATE_LIMITED",
          message: (err as { message?: string }).message ?? "Too many requests",
        },
      };
    } else if (
      typeof err === "object" &&
      err &&
      "statusCode" in err &&
      typeof err.statusCode === "number" &&
      err.statusCode < 500
    ) {
      status = err.statusCode;
      body = {
        error: {
          code: "BAD_REQUEST",
          message: (err as { message?: string }).message ?? "Bad request",
        },
      };
    } else {
      req.log.error({ err }, "unhandled error");
    }
    reply.code(status).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    reply
      .code(404)
      .send({ error: { code: "NOT_FOUND", message: "Route not found." } } satisfies ApiErrorBody);
  });

  const io = createIo(app.server, config.webOrigins);
  const persistence = options.persistence ?? new PrismaGamePersistence(db);
  const games = new GameManager(
    (code) => createRoomOutput(io, code),
    persistence,
    app.log,
    async (sessionId) => {
      await db.quizSession.update({
        where: { id: sessionId },
        data: { status: "ABANDONED", endedAt: new Date() },
      });
    },
  );
  const tokens = new TokenService(config.JWT_SECRET);
  const media = options.media ?? createStorage(config);
  if (!media.storage) app.log.warn(`media: uploads disabled — ${media.reason}`);
  const google =
    options.google !== undefined
      ? options.google
      : config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI
        ? {
            client: new GoogleDriveClient({
              clientId: config.GOOGLE_CLIENT_ID,
              clientSecret: config.GOOGLE_CLIENT_SECRET,
              redirectUri: config.GOOGLE_REDIRECT_URI,
            }),
            cipher: new TokenCipher(config.GOOGLE_TOKEN_KEY ?? config.JWT_SECRET),
          }
        : null;
  const ctx: AppContext = { config, db, tokens, games, media, google };

  attachGateway({ io, games, tokens, log: app.log });

  // Public and unauthenticated (keep-awake pings, platform health checks): no live state.
  app.get("/health", async () => ({ ok: true }));
  app.get("/api/health", async () => ({ ok: true }));
  authRoutes(app, ctx);
  quizRoutes(app, ctx);
  sessionRoutes(app, ctx);
  importRoutes(app, ctx);
  mediaRoutes(app, ctx);
  googleRoutes(app, ctx);

  app.addHook("onClose", async () => {
    games.shutdown();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  return { app, io, games };
}
