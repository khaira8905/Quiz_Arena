import type { FinalResults } from "./game";
import type { QuestionType } from "./question-types";
import type { QuizSettings } from "./schemas";

/** REST response shapes, shared so the admin UI is typed end-to-end. */

export type QuizStatus = "DRAFT" | "PUBLISHED";
export type SessionStatus = "LOBBY" | "LIVE" | "FINISHED" | "ABANDONED";

export interface UserDto {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface OptionDto {
  id: string;
  order: number;
  text: string;
  isCorrect: boolean;
}

export interface QuestionDto {
  id: string;
  order: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  timeLimitSec: number | null;
  points: number;
  explanation: string;
  randomizeAnswers: boolean;
  options: OptionDto[];
  updatedAt: string;
}

export interface QuizSummaryDto {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  status: QuizStatus;
  questionCount: number;
  playCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizDto extends QuizSummaryDto, QuizSettings {
  questions: QuestionDto[];
}

export interface SessionSummaryDto {
  id: string;
  code: string;
  status: SessionStatus;
  quizId: string | null;
  quizTitle: string;
  participantCount: number;
  questionCount: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface SessionResultsDto {
  session: SessionSummaryDto;
  results: FinalResults;
}

export interface DashboardDto {
  totals: {
    quizzes: number;
    published: number;
    drafts: number;
    sessions: number;
    participants: number;
    liveSessions: number;
  };
  recentQuizzes: QuizSummaryDto[];
  recentSessions: SessionSummaryDto[];
}

export interface GameLookupDto {
  code: string;
  quizTitle: string;
  joinable: boolean;
  phase: string;
}
