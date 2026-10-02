import type { ArenaAppearance } from "./appearance";
import type { QuestionType } from "./question-types";
import type { ScoringMode } from "./scoring";

/**
 * Game phases. The server owns every transition; clients only render the phase they
 * are told about. COUNTDOWN is the short "3-2-1" start sequence between LOBBY and Q1.
 */
export const GAME_PHASES = [
  "LOBBY",
  "COUNTDOWN",
  "QUESTION_ACTIVE",
  "QUESTION_LOCKED",
  "ANSWER_REVEAL",
  "LEADERBOARD",
  "FINISHED",
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const HOST_COMMANDS = [
  "START",
  "PAUSE",
  "RESUME",
  "SKIP",
  "LOCK",
  "REVEAL",
  "LEADERBOARD",
  "NEXT",
  "END",
] as const;
export type HostCommand = (typeof HOST_COMMANDS)[number];

/** Settings that influence a live game, frozen into the session when it is created. */
export interface LiveSettings {
  scoringMode: ScoringMode;
  streakBonus: boolean;
  showLeaderboard: boolean;
  showCorrectAnswers: boolean;
  showAnswerStats: boolean;
  allowLateJoin: boolean;
  participantLimit: number;
  soundEnabled: boolean;
  nicknameFilter: boolean;
  appearance: ArenaAppearance;
}

export interface PublicOption {
  id: string;
  text: string;
}

/** A question as players may see it — never carries correctness. */
export interface PublicQuestion {
  id: string;
  index: number;
  total: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  points: number;
  durationMs: number;
  options: PublicOption[];
}

/**
 * Timer is expressed in SERVER time. Clients convert using their measured clock offset
 * (see timer:sync) so every screen counts down to the same instant.
 */
export interface TimerState {
  startedAt: number;
  deadline: number;
  durationMs: number;
  paused: boolean;
  /** Remaining ms when paused; otherwise derived from deadline. */
  remainingMs: number;
}

export interface LeaderboardEntry {
  participantId: string;
  nickname: string;
  score: number;
  rank: number;
  /** Rank before the latest scoring update, for rank-change animation. null = new entry. */
  previousRank: number | null;
  correctCount: number;
  streak: number;
  /** Points gained on the latest question. */
  lastPoints: number;
}

export interface PlayerSummary {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  answered: boolean;
}

export type AnswerDistribution = Record<string, number>;

export interface FinalStanding extends LeaderboardEntry {
  accuracy: number;
  avgResponseMs: number | null;
  bestStreak: number;
  answeredCount: number;
}

export interface FinalResults {
  totalQuestions: number;
  playedQuestions: number;
  participantCount: number;
  averageAccuracy: number;
  averageResponseMs: number | null;
  standings: FinalStanding[];
}

/* ------------------------------------------------------------------------------------ */
/* Role views. The server sends exactly one of these per transition — players never     */
/* receive another player's answers, the answer key, or the full roster.                */
/* ------------------------------------------------------------------------------------ */

export interface PlayerSelf {
  id: string;
  nickname: string;
  score: number;
  rank: number | null;
  streak: number;
  correctCount: number;
}

export interface PlayerAnswerResult {
  answered: boolean;
  optionId: string | null;
  correct: boolean;
  points: number;
  responseMs: number | null;
  streak: number;
  rank: number | null;
  previousRank: number | null;
}

export interface PlayerView {
  role: "player";
  code: string;
  quizTitle: string;
  phase: GamePhase;
  paused: boolean;
  serverTime: number;
  playerCount: number;
  countdownEndsAt: number | null;
  me: PlayerSelf;
  question: PublicQuestion | null;
  timer: TimerState | null;
  /** The option this player chose for the current question, if any. */
  myAnswerId: string | null;
  /** Present once the answer is revealed. */
  result: PlayerAnswerResult | null;
  /** Present on reveal when the quiz shows correct answers. */
  correctOptionIds: string[] | null;
  /** Top entries for the leaderboard phase / final screen. */
  leaderboard: LeaderboardEntry[] | null;
  explanation: string | null;
  soundEnabled: boolean;
  appearance: ArenaAppearance;
}

export interface HostView {
  role: "host";
  sessionId: string;
  code: string;
  quizTitle: string;
  coverImageUrl: string | null;
  phase: GamePhase;
  paused: boolean;
  serverTime: number;
  settings: LiveSettings;
  countdownEndsAt: number | null;
  questionCount: number;
  players: PlayerSummary[];
  playerCount: number;
  connectedCount: number;
  question: PublicQuestion | null;
  /** The host is trusted; the projector only displays this on reveal. */
  correctOptionIds: string[] | null;
  explanation: string | null;
  timer: TimerState | null;
  answeredCount: number;
  distribution: AnswerDistribution;
  leaderboard: LeaderboardEntry[];
  results: FinalResults | null;
  availableCommands: HostCommand[];
}

export type GameView = PlayerView | HostView;
