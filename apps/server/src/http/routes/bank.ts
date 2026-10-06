import { bankQuerySchema, userPreferencesSchema, type BankFacetsDto } from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../db";
import { requireUser, type AppContext } from "../context";
import { questionDto, videoSelect } from "../mappers";

export function bankRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * QUESTION BANK: every question across the organiser's quizzes, filterable by text, tag,
   * category, difficulty, type and quiz. Reuse means copying (see /questions/copy), so a
   * question edited in one quiz never changes another.
   */
  app.get("/api/bank", async (req) => {
    const userId = await requireUser(ctx, req);
    const f = bankQuerySchema.parse(req.query);
    const where: Prisma.QuestionWhereInput = {
      quiz: { ownerId: userId, ...(f.quizId ? { id: f.quizId } : {}) },
      ...(f.q
        ? {
            OR: [
              { text: { contains: f.q, mode: "insensitive" } },
              { options: { some: { text: { contains: f.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
      ...(f.tag ? { tags: { has: f.tag.toLowerCase() } } : {}),
      ...(f.category ? { category: { equals: f.category, mode: "insensitive" } } : {}),
      ...(f.difficulty ? { difficulty: f.difficulty } : {}),
      ...(f.type ? { type: f.type } : {}),
    };
    const [questions, all] = await Promise.all([
      ctx.db.question.findMany({
        where,
        include: {
          options: true,
          videoAsset: videoSelect,
          quiz: { select: { id: true, title: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 300,
      }),
      ctx.db.question.findMany({
        where: { quiz: { ownerId: userId } },
        select: { tags: true, category: true },
      }),
    ]);
    const tagCounts = new Map<string, number>();
    const catCounts = new Map<string, number>();
    for (const q of all) {
      for (const t of q.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      if (q.category) catCounts.set(q.category, (catCounts.get(q.category) ?? 0) + 1);
    }
    const facets: BankFacetsDto = {
      tags: [...tagCounts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
      categories: [...catCounts]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => a.category.localeCompare(b.category)),
    };
    return {
      questions: questions.map((q) => ({
        ...questionDto(q),
        quizId: q.quiz.id,
        quizTitle: q.quiz.title,
      })),
      total: questions.length,
      facets,
    };
  });

  /** Organiser defaults for new quizzes (settings and arena look). */
  app.get("/api/me/preferences", async (req) => {
    const userId = await requireUser(ctx, req);
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const parsed = userPreferencesSchema.safeParse(user.preferences ?? {});
    return { preferences: parsed.success ? parsed.data : {} };
  });

  app.patch("/api/me/preferences", async (req) => {
    const userId = await requireUser(ctx, req);
    const patch = userPreferencesSchema.parse(req.body);
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const current = userPreferencesSchema.safeParse(user.preferences ?? {});
    const base = current.success ? current.data : {};
    const next = {
      ...base,
      ...(patch.quizDefaults
        ? { quizDefaults: { ...base.quizDefaults, ...patch.quizDefaults } }
        : {}),
      ...(patch.appearance ? { appearance: patch.appearance } : {}),
    };
    await ctx.db.user.update({ where: { id: userId }, data: { preferences: next } });
    return { preferences: next };
  });
}
