import type { LiveSettings, QuestionType } from "@quizarena/shared";
import { questionIssues } from "@quizarena/shared";
import { AppError } from "../lib/errors";
import { shuffle } from "../lib/random";

export interface SnapshotOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface SnapshotQuestion {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  durationMs: number;
  points: number;
  explanation: string;
  options: SnapshotOption[];
}

/** Everything a running game needs, frozen when the session is created. */
export interface QuizSnapshot {
  quizId: string;
  title: string;
  coverImageUrl: string | null;
  settings: LiveSettings;
  questions: SnapshotQuestion[];
}

interface SourceQuiz {
  id: string;
  title: string;
  coverImageUrl: string | null;
  defaultTimerSec: number;
  scoringMode: LiveSettings["scoringMode"];
  streakBonus: boolean;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  showLeaderboard: boolean;
  showCorrectAnswers: boolean;
  showAnswerStats: boolean;
  allowLateJoin: boolean;
  participantLimit: number;
  soundEnabled: boolean;
  nicknameFilter: boolean;
  questions: {
    id: string;
    type: QuestionType;
    text: string;
    imageUrl: string | null;
    timeLimitSec: number | null;
    points: number;
    explanation: string;
    randomizeAnswers: boolean;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
}

/**
 * Builds the frozen snapshot. Randomisation happens here, once, so the projector and every
 * player see the same order and results can be reproduced later from the stored snapshot.
 */
export function buildSnapshot(quiz: SourceQuiz): QuizSnapshot {
  if (quiz.questions.length === 0) throw new AppError("QUIZ_EMPTY");
  const broken = quiz.questions.findIndex((q) => questionIssues(q).length > 0);
  if (broken !== -1) {
    throw new AppError(
      "BAD_REQUEST",
      `Question ${broken + 1} isn't ready: ${questionIssues(quiz.questions[broken]!).join(", ")}`,
    );
  }

  const ordered = quiz.randomizeQuestions ? shuffle(quiz.questions) : quiz.questions;

  return {
    quizId: quiz.id,
    title: quiz.title,
    coverImageUrl: quiz.coverImageUrl,
    settings: {
      scoringMode: quiz.scoringMode,
      streakBonus: quiz.streakBonus,
      showLeaderboard: quiz.showLeaderboard,
      showCorrectAnswers: quiz.showCorrectAnswers,
      showAnswerStats: quiz.showAnswerStats,
      allowLateJoin: quiz.allowLateJoin,
      participantLimit: quiz.participantLimit,
      soundEnabled: quiz.soundEnabled,
      nicknameFilter: quiz.nicknameFilter,
    },
    questions: ordered.map((q) => {
      // True/False keeps its natural order; shuffling it only confuses players.
      const shuffleOptions =
        q.type !== "TRUE_FALSE" && (quiz.randomizeAnswers || q.randomizeAnswers);
      return {
        id: q.id,
        type: q.type,
        text: q.text,
        imageUrl: q.imageUrl,
        durationMs: (q.timeLimitSec ?? quiz.defaultTimerSec) * 1000,
        points: q.points,
        explanation: q.explanation,
        options: (shuffleOptions ? shuffle(q.options) : q.options).map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      };
    }),
  };
}
