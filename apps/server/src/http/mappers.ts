import type {
  FinalResults,
  QuestionDto,
  QuizDto,
  QuizSummaryDto,
  SessionSummaryDto,
  UserDto,
} from "@quizarena/shared";
import type { AnswerOption, Question, Quiz, QuizSession, User } from "../db";
import type { QuizSnapshot } from "../game/snapshot";

export const userDto = (u: User): UserDto => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt.toISOString(),
});

export const questionDto = (q: Question & { options: AnswerOption[] }): QuestionDto => ({
  id: q.id,
  order: q.order,
  type: q.type,
  text: q.text,
  imageUrl: q.imageUrl,
  timeLimitSec: q.timeLimitSec,
  points: q.points,
  explanation: q.explanation,
  randomizeAnswers: q.randomizeAnswers,
  options: [...q.options]
    .sort((a, b) => a.order - b.order)
    .map((o) => ({ id: o.id, order: o.order, text: o.text, isCorrect: o.isCorrect })),
  updatedAt: q.updatedAt.toISOString(),
});

export const quizSummaryDto = (
  q: Quiz & { _count: { questions: number; sessions: number } },
): QuizSummaryDto => ({
  id: q.id,
  title: q.title,
  description: q.description,
  coverImageUrl: q.coverImageUrl,
  status: q.status,
  questionCount: q._count.questions,
  playCount: q._count.sessions,
  createdAt: q.createdAt.toISOString(),
  updatedAt: q.updatedAt.toISOString(),
});

export const quizDto = (
  q: Quiz & {
    _count: { questions: number; sessions: number };
    questions: (Question & { options: AnswerOption[] })[];
  },
): QuizDto => ({
  ...quizSummaryDto(q),
  defaultTimerSec: q.defaultTimerSec,
  scoringMode: q.scoringMode,
  streakBonus: q.streakBonus,
  randomizeQuestions: q.randomizeQuestions,
  randomizeAnswers: q.randomizeAnswers,
  showLeaderboard: q.showLeaderboard,
  showCorrectAnswers: q.showCorrectAnswers,
  showAnswerStats: q.showAnswerStats,
  allowLateJoin: q.allowLateJoin,
  participantLimit: q.participantLimit,
  soundEnabled: q.soundEnabled,
  nicknameFilter: q.nicknameFilter,
  questions: [...q.questions].sort((a, b) => a.order - b.order).map(questionDto),
});

export const sessionDto = (
  s: QuizSession & { _count: { participants: number } },
): SessionSummaryDto => ({
  id: s.id,
  code: s.code,
  status: s.status,
  quizId: s.quizId,
  quizTitle: s.quizTitle,
  participantCount: s._count.participants,
  questionCount: (s.quizSnapshot as unknown as QuizSnapshot).questions?.length ?? 0,
  createdAt: s.createdAt.toISOString(),
  startedAt: s.startedAt?.toISOString() ?? null,
  endedAt: s.endedAt?.toISOString() ?? null,
});

/** Rebuilds the FinalResults shape from stored rows (used for historical sessions). */
export function resultsFromRows(
  rows: {
    participantId: string;
    rank: number;
    score: number;
    correctCount: number;
    answeredCount: number;
    totalQuestions: number;
    avgResponseMs: number | null;
    bestStreak: number;
    participant: { nickname: string };
  }[],
  totalQuestions: number,
): FinalResults {
  const played = rows[0]?.totalQuestions ?? 0;
  const standings = [...rows]
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      participantId: r.participantId,
      nickname: r.participant.nickname,
      score: r.score,
      rank: r.rank,
      previousRank: null,
      correctCount: r.correctCount,
      streak: r.bestStreak,
      lastPoints: 0,
      accuracy: played ? r.correctCount / played : 0,
      avgResponseMs: r.avgResponseMs,
      bestStreak: r.bestStreak,
      answeredCount: r.answeredCount,
    }));
  const timed = standings.filter((s) => s.avgResponseMs !== null);
  return {
    totalQuestions,
    playedQuestions: played,
    participantCount: standings.length,
    averageAccuracy: standings.length
      ? standings.reduce((s, x) => s + x.accuracy, 0) / standings.length
      : 0,
    averageResponseMs: timed.length
      ? timed.reduce((s, x) => s + (x.avgResponseMs ?? 0), 0) / timed.length
      : null,
    standings,
  };
}
