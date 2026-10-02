import {
  QUESTION_TYPE_RULES,
  MAX_QUESTIONS_PER_QUIZ,
  questionInputSchema,
  questionIssues,
  questionUpdateSchema,
  quizCreateSchema,
  quizUpdateSchema,
  reorderSchema,
  type QuestionType,
} from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { requireUser, type AppContext } from "../context";
import { questionDto, quizDto, quizSummaryDto } from "../mappers";

const idParams = z.object({ id: z.string().min(1).max(64) });
const listQuery = z.object({
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  q: z.string().max(120).optional(),
});

const counts = { _count: { select: { questions: true, sessions: true } } } as const;
const withQuestions = { ...counts, questions: { include: { options: true }, orderBy: { order: "asc" } } } as const;

function defaultOptions(type: QuestionType) {
  const rules = QUESTION_TYPE_RULES[type];
  if (rules.fixedOptions) return rules.fixedOptions.map((text, i) => ({ text, isCorrect: i === 0 }));
  return Array.from({ length: rules.maxOptions }, () => ({ text: "", isCorrect: false }));
}

export function quizRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Loads a quiz the caller owns. Missing and foreign quizzes are indistinguishable (404). */
  const ownedQuiz = async (userId: string, id: string) => {
    const quiz = await ctx.db.quiz.findFirst({ where: { id, ownerId: userId }, include: withQuestions });
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

  const touchQuiz = (quizId: string) => ctx.db.quiz.update({ where: { id: quizId }, data: { updatedAt: new Date() } });

  app.get("/api/quizzes", async (req) => {
    const userId = await requireUser(ctx, req);
    const { status, q } = listQuery.parse(req.query);
    const quizzes = await ctx.db.quiz.findMany({
      where: { ownerId: userId, status, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
      include: counts,
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return { quizzes: quizzes.map(quizSummaryDto) };
  });

  app.post("/api/quizzes", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const input = quizCreateSchema.parse(req.body);
    const quiz = await ctx.db.quiz.create({
      data: {
        ownerId: userId,
        title: input.title,
        description: input.description,
        questions: {
          create: { order: 0, type: "MULTIPLE_CHOICE", options: { create: defaultOptions("MULTIPLE_CHOICE").map((o, i) => ({ ...o, order: i })) } },
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
    const { id: _id, ownerId: _o, createdAt: _c, updatedAt: _u, questions, _count: _n, ...settings } = source;
    const copy = await ctx.db.quiz.create({
      data: {
        ...settings,
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
            options: { create: q.options.map((o) => ({ order: o.order, text: o.text, isCorrect: o.isCorrect })) },
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
      throw new AppError("BAD_REQUEST", `A quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions.`);
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const type = (body.type as QuestionType | undefined) ?? "MULTIPLE_CHOICE";
    const input = questionInputSchema.parse({ type, text: "", options: defaultOptions(type), ...body });
    const order = quiz.questions.length;

    const question = await ctx.db.question.create({
      data: {
        quizId: id,
        order,
        type: input.type,
        text: input.text,
        imageUrl: input.imageUrl,
        timeLimitSec: input.timeLimitSec,
        points: input.points,
        explanation: input.explanation,
        randomizeAnswers: input.randomizeAnswers,
        options: { create: input.options.map((o, i) => ({ order: i, text: o.text, isCorrect: o.isCorrect })) },
      },
      include: { options: true },
    });
    await touchQuiz(id);
    return reply.code(201).send({ question: questionDto(question) });
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
      questionIds.map((qid, order) => ctx.db.question.update({ where: { id: qid }, data: { order } })),
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
    let options = patch.options ?? existing.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }));
    const rules = QUESTION_TYPE_RULES[type];
    if (rules.fixedOptions) {
      // Switching to a fixed-option type keeps the correct choice when it maps cleanly.
      const correctIndex = Math.max(0, options.findIndex((o) => o.isCorrect));
      options = rules.fixedOptions.map((text, i) => ({ text, isCorrect: i === Math.min(correctIndex, 1) }));
    } else if (options.length > rules.maxOptions) {
      options = options.slice(0, rules.maxOptions);
    }

    // Full structural validation of the merged question.
    const merged = questionInputSchema.parse({
      type,
      text: patch.text ?? existing.text,
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
      timeLimitSec: patch.timeLimitSec !== undefined ? patch.timeLimitSec : existing.timeLimitSec,
      points: patch.points ?? existing.points,
      explanation: patch.explanation ?? existing.explanation,
      randomizeAnswers: patch.randomizeAnswers ?? existing.randomizeAnswers,
      options,
    });

    // Update options in place by position so their ids stay stable for the editor.
    const ops = [];
    for (let i = 0; i < Math.max(existing.options.length, merged.options.length); i++) {
      const before = existing.options[i];
      const after = merged.options[i];
      if (before && after) {
        ops.push(ctx.db.answerOption.update({ where: { id: before.id }, data: { text: after.text, isCorrect: after.isCorrect, order: i } }));
      } else if (after) {
        ops.push(ctx.db.answerOption.create({ data: { questionId: id, order: i, text: after.text, isCorrect: after.isCorrect } }));
      } else if (before) {
        ops.push(ctx.db.answerOption.delete({ where: { id: before.id } }));
      }
    }
    const { options: _ignored, ...fields } = merged;
    await ctx.db.$transaction([
      ...ops,
      ctx.db.question.update({ where: { id }, data: fields }),
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

  app.post("/api/questions/:id/duplicate", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const q = await ownedQuestion(userId, id);
    const total = await ctx.db.question.count({ where: { quizId: q.quizId } });
    if (total >= MAX_QUESTIONS_PER_QUIZ) {
      throw new AppError("BAD_REQUEST", `A quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions.`);
    }
    const [, copy] = await ctx.db.$transaction([
      ctx.db.question.updateMany({ where: { quizId: q.quizId, order: { gt: q.order } }, data: { order: { increment: 1 } } }),
      ctx.db.question.create({
        data: {
          quizId: q.quizId,
          order: q.order + 1,
          type: q.type,
          text: q.text,
          imageUrl: q.imageUrl,
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          explanation: q.explanation,
          randomizeAnswers: q.randomizeAnswers,
          options: { create: q.options.map((o) => ({ order: o.order, text: o.text, isCorrect: o.isCorrect })) },
        },
        include: { options: true },
      }),
      ctx.db.quiz.update({ where: { id: q.quizId }, data: { updatedAt: new Date() } }),
    ]);
    return reply.code(201).send({ question: questionDto(copy) });
  });
}
