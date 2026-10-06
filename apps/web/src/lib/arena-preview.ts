import type { ArenaAppearance } from "@quizarena/shared/appearance";
import type {
  FinalResults,
  GamePhase,
  LeaderboardEntry,
  LiveSettings,
  PlayerView,
  ProjectorView,
  PublicQuestion,
  TimerState,
} from "@quizarena/shared/game";

/**
 * Live arena preview. The admin's Customize Arena panel embeds /arena-preview in iframes
 * (one projector-sized, one phone-sized) and streams the draft appearance into them with
 * postMessage, so the preview updates on every keystroke without saving, and renders the
 * real projector and phone components at their real viewport sizes.
 */

export const PREVIEW_MESSAGE = "qa:arena-preview";
export const PREVIEW_READY = "qa:arena-preview-ready";

export const PREVIEW_SCENES = [
  "lobby",
  "reading",
  "question",
  "stats",
  "reveal",
  "leaderboard",
  "podium",
] as const;
export type PreviewScene = (typeof PREVIEW_SCENES)[number];
export type PreviewSurface = "projector" | "phone";

export interface PreviewQuestion {
  text: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
  points: number;
  durationSec: number;
}

export interface ArenaPreviewState {
  appearance: ArenaAppearance;
  scene: PreviewScene;
  title: string;
  settings: Omit<LiveSettings, "appearance">;
  question: PreviewQuestion | null;
  questionCount: number;
}

export interface ArenaPreviewMessage {
  type: typeof PREVIEW_MESSAGE;
  state: ArenaPreviewState;
}

export const FALLBACK_QUESTION: PreviewQuestion = {
  text: "Which planet has the shortest day in the solar system?",
  options: [
    { text: "Mercury", correct: false },
    { text: "Jupiter", correct: true },
    { text: "Saturn", correct: false },
    { text: "Neptune", correct: false },
  ],
  explanation: "Jupiter spins once every 9 hours and 56 minutes.",
  points: 1000,
  durationSec: 20,
};

const NAMES = [
  "Aanya",
  "Kabir",
  "Mei",
  "Tomás",
  "Zara",
  "Ishaan",
  "Leila",
  "Noah",
  "Priya",
  "Dev",
  "Sofia",
  "Arjun",
  "Hana",
  "Omar",
  "Riya",
  "Felix",
  "Anika",
  "Yusuf",
  "Chloe",
  "Vihaan",
  "Elif",
  "Rohan",
  "Maya",
  "Jonas",
  "Tara",
  "Karan",
  "Nina",
  "Sami",
  "Diya",
  "Leo",
  "Ayesha",
  "Ravi",
];

const PREVIEW_CODE = "QA204816";
const PLAYER_COUNT = 87;

function players(): ProjectorView["lobbyPlayers"] {
  return NAMES.map((nickname, i) => ({ id: `p${i}`, nickname, connected: true }));
}

function results(): FinalResults {
  return {
    totalQuestions: 12,
    playedQuestions: 12,
    participantCount: PLAYER_COUNT,
    averageAccuracy: 0.64,
    averageResponseMs: 5200,
    standings: leaderboard().map((e, i) => ({
      ...e,
      accuracy: Math.max(0.3, 0.92 - i * 0.05),
      avgResponseMs: 3100 + i * 260,
      bestStreak: Math.max(1, 6 - Math.floor(i / 2)),
      answeredCount: 12,
    })),
  };
}

function leaderboard(): LeaderboardEntry[] {
  return NAMES.slice(0, 10).map((nickname, i) => ({
    participantId: `p${i}`,
    nickname,
    score: 4820 - i * 370 - (i % 3) * 45,
    rank: i + 1,
    previousRank: [2, 1, 3, 6, 4, 5, 9, 7, 8, 10][i] ?? null,
    correctCount: Math.max(1, 5 - Math.floor(i / 3)),
    streak: Math.max(0, 4 - i),
    lastPoints: i % 4 === 3 ? 0 : 960 - i * 40,
  }));
}

function publicQuestion(s: ArenaPreviewState): {
  question: PublicQuestion;
  correctIds: string[];
  distribution: Record<string, number>;
} {
  const q = s.question ?? FALLBACK_QUESTION;
  const options = q.options.map((o, i) => ({ id: `o${i}`, text: o.text || "—" }));
  const weights = [0.18, 0.52, 0.2, 0.1];
  return {
    question: {
      id: "preview-q",
      index: 0,
      total: Math.max(1, s.questionCount),
      type: options.length === 2 ? "TRUE_FALSE" : "MULTIPLE_CHOICE",
      text: q.text || "Untitled question",
      imageUrl: null,
      imageFit: "CONTAIN",
      imagePosition: "CENTER",
      imagePlaceholder: null,
      video: null,
      points: q.points,
      durationMs: q.durationSec * 1000,
      options,
    },
    correctIds: q.options.flatMap((o, i) => (o.correct ? [`o${i}`] : [])),
    distribution: Object.fromEntries(
      options.map((o, i) => [o.id, Math.round(PLAYER_COUNT * (weights[i] ?? 0.1))]),
    ),
  };
}

