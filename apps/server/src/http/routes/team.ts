import { teamCreateSchema, teamUpdateSchema, type TeamMemberDto } from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { User } from "../../db";
import { hashPassword } from "../../lib/auth";
import { AppError } from "../../lib/errors";
import { PasswordGate } from "../../lib/login-guard";
import { requireAdmin, type AppContext } from "../context";
import { userDto } from "../mappers";

const idParams = z.object({ id: z.string().min(1).max(64) });

const memberDto = (u: User & { _count: { quizzes: number } }): TeamMemberDto => ({
  ...userDto(u),
  disabled: u.disabled,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  quizCount: u._count.quizzes,
});

/**
 * TEAM: admins create sign-ins (email + password) for other people and share them. There
 * is no email verification: the account works immediately. Each person sees only their own
 * quizzes, media and results.
 */
export function teamRoutes(app: FastifyInstance, ctx: AppContext) {
  const passwords = new PasswordGate();
  const withCounts = { _count: { select: { quizzes: true } } } as const;

  /** At least one admin who can sign in must always remain. */
  const otherActiveAdmins = (exceptId: string) =>
    ctx.db.user.count({ where: { role: "ADMIN", disabled: false, id: { not: exceptId } } });

  app.get("/api/team", async (req) => {
    await requireAdmin(ctx, req);
    const users = await ctx.db.user.findMany({
      include: withCounts,
      orderBy: { createdAt: "asc" },
    });
    return { members: users.map(memberDto) };
  });

  app.post(
    "/api/team",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      await requireAdmin(ctx, req);
      const input = teamCreateSchema.parse(req.body);
      const exists = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (exists) throw new AppError("CONFLICT", "Someone already has an account with that email.");
      const user = await ctx.db.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash: await passwords.run(() => hashPassword(input.password)),
        },
        include: withCounts,
      });
      return reply.code(201).send({ member: memberDto(user) });
    },
  );

  app.patch("/api/team/:id", async (req) => {
    const adminId = await requireAdmin(ctx, req);
    const { id } = idParams.parse(req.params);
    const input = teamUpdateSchema.parse(req.body);
    const target = await ctx.db.user.findUnique({ where: { id } });
    if (!target) throw new AppError("NOT_FOUND");
    if (id === adminId && (input.disabled || input.role === "ORGANISER")) {
      throw new AppError(
        "BAD_REQUEST",
        "You can't disable your own account or remove your own admin role.",
      );
    }
    const losesAdmin =
      target.role === "ADMIN" && !target.disabled && (input.disabled || input.role === "ORGANISER");
    if (losesAdmin && (await otherActiveAdmins(id)) === 0) {
      throw new AppError("BAD_REQUEST", "Keep at least one active admin.");
    }
    const resetSessions = !!input.password || input.disabled === true;
    const user = await ctx.db.user.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
        ...(input.password
          ? { passwordHash: await passwords.run(() => hashPassword(input.password!)) }
          : {}),
        // A new password or a disabled account signs them out on every device.
        ...(resetSessions ? { sessionVersion: { increment: 1 } } : {}),
      },
      include: withCounts,
    });
    return { member: memberDto(user) };
  });

  /** Deletes the account and everything it owns (quizzes, results, media records). */
  app.delete("/api/team/:id", async (req, reply) => {
    const adminId = await requireAdmin(ctx, req);
    const { id } = idParams.parse(req.params);
    if (id === adminId) throw new AppError("BAD_REQUEST", "You can't delete your own account.");
    const target = await ctx.db.user.findUnique({ where: { id } });
    if (!target) throw new AppError("NOT_FOUND");
    if (target.role === "ADMIN" && !target.disabled && (await otherActiveAdmins(id)) === 0) {
      throw new AppError("BAD_REQUEST", "Keep at least one active admin.");
    }
    if (ctx.games.hasActiveGameFor(id)) {
      throw new AppError("CONFLICT", "They're hosting a live game right now. End it first.");
    }
    await ctx.db.user.delete({ where: { id } });
    return reply.code(204).send();
  });
}
