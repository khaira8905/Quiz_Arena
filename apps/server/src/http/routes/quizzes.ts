import {
  copyQuestionsSchema,
  userPreferencesSchema,
  QUESTION_TYPES,
  QUESTION_TYPE_RULES,
  MAX_QUESTIONS_PER_QUIZ,
  questionImportSchema,
  questionInputSchema,
  questionIssues,
  questionUpdateSchema,
  quizCreateSchema,
  quizUpdateSchema,
  reorderSchema,
  type QuestionInput,
  type QuestionType,
} from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "../../db";
import { AppError } from "../../lib/errors";
import { requireUser, type AppContext } from "../context";
import { questionDto, quizDto, quizSummaryDto } from "../mappers";

const idParams = z.object({ id: z.string().min(1).max(64) });
const listQuery = z.object({
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  q: z.string().max(120).optional(),
});

const counts = { _count: { select: { questions: true, sessions: true } } } as const;
const withQuestions = {
  ...counts,
  questions: { include: { options: true }, orderBy: { order: "asc" } },
} as const;

function questionCreateData(q: QuestionInput, order: number) {
  return {
    order,
    type: q.type,
    text: q.text,
    // Bulk paths (create, import) take external links only; library images attach by PATCH.
    imageUrl: q.imageUrl,
    imageFit: q.imageFit,
    imagePosition: q.imagePosition,
    timeLimitSec: q.timeLimitSec,
    points: q.points,
    explanation: q.explanation,
    randomizeAnswers: q.randomizeAnswers,
    tags: q.tags,
    category: q.category,
    difficulty: q.difficulty,
    options: {
      create: q.options.map((o, i) => ({ order: i, text: o.text, isCorrect: o.isCorrect })),
    },
  };
}

function defaultOptions(type: QuestionType) {
  const rules = QUESTION_TYPE_RULES[type];
  if (rules.fixedOptions)
    return rules.fixedOptions.map((text, i) => ({ text, isCorrect: i === 0 }));
  return Array.from({ length: rules.maxOptions }, () => ({ text: "", isCorrect: false }));
}