/** A running timer that started `elapsedMs` ago. */
export function previewTimer(durationMs: number, elapsedMs: number, now: number): TimerState {
  const startedAt = now - elapsedMs;
  return {
    startedAt,
    deadline: startedAt + durationMs,
    durationMs,
    paused: false,
    remainingMs: durationMs - elapsedMs,
  };
}

const PHASE: Record<PreviewScene, GamePhase> = {
  lobby: "LOBBY",
  reading: "QUESTION_READING",
  question: "QUESTION_ACTIVE",
  stats: "ANSWER_DISTRIBUTION",
  reveal: "ANSWER_REVEAL",
  leaderboard: "LEADERBOARD",
  podium: "FINISHED",
};

/** The reading scene shows a countdown that is a few seconds from opening. */
const READING_LEFT_MS = 4000;

export function previewProjectorView(s: ArenaPreviewState, now: number): ProjectorView {
  const { question, correctIds, distribution } = publicQuestion(s);
  const phase = PHASE[s.scene];
  const inQuestion = phase !== "LOBBY" && phase !== "FINISHED";
  const answered = Object.values(distribution).reduce((a, b) => a + b, 0);
  const revealed = phase === "ANSWER_REVEAL" || phase === "LEADERBOARD";
  const lobby = phase === "LOBBY";
  return {
    role: "projector",
    code: PREVIEW_CODE,
    quizTitle: s.title,
    coverImageUrl: null,
    phase,
    paused: false,
    serverTime: now,
    settings: {
      appearance: s.appearance,
      soundEnabled: false,
      showAnswerStats: s.settings.showAnswerStats,
      showCorrectAnswers: s.settings.showCorrectAnswers,
      showLeaderboard: s.settings.showLeaderboard,
      leaderboardEvery: s.settings.leaderboardEvery,
    },
    countdownEndsAt: null,
    readingEndsAt: phase === "QUESTION_READING" ? now + READING_LEFT_MS : null,
    questionCount: Math.max(1, s.questionCount),
    playerCount: lobby ? NAMES.length : PLAYER_COUNT,
    connectedCount: lobby ? NAMES.length : PLAYER_COUNT,
    lobbyPlayers: lobby ? players() : [],
    question: inQuestion ? question : null,
    timer: !inQuestion
      ? null
      : phase === "QUESTION_ACTIVE"
        ? previewTimer(question.durationMs, Math.min(6000, question.durationMs / 3), now)
        : { ...previewTimer(question.durationMs, 0, now), paused: true },
    answeredCount: phase === "QUESTION_ACTIVE" ? 64 : phase === "QUESTION_READING" ? 0 : answered,
    distribution:
      phase === "ANSWER_DISTRIBUTION" || (revealed && s.settings.showAnswerStats)
        ? distribution
        : null,
    correctOptionIds: revealed && s.settings.showCorrectAnswers ? correctIds : null,
    explanation:
      revealed && s.settings.showCorrectAnswers
        ? s.question?.explanation || (s.question ? null : FALLBACK_QUESTION.explanation)
        : null,
    leaderboard: phase === "LEADERBOARD" ? leaderboard() : null,
    results: phase === "FINISHED" ? results() : null,
    podiumStep: phase === "FINISHED" ? "FIRST" : null,
    nextImageUrl: null,
    nextVideoUrl: null,
    media: { epoch: 0, sound: false },
  };
}

export function previewPlayerView(s: ArenaPreviewState, now: number): PlayerView {
  const { question, correctIds } = publicQuestion(s);
  const phase = PHASE[s.scene];
  const mine = correctIds[0] ?? question.options[0]!.id;
  const revealed = phase === "ANSWER_REVEAL";
  const inQuestion = phase !== "LOBBY" && phase !== "FINISHED";
  return {
    role: "player",
    code: PREVIEW_CODE,
    quizTitle: s.title,
    phase,
    paused: false,
    serverTime: now,
    playerCount: PLAYER_COUNT,
    countdownEndsAt: null,
    me: {
      id: "p0",
      nickname: "Aanya",
      score: revealed || phase === "LEADERBOARD" ? 1912 : 952,
      rank: phase === "LOBBY" ? null : 3,
      streak: 2,
      correctCount: 2,
    },
    question: inQuestion ? question : null,
    timer:
      phase === "QUESTION_ACTIVE"
        ? previewTimer(question.durationMs, Math.min(6000, question.durationMs / 3), now)
        : null,
    myAnswerId: revealed || phase === "ANSWER_DISTRIBUTION" ? mine : null,
    result: revealed
      ? {
          answered: true,
          optionId: mine,
          correct: true,
          points: 960,
          responseMs: 3400,
          streak: 2,
          rank: 3,
          previousRank: 5,
        }
      : null,
    correctOptionIds: revealed && s.settings.showCorrectAnswers ? correctIds : null,
    leaderboard: leaderboard(),
    explanation: revealed ? (s.question?.explanation ?? FALLBACK_QUESTION.explanation) : null,
    readingEndsAt: phase === "QUESTION_READING" ? now + READING_LEFT_MS : null,
    podiumStep: phase === "FINISHED" ? "FIRST" : null,
    soundEnabled: false,
    appearance: s.appearance,
  };
}
