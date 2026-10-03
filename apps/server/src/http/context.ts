import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config";
import type { Db } from "../db";
import type { GameManager } from "../game/game-manager";
import { SESSION_COOKIE, type TokenService } from "../lib/auth";
import { AppError } from "../lib/errors";

export interface AppContext {
  config: Config;
  db: Db;
  tokens: TokenService;
  games: GameManager;
}

/** Resolves the signed-in admin from the session cookie, or throws 401. */
export async function requireUser(ctx: AppContext, req: FastifyRequest): Promise<string> {
  const token = req.cookies[SESSION_COOKIE];
  const session = token ? await ctx.tokens.verifySession(token) : null;
  if (!session) throw new AppError("UNAUTHORIZED");
  // A password change bumps sessionVersion, which retires every session issued before it.
  const user = await ctx.db.user.findUnique({
    where: { id: session.userId },
    select: { sessionVersion: true },
  });
  if (!user || user.sessionVersion !== session.version) throw new AppError("UNAUTHORIZED");
  return session.userId;
}

export function setSessionCookie(
  ctx: AppContext,
  reply: FastifyReply,
  token: string,
  maxAgeSeconds: number,
) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ctx.config.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: ctx.config.isProd,
    sameSite: "lax",
    path: "/",
  });
}