export function quizRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Loads a quiz the caller owns. Missing and foreign quizzes are indistinguishable (404). */
  const ownedQuiz = async (userId: string, id: string) => {
    const quiz = await ctx.db.quiz.findFirst({
      where: { id, ownerId: userId },
      include: withQuestions,
    });
    if (!quiz) throw new AppError("NOT_FOUND", "Quiz not found.");
    return quiz;
  };

  const ownedQuestion = async (userId: string, id: string) => {
    const question = await ctx.db.question.findFirst({
      where: { id, quiz: { ownerId: userId } },
      include: { options: { orderBy: { order: "asc" } } },
    });
    if (!question) throw new AppError("NOT_FOUND", "Question not found.");
    return question;
  };

  const touchQuiz = (quizId: string) =>
    ctx.db.quiz.update({ where: { id: quizId }, data: { updatedAt: new Date() } });

  app.get("/api/quizzes", async (req) => {
    const userId = await requireUser(ctx, req);
    const { status, q } = listQuery.parse(req.query);
    const quizzes = await ctx.db.quiz.findMany({
      where: {
        ownerId: userId,
        status,
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      include: counts,
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return { quizzes: quizzes.map(quizSummaryDto) };
  });

  app.post("/api/quizzes", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const input = quizCreateSchema.parse(req.body);
    // The organiser's defaults (Settings, Customize Arena) seed every new quiz.
    const owner = await ctx.db.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const prefs = userPreferencesSchema.safeParse(owner?.preferences ?? {});
    const defaults = prefs.success ? prefs.data : {};
    const appearance = input.theme
      ? { ...(defaults.appearance ?? {}), theme: input.theme, accent: null, answerColors: null }
      : (defaults.appearance ?? null);
    const quiz = await ctx.db.quiz.create({
      data: {
        ownerId: userId,
        title: input.title,
        description: input.description,
        ...(defaults.quizDefaults ?? {}),
        appearance: appearance ?? Prisma.JsonNull,
        questions: {
          create: input.questions
            ? input.questions.map((q, order) => questionCreateData(q, order))
            : {
                order: 0,
                type: "MULTIPLE_CHOICE",
                options: {
                  create: defaultOptions("MULTIPLE_CHOICE").map((o, i) => ({ ...o, order: i })),
                },
              },
        },
      },
      include: withQuestions,
    });
    return reply.code(201).send({ quiz: quizDto(quiz) });
  });

  app.get("/api/quizzes/:id", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    return { quiz: quizDto(await ownedQuiz(userId, id)) };
  });

  app.patch("/api/quizzes/:id", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const input = quizUpdateSchema.parse(req.body);
    const existing = await ownedQuiz(userId, id);

    if (input.status === "PUBLISHED") {
      if (existing.questions.length === 0) throw new AppError("QUIZ_EMPTY");
      const problems = existing.questions
        .map((q, i) => ({ index: i + 1, issues: questionIssues(q) }))
        .filter((p) => p.issues.length > 0);
      if (problems.length > 0) {
        throw new AppError(
          "BAD_REQUEST",
          `Fix ${problems.length} question${problems.length > 1 ? "s" : ""} before publishing.`,
          { problems },
        );
      }
    }

    const quiz = await ctx.db.quiz.update({ where: { id }, data: input, include: withQuestions });
    return { quiz: quizDto(quiz) };
  });

  app.delete("/api/quizzes/:id", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    await ownedQuiz(userId, id);
    // Past sessions keep their frozen snapshot and results (quizId becomes null).
    await ctx.db.quiz.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/api/quizzes/:id/duplicate", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const source = await ownedQuiz(userId, id);
    const {
      id: _id,
      ownerId: _o,
      createdAt: _c,
      updatedAt: _u,
      questions,
      _count: _n,
      appearance,
      ...settings
    } = source;
    const copy = await ctx.db.quiz.create({
      data: {
        ...settings,
        appearance: appearance ?? Prisma.JsonNull,
        ownerId: userId,
        title: `${source.title} (copy)`.slice(0, 120),
        status: "DRAFT",
        questions: {
          create: questions.map((q) => ({
            order: q.order,
            type: q.type,
            text: q.text,
            imageUrl: q.imageUrl,
            timeLimitSec: q.timeLimitSec,
            points: q.points,
            explanation: q.explanation,
            randomizeAnswers: q.randomizeAnswers,
            options: {
              create: q.options.map((o) => ({
                order: o.order,
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
          })),
        },
      },
      include: withQuestions,
    });
    return reply.code(201).send({ quiz: quizDto(copy) });
  });

  /* ---------------------------------------------------------------- questions */

  app.post("/api/quizzes/:id/questions", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const quiz = await ownedQuiz(userId, id);
    if (quiz.questions.length >= MAX_QUESTIONS_PER_QUIZ) {
      throw new AppError(
        "BAD_REQUEST",
        `A quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions.`,
      );
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const type: QuestionType =
      z.enum(QUESTION_TYPES).optional().parse(body.type) ?? "MULTIPLE_CHOICE";
    const input = questionInputSchema.parse({
      type,
      text: "",
      options: defaultOptions(type),
      ...body,
    });
    const order = quiz.questions.length;

    const question = await ctx.db.question.create({
      data: {
        quizId: id,
        order,
        type: input.type,
        text: input.text,
        imageUrl: input.imageUrl,
        imageFit: input.imageFit,
        imagePosition: input.imagePosition,
        timeLimitSec: input.timeLimitSec,
        points: input.points,
        explanation: input.explanation,
        randomizeAnswers: input.randomizeAnswers,
        tags: input.tags,
        category: input.category,
        difficulty: input.difficulty,
        options: {
          create: input.options.map((o, i) => ({ order: i, text: o.text, isCorrect: o.isCorrect })),
        },
      },
      include: { options: true },
    });
    await touchQuiz(id);
    return reply.code(201).send({ question: questionDto(question) });
  });

  /**
   * Bulk add from a spreadsheet import, in one transaction: either every question lands or
   * none does. The untouched blank question a new quiz starts with is replaced, not kept.
   */
  app.post("/api/quizzes/:id/questions/import", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const { questions } = questionImportSchema.parse(req.body);
    const quiz = await ownedQuiz(userId, id);
    const blank = quiz.questions.filter(
      (q) => !q.text.trim() && q.options.every((o) => !o.text.trim()) && !q.imageUrl,
    );
    const kept = quiz.questions.length - blank.length;
    if (kept + questions.length > MAX_QUESTIONS_PER_QUIZ) {
      throw new AppError(
        "BAD_REQUEST",
        `A quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions. This quiz has room for ${
          MAX_QUESTIONS_PER_QUIZ - kept
        } more.`,
      );
    }
    await ctx.db.$transaction(async (tx) => {
      if (blank.length)
        await tx.question.deleteMany({ where: { id: { in: blank.map((q) => q.id) } } });
      // Renumber what's left so imported questions follow on without gaps.
      const remaining = quiz.questions.filter((q) => !blank.includes(q));
      for (const [order, q] of remaining.entries()) {
        if (q.order !== order) await tx.question.update({ where: { id: q.id }, data: { order } });
      }
      for (const [i, q] of questions.entries()) {
        await tx.question.create({ data: { quizId: id, ...questionCreateData(q, kept + i) } });
      }
      await tx.quiz.update({ where: { id }, data: { updatedAt: new Date() } });
    });
    const updated = await ctx.db.quiz.findUniqueOrThrow({ where: { id }, include: withQuestions });
    return reply.code(201).send({ quiz: quizDto(updated), imported: questions.length });
  });

  app.put("/api/quizzes/:id/questions/order", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const { questionIds } = reorderSchema.parse(req.body);
    const quiz = await ownedQuiz(userId, id);
    const current = new Set(quiz.questions.map((q) => q.id));
    if (questionIds.length !== current.size || !questionIds.every((qid) => current.has(qid))) {
      throw new AppError("CONFLICT", "The question list changed. Refresh and try again.");
    }
    await ctx.db.$transaction(
      questionIds.map((qid, order) =>
        ctx.db.question.update({ where: { id: qid }, data: { order } }),
      ),
    );
    await touchQuiz(id);
    return { quiz: quizDto(await ownedQuiz(userId, id)) };
  });

  app.patch("/api/questions/:id", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const patch = questionUpdateSchema.parse(req.body);
    const existing = await ownedQuestion(userId, id);

    const type = patch.type ?? existing.type;
    let options =
      patch.options ?? existing.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }));
    const rules = QUESTION_TYPE_RULES[type];
    if (rules.fixedOptions) {
      // Switching to a fixed-option type keeps the correct choice when it maps cleanly.
      const correctIndex = Math.max(
        0,
        options.findIndex((o) => o.isCorrect),
      );
      options = rules.fixedOptions.map((text, i) => ({
        text,
        isCorrect: i === Math.min(correctIndex, 1),
      }));
    } else if (options.length > rules.maxOptions) {
      options = options.slice(0, rules.maxOptions);
    }

    // The image: a library asset (its URL is filled in here, never trusted from the client),
    // an external https link, or nothing.
    let image = { imageUrl: existing.imageUrl, imageAssetId: existing.imageAssetId };
    if (patch.imageAssetId) {
      const asset = await ctx.db.mediaAsset.findFirst({
        where: { id: patch.imageAssetId, ownerId: userId },
        select: { id: true, url: true },
      });
      if (!asset) throw new AppError("NOT_FOUND", "That image isn't in your media library.");
      image = { imageUrl: asset.url, imageAssetId: asset.id };
    } else if (patch.imageUrl !== undefined || patch.imageAssetId === null) {
      image = { imageUrl: patch.imageUrl ?? null, imageAssetId: null };
    }

    // Full structural validation of the merged question.
    const merged = questionInputSchema.parse({
      type,
      text: patch.text ?? existing.text,
      // Library URLs may be same-origin paths in development; only links are validated.
      imageUrl: image.imageAssetId ? null : image.imageUrl,
      imageFit: patch.imageFit ?? existing.imageFit,
      imagePosition: patch.imagePosition ?? existing.imagePosition,
      timeLimitSec: patch.timeLimitSec !== undefined ? patch.timeLimitSec : existing.timeLimitSec,
      points: patch.points ?? existing.points,
      explanation: patch.explanation ?? existing.explanation,
      randomizeAnswers: patch.randomizeAnswers ?? existing.randomizeAnswers,
      tags: patch.tags ?? existing.tags,
      category: patch.category ?? existing.category,
      difficulty: patch.difficulty !== undefined ? patch.difficulty : existing.difficulty,
      options,
    });

    // Update options in place by position so their ids stay stable for the editor.
    const ops = [];
    for (let i = 0; i < Math.max(existing.options.length, merged.options.length); i++) {
      const before = existing.options[i];
      const after = merged.options[i];
      if (before && after) {
        ops.push(
          ctx.db.answerOption.update({
            where: { id: before.id },
            data: { text: after.text, isCorrect: after.isCorrect, order: i },
          }),
        );
      } else if (after) {
        ops.push(
          ctx.db.answerOption.create({
            data: { questionId: id, order: i, text: after.text, isCorrect: after.isCorrect },
          }),
        );
      } else if (before) {
        ops.push(ctx.db.answerOption.delete({ where: { id: before.id } }));
      }
    }
    const { options: _ignored, ...fields } = merged;
    await ctx.db.$transaction([
      ...ops,
      ctx.db.question.update({ where: { id }, data: { ...fields, ...image } }),
      ctx.db.quiz.update({ where: { id: existing.quizId }, data: { updatedAt: new Date() } }),
    ]);
    const question = await ownedQuestion(userId, id);
    return { question: questionDto(question) };
  });

  app.delete("/api/questions/:id", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const question = await ownedQuestion(userId, id);
    await ctx.db.$transaction([
      ctx.db.question.delete({ where: { id } }),
      ctx.db.question.updateMany({
        where: { quizId: question.quizId, order: { gt: question.order } },
        data: { order: { decrement: 1 } },
      }),
      ctx.db.quiz.update({ where: { id: question.quizId }, data: { updatedAt: new Date() } }),
    ]);
    return reply.code(204).send();
  });

  /** Copies questions (typically from the question bank) to the end of a quiz. */
  app.post("/api/quizzes/:id/questions/copy", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const { questionIds } = copyQuestionsSchema.parse(req.body);
    const quiz = await ownedQuiz(userId, id);
    const sources = await ctx.db.question.findMany({
      where: { id: { in: questionIds }, quiz: { ownerId: userId } },
      include: { options: { orderBy: { order: "asc" } } },
    });
    if (sources.length !== new Set(questionIds).size) throw new AppError("NOT_FOUND");
    if (quiz.questions.length + sources.length > MAX_QUESTIONS_PER_QUIZ) {
      throw new AppError(
        "BAD_REQUEST",
        `A quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions (${MAX_QUESTIONS_PER_QUIZ - quiz.questions.length} more fit).`,
      );
    }
    const byId = new Map(sources.map((q) => [q.id, q]));
    const ordered = [...new Set(questionIds)].map((qid) => byId.get(qid)!);
    // A brand-new quiz's untouched placeholder question gives way to the copies.
    const blank =
      quiz.questions.length === 1 &&
      !quiz.questions[0]!.text.trim() &&
      quiz.questions[0]!.options.every((o) => !o.text.trim()) &&
      !quiz.questions[0]!.imageUrl
        ? quiz.questions[0]!
        : null;
    const start = blank ? 0 : quiz.questions.length;
    await ctx.db.$transaction([
      ...(blank ? [ctx.db.question.delete({ where: { id: blank.id } })] : []),
      ...ordered.map((q, i) =>
        ctx.db.question.create({
          data: {
            quizId: id,
            order: start + i,
            type: q.type,
            text: q.text,
            imageUrl: q.imageUrl,
            imageAssetId: q.imageAssetId,
            imageFit: q.imageFit,
            imagePosition: q.imagePosition,
            timeLimitSec: q.timeLimitSec,
            points: q.points,
            explanation: q.explanation,
            randomizeAnswers: q.randomizeAnswers,
            tags: q.tags,
            category: q.category,
            difficulty: q.difficulty,
            options: {
              create: q.options.map((o) => ({
                order: o.order,
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
          },
        }),
      ),
      ctx.db.quiz.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    return { quiz: quizDto(await ownedQuiz(userId, id)) };
  });

  app.post("/api/questions/:id/duplicate", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const q = await ownedQuestion(userId, id);
    const total = await ctx.db.question.count({ where: { quizId: q.quizId } });
    if (total >= MAX_QUESTIONS_PER_QUIZ) {
      throw new AppError(
        "BAD_REQUEST",
        `A quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions.`,
      );
    }
    const [, copy] = await ctx.db.$transaction([
      ctx.db.question.updateMany({
        where: { quizId: q.quizId, order: { gt: q.order } },
        data: { order: { increment: 1 } },
      }),
      ctx.db.question.create({
        data: {
          quizId: q.quizId,
          order: q.order + 1,
          type: q.type,
          text: q.text,
          imageUrl: q.imageUrl,
          imageAssetId: q.imageAssetId,
          imageFit: q.imageFit,
          imagePosition: q.imagePosition,
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          explanation: q.explanation,
          randomizeAnswers: q.randomizeAnswers,
          tags: q.tags,
          category: q.category,
          difficulty: q.difficulty,
          options: {
            create: q.options.map((o) => ({
              order: o.order,
              text: o.text,
              isCorrect: o.isCorrect,
            })),
          },
        },
        include: { options: true },
      }),
      ctx.db.quiz.update({ where: { id: q.quizId }, data: { updatedAt: new Date() } }),
    ]);
    return reply.code(201).send({ question: questionDto(copy) });
  });
}
