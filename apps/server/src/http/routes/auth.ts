import { loginSchema, profileUpdateSchema, registerSchema } from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { SESSION_TTL_SECONDS, getDummyHash, hashPassword, verifyPassword } from "../../lib/auth";
import { AppError } from "../../lib/errors";
import { LoginThrottle, PasswordGate } from "../../lib/login-guard";
import { clearSessionCookie, requireUser, setSessionCookie, type AppContext } from "../context";
import { userDto } from "../mappers";

const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

export function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const passwords = new PasswordGate();
  const throttle = new LoginThrottle();

  app.post("/api/auth/login", strict, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const key = email.toLowerCase();
    throttle.assertAllowed(key);
    const user = await ctx.db.user.findUnique({ where: { email } });
    // Always run a bcrypt compare so response time doesn't reveal which emails exist.
    const hash = user?.passwordHash ?? (await getDummyHash());
    const ok = await passwords.run(() => verifyPassword(password, hash));
    if (!user || !ok) {
      throttle.failed(key);
      throw new AppError("UNAUTHORIZED", "Email or password is incorrect.");
    }
    throttle.succeeded(key);
    setSessionCookie(
      ctx,
      reply,
      await ctx.tokens.signSession(user.id, user.sessionVersion),
      SESSION_TTL_SECONDS,
    );
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
        passwordHash: await passwords.run(() => hashPassword(input.password)),
      },
    });
    setSessionCookie(
      ctx,
      reply,
      await ctx.tokens.signSession(user.id, user.sessionVersion),
      SESSION_TTL_SECONDS,
    );
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

  app.patch("/api/auth/me", strict, async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const input = profileUpdateSchema.parse(req.body);
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("UNAUTHORIZED");
    const data: { name?: string; passwordHash?: string; sessionVersion?: { increment: 1 } } = {};
    if (input.name) data.name = input.name;
    if (input.newPassword) {
      const current = input.currentPassword ?? "";
      if (!(await passwords.run(() => verifyPassword(current, user.passwordHash)))) {
        throw new AppError("BAD_REQUEST", "Current password is incorrect.");
      }
      const next = input.newPassword;
      data.passwordHash = await passwords.run(() => hashPassword(next));
      // Sign out every other device; this one gets a fresh session below.
      data.sessionVersion = { increment: 1 };
    }
    const updated = await ctx.db.user.update({ where: { id: userId }, data });
    if (data.sessionVersion) {
      setSessionCookie(
        ctx,
        reply,
        await ctx.tokens.signSession(updated.id, updated.sessionVersion),
        SESSION_TTL_SECONDS,
      );
    }
    return { user: userDto(updated) };
  });

  /** Short-lived credential for the WebSocket handshake (the socket server can't see the web cookie). */
  app.get("/api/auth/socket-ticket", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    reply.header("cache-control", "no-store");
    return { ticket: await ctx.tokens.signSocketTicket(userId) };
  });
}
