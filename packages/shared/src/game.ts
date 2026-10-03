import type { ImageFit, ImagePosition } from "./media";
import type { ArenaAppearance } from "./appearance";
import type { QuestionType } from "./question-types";
import type { ScoringMode } from "./scoring";

/**
 * Game phases. The server owns every transition; clients only render the phase they
 * are told about.
 *
 *   LOBBY → COUNTDOWN (3-2-1) → per question:
 *     QUESTION_READING (question shown, answers closed) → QUESTION_ACTIVE (timer runs)
 *     → QUESTION_LOCKED → [ANSWER_DISTRIBUTION] → ANSWER_REVEAL → [LEADERBOARD]
 *   → FINISHED (host-paced podium: complete → 3rd → 2nd → 1st → full board)
 */
export const GAME_PHASES = [
  "LOBBY",
  "COUNTDOWN",
  "QUESTION_READING",
  "QUESTION_ACTIVE",
  "QUESTION_LOCKED",
  "ANSWER_DISTRIBUTION",
  "ANSWER_REVEAL",
  "LEADERBOARD",
  "FINISHED",
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const HOST_COMMANDS = [
  "START",
  /** Reading period → answers open and the timer starts. */
  "OPEN_ANSWERS",
  "PAUSE",
  "RESUME",
  /** ± seconds on the current (or about-to-open) question's timer; uses `amount`. */
  "ADJUST_TIMER",
  "SKIP",
  "LOCK",
  /** Locked → how the room answered, before the correct answer is shown. */
  "SHOW_STATS",
  "REVEAL",
  "LEADERBOARD",
  "NEXT",
  /** Final results: next podium beat (3rd → 2nd → 1st → full leaderboard). */
  "PODIUM_NEXT",
  "END",
] as const;
export type HostCommand = (typeof HOST_COMMANDS)[number];

/** Reading period before answers open: none, a timed countdown, or until the host opens it. */
export const READING_MODES = ["OFF", "TIMED", "MANUAL"] as const;
export type ReadingMode = (typeof READING_MODES)[number];

/** Beats of the final ceremony, advanced by the host. */
export const PODIUM_STEPS = ["COMPLETE", "THIRD", "SECOND", "FIRST", "BOARD"] as const;
export type PodiumStep = (typeof PODIUM_STEPS)[number];

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
  readingMode: ReadingMode;
  readingTimeSec: number;
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
  /** How the image sits in its frame, and a tiny blurred preview while it loads. */
  imageFit: ImageFit;
  imagePosition: ImagePosition;
  imagePlaceholder: string | null;
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
  /** When a timed reading period ends (server time); null otherwise. */
  readingEndsAt: number | null;
  /** Final ceremony beat, so phones keep the suspense with the big screen. */
  podiumStep: PodiumStep | null;
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
  /** Index of the current (or last played) question; -1 before the first one opens. */
  questionIndex: number;
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
  readingEndsAt: number | null;
  podiumStep: PodiumStep | null;
  /** Lobby choice: one timer for every question, or null for per-question timers. */
  timerOverrideSec: number | null;
  availableCommands: HostCommand[];
}

/**
 * The stage. Exactly what the audience may see, built by the server with the same rules for
 * the projector window and the host's projector preview: no answer key before the reveal,
 * no distribution before the stats step, no player management or host-only data.
 */
export interface ProjectorView {
  role: "projector";
  code: string;
  quizTitle: string;
  coverImageUrl: string | null;
  phase: GamePhase;
  paused: boolean;
  serverTime: number;
  settings: Pick<
    LiveSettings,
    "appearance" | "soundEnabled" | "showAnswerStats" | "showCorrectAnswers" | "showLeaderboard"
  >;
  countdownEndsAt: number | null;
  readingEndsAt: number | null;
  questionCount: number;
  playerCount: number;
  connectedCount: number;
  /** Lobby roster (names only), capped. Empty once the game starts. */
  lobbyPlayers: { id: string; nickname: string; connected: boolean }[];
  question: PublicQuestion | null;
  timer: TimerState | null;
  answeredCount: number;
  /** From the stats step on. */
  distribution: AnswerDistribution | null;
  /** From the reveal on (and only if the quiz shows correct answers). */
  correctOptionIds: string[] | null;
  explanation: string | null;
  /** Leaderboard phase and final results. */
  leaderboard: LeaderboardEntry[] | null;
  results: FinalResults | null;
  podiumStep: PodiumStep | null;
  /** The next question's image, so the stage can load it before it's needed. */
  nextImageUrl: string | null;
}

export type GameView = PlayerView | HostView | ProjectorView;
