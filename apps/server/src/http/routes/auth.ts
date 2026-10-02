import { loginSchema, profileUpdateSchema, registerSchema } from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { SESSION_TTL_SECONDS, getDummyHash, hashPassword, verifyPassword } from "../../lib/auth";
import { AppError } from "../../lib/errors";
import { clearSessionCookie, requireUser, setSessionCookie, type AppContext } from "../context";
import { userDto } from "../mappers";

const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

export function authRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/api/auth/login", strict, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await ctx.db.user.findUnique({ where: { email } });
    // Always run a bcrypt compare so response time doesn't reveal which emails exist.
    const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !ok) throw new AppError("UNAUTHORIZED", "Email or password is incorrect.");
    setSessionCookie(ctx, reply, await ctx.tokens.signSession(user.id), SESSION_TTL_SECONDS);
    return { user: userDto(user) };
  });

  app.post("/api/auth/register", strict, async (req, reply) => {
    if (!ctx.config.ALLOW_REGISTRATION)
      throw new AppError("FORBIDDEN", "Registration is disabled on this server.");
    const input = registerSchema.parse(req.body);
    const exists = await ctx.db.user.findUnique({ where: { email: input.email } });
    if (exists) throw new AppError("CONFLICT", "An account with that email already exists.");
    const user = await ctx.db.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      },
    });
    setSessionCookie(ctx, reply, await ctx.tokens.signSession(user.id), SESSION_TTL_SECONDS);
    return reply.code(201).send({ user: userDto(user) });
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSessionCookie(ctx, reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => {
    const userId = await requireUser(ctx, req);
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("UNAUTHORIZED");
    return { user: userDto(user) };
  });

  app.patch("/api/auth/me", strict, async (req) => {
    const userId = await requireUser(ctx, req);
    const input = profileUpdateSchema.parse(req.body);
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("UNAUTHORIZED");
    const data: { name?: string; passwordHash?: string } = {};
    if (input.name) data.name = input.name;
    if (input.newPassword) {
      if (!(await verifyPassword(input.currentPassword ?? "", user.passwordHash))) {
        throw new AppError("BAD_REQUEST", "Current password is incorrect.");
      }
      data.passwordHash = await hashPassword(input.newPassword);
    }
    const updated = await ctx.db.user.update({ where: { id: userId }, data });
    return { user: userDto(updated) };
  });

  /** Short-lived credential for the WebSocket handshake (the socket server can't see the web cookie). */
  app.get("/api/auth/socket-ticket", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    reply.header("cache-control", "no-store");
    return { ticket: await ctx.tokens.signSocketTicket(userId) };
  });
}
