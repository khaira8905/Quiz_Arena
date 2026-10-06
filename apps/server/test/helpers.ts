import {
  DEFAULT_APPEARANCE,
  type HostView,
  type LiveSettings,
  type PlayerView,
  type ProjectorView,
  type ServerToClientEvents,
} from "@quizarena/shared";
import type { RoomOutput } from "../src/game/game-room";
import { GameRoom } from "../src/game/game-room";
import { MemoryGamePersistence } from "../src/game/persistence";
import type { QuizSnapshot } from "../src/game/snapshot";

export const silentLog = { error: () => {}, warn: () => {}, info: () => {} };

export function makeSnapshot(
  overrides: Partial<LiveSettings> = {},
  questionCount = 3,
): QuizSnapshot {
  return {
    quizId: "quiz_1",
    title: "Test Quiz",
    coverImageUrl: null,
    settings: {
      scoringMode: "SPEED",
      streakBonus: false,
      showLeaderboard: true,
      showCorrectAnswers: true,
      showAnswerStats: true,
      allowLateJoin: false,
      participantLimit: 200,
      soundEnabled: true,
      nicknameFilter: true,
      readingMode: "OFF",
      readingTimeSec: 5,
      leaderboardEvery: 1,
      autoRevealSec: 0,
      appearance: DEFAULT_APPEARANCE,
      ...overrides,
    },
    questions: Array.from({ length: questionCount }, (_, i) => ({
      id: `q${i}`,
      type: "MULTIPLE_CHOICE" as const,
      text: `Question ${i + 1}?`,
      imageUrl: null,
      durationMs: 20_000,
      points: 1000,
      explanation: i === 0 ? "Because." : "",
      options: [
        { id: `q${i}_a`, text: "A", isCorrect: true },
        { id: `q${i}_b`, text: "B", isCorrect: false },
        { id: `q${i}_c`, text: "C", isCorrect: false },
        { id: `q${i}_d`, text: "D", isCorrect: false },
      ],
    })),
  };
}

/** Captures everything the room emits so tests can assert on what each audience saw. */
export class RecordingOutput implements RoomOutput {
  playerViews = new Map<string, PlayerView[]>();
  hostEvents: { event: keyof ServerToClientEvents; payload: unknown }[] = [];
  playerEvents: { event: keyof ServerToClientEvents; payload: unknown }[] = [];
  closed: { participantId: string; code: string }[] = [];
  projectorViews: ProjectorView[] = [];
  audienceEvents: { event: keyof ServerToClientEvents; payload: unknown }[] = [];

  toProjectors(view: ProjectorView) {
    this.projectorViews.push(view);
  }
  toAudience<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    this.audienceEvents.push({ event, payload: args[0] });
  }
  lastProjectorView(): ProjectorView {
    return this.projectorViews[this.projectorViews.length - 1]!;
  }

  toPlayer(id: string, view: PlayerView) {
    const list = this.playerViews.get(id) ?? [];
    list.push(view);
    this.playerViews.set(id, list);
  }
  toHosts<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    this.hostEvents.push({ event, payload: args[0] });
  }
  toPlayers<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    this.playerEvents.push({ event, payload: args[0] });
  }
  closePlayer(participantId: string, code: string) {
    this.closed.push({ participantId, code });
  }

  lastPlayerView(id: string): PlayerView {
    const list = this.playerViews.get(id);
    if (!list?.length) throw new Error(`no views for ${id}`);
    return list[list.length - 1]!;
  }

  lastHostView(): HostView {
    const states = this.hostEvents.filter((e) => e.event === "session:state");
    return states[states.length - 1]!.payload as HostView;
  }
}

export function makeRoom(
  settings: Partial<LiveSettings> = {},
  questionCount = 3,
  edit?: (snapshot: QuizSnapshot) => void,
) {
  const output = new RecordingOutput();
  const persistence = new MemoryGamePersistence();
  const snapshot = makeSnapshot(settings, questionCount);
  edit?.(snapshot);
  const room = new GameRoom(
    {
      sessionId: "sess_1",
      code: "QA123456",
      hostId: "user_1",
      snapshot,
    },
    output,
    persistence,
    silentLog,
  );
  return { room, output, persistence };
}
