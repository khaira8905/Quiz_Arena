import {
  gameCodeSchema,
  sessionCreateSchema,
  type DashboardDto,
  type GameLookupDto,
} from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildSnapshot } from "../../game/snapshot";
import { AppError } from "../../lib/errors";
import { requireUser, type AppContext } from "../context";
import { quizSummaryDto, resultsFromRows, sessionDto } from "../mappers";

const idParams = z.object({ id: z.string().min(1).max(64) });
const listQuery = z.object({ scope: z.enum(["active", "past", "all"]).default("all") });
const ACTIVE = ["LOBBY", "LIVE"] as const;

/** Neutralises spreadsheet formula injection and quotes CSV fields. */
function csvCell(value: string | number | null): string {
  let s = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionRoutes(app: FastifyInstance, ctx: AppContext) {
  const counts = { _count: { select: { participants: true } } } as const;

  const ownedSession = async (userId: string, id: string) => {
    const session = await ctx.db.quizSession.findFirst({
      where: { id, hostId: userId },
      include: counts,
    });
    if (!session) throw new AppError("NOT_FOUND", "Session not found.");
    return session;
  };

  app.post("/api/sessions", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { quizId } = sessionCreateSchema.parse(req.body);
    const quiz = await ctx.db.quiz.findFirst({
      where: { id: quizId, ownerId: userId },
      include: {
        questions: {
          include: {
            options: { orderBy: { order: "asc" } },
            imageAsset: { select: { placeholder: true } },
            videoAsset: { select: { url: true, posterUrl: true, durationMs: true } },
          },
          orderBy: { order: "asc" },
        },
      },
    });
    if (!quiz) throw new AppError("NOT_FOUND", "Quiz not found.");

    const snapshot = buildSnapshot(quiz);
    const code = await ctx.games.allocateCode(
      async (c) =>
        (await ctx.db.quizSession.count({ where: { code: c, status: { in: [...ACTIVE] } } })) > 0,
    );
    const session = await ctx.db.quizSession.create({
      data: {
        code,
        quizId: quiz.id,
        hostId: userId,
        quizTitle: quiz.title,
        quizSnapshot: snapshot as unknown as object,
      },
      include: counts,
    });
    ctx.games.create({ sessionId: session.id, code, hostId: userId, snapshot });
    return reply.code(201).send({ session: sessionDto(session) });
  });

  app.get("/api/sessions", async (req) => {
    const userId = await requireUser(ctx, req);
    const { scope } = listQuery.parse(req.query);
    const status =
      scope === "active"
        ? { in: [...ACTIVE] }
        : scope === "past"
          ? { in: ["FINISHED", "ABANDONED"] as ("FINISHED" | "ABANDONED")[] }
          : undefined;
    const sessions = await ctx.db.quizSession.findMany({
      where: { hostId: userId, status },
      include: counts,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { sessions: sessions.map(sessionDto) };
  });

  app.get("/api/sessions/:id", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const session = await ownedSession(userId, id);
    const room = ctx.games.get(session.code);
    const live =
      room && room.sessionId === session.id
        ? { phase: room.currentPhase, players: room.participantCount }
        : null;
    return { session: sessionDto(session), live };
  });

  const loadResults = async (userId: string, id: string) => {
    const session = await ownedSession(userId, id);
    if (session.status !== "FINISHED")
      throw new AppError("CONFLICT", "Results are available once the game has finished.");
    const rows = await ctx.db.quizResult.findMany({
      where: { sessionId: id },
      include: { participant: { select: { nickname: true } } },
      orderBy: { rank: "asc" },
    });
    return {
      session: sessionDto(session),
      results: resultsFromRows(rows, sessionDto(session).questionCount),
    };
  };

  app.get("/api/sessions/:id/results", async (req) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    return loadResults(userId, id);
  });

  app.get("/api/sessions/:id/results.csv", async (req, reply) => {
    const userId = await requireUser(ctx, req);
    const { id } = idParams.parse(req.params);
    const { session, results } = await loadResults(userId, id);
    const header = [
      "rank",
      "nickname",
      "score",
      "correct",
      "answered",
      "accuracy_pct",
      "avg_response_ms",
      "best_streak",
    ];
    const lines = results.standings.map((s) =>
      [
        s.rank,
        s.nickname,
        s.score,
        s.correctCount,
        s.answeredCount,
        Math.round(s.accuracy * 100),
        s.avgResponseMs === null ? null : Math.round(s.avgResponseMs),
        s.bestStreak,
      ]
        .map(csvCell)
        .join(","),
    );
    const filename = `quizarena-${session.code}-${session.createdAt.slice(0, 10)}.csv`;
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .header("cache-control", "no-store");
    return [header.join(","), ...lines].join("\n") + "\n";
  });

  app.get("/api/dashboard", async (req): Promise<DashboardDto> => {
    const userId = await requireUser(ctx, req);
    const [
      quizzes,
      published,
      sessions,
      participants,
      liveSessions,
      recentQuizzes,
      recentSessions,
    ] = await Promise.all([
      ctx.db.quiz.count({ where: { ownerId: userId } }),
      ctx.db.quiz.count({ where: { ownerId: userId, status: "PUBLISHED" } }),
      ctx.db.quizSession.count({ where: { hostId: userId } }),
      ctx.db.participant.count({ where: { session: { hostId: userId }, removed: false } }),
      ctx.db.quizSession.count({ where: { hostId: userId, status: { in: [...ACTIVE] } } }),
      ctx.db.quiz.findMany({
        where: { ownerId: userId },
        include: { _count: { select: { questions: true, sessions: true } } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      ctx.db.quizSession.findMany({
        where: { hostId: userId },
        include: counts,
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);
    return {
      totals: {
        quizzes,
        published,
        drafts: quizzes - published,
        sessions,
        participants,
        liveSessions,
      },
      recentQuizzes: recentQuizzes.map(quizSummaryDto),
      recentSessions: recentSessions.map(sessionDto),
    };
  });

  /** Public: lets the join screen validate a code before asking for a nickname. */
  app.get(
    "/api/games/:code",
    // Generous on purpose: a whole classroom often shares one public IP (campus Wi-Fi NAT),
    // and every player's phone looks the code up once while joining.
    { config: { rateLimit: { max: 1000, timeWindow: "1 minute" } } },
    async (req): Promise<GameLookupDto> => {
      const parsed = gameCodeSchema.safeParse((req.params as { code?: string }).code ?? "");
      if (!parsed.success) throw new AppError("INVALID_GAME_CODE");
      const room = ctx.games.get(parsed.data);
      if (!room) throw new AppError("INVALID_GAME_CODE");
      if (room.isFinished) throw new AppError("GAME_ENDED");
      return {
        code: room.code,
        quizTitle: room.quizTitle,
        joinable: room.joinable,
        phase: room.currentPhase,
        appearance: room.appearance,
      };
    },
  );
}
