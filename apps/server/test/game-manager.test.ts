import { START_COUNTDOWN_MS } from "@quizarena/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameManager } from "../src/game/game-manager";
import { MemoryGamePersistence } from "../src/game/persistence";
import { RecordingOutput, makeSnapshot, silentLog } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const persistence = new MemoryGamePersistence();
  const abandoned: string[] = [];
  const games = new GameManager(
    () => new RecordingOutput(),
    persistence,
    silentLog,
    async (id) => void abandoned.push(id),
  );
  const room = games.create({
    sessionId: "sess_1",
    code: "QA123456",
    hostId: "user_1",
    snapshot: makeSnapshot(),
  });
  return { games, room, persistence, abandoned };
}

describe("game manager", () => {
  it("ends and saves a game whose host walked away mid-game", async () => {
    const { games, room, persistence } = setup();
    await room.join("Ada");
    room.command("START");
    vi.advanceTimersByTime(START_COUNTDOWN_MS + 25_000); // question locks itself
    expect(room.currentPhase).toBe("QUESTION_LOCKED");
    await vi.advanceTimersByTimeAsync(46 * 60_000);
    expect(room.currentPhase).toBe("FINISHED");
    expect(persistence.finished?.standings).toHaveLength(1);
    games.shutdown();
  });

  it("keeps a finished room in memory while its results are unsaved", async () => {
    const { games, room, persistence } = setup();
    await room.join("Ada");
    persistence.sessionFinished = async () => {
      throw new Error("database down");
    };
    room.command("END");
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(games.get("QA123456")).toBe(room);
    games.shutdown();
  });

  it("drains on shutdown: games in progress end with results saved", async () => {
    const { games, room, persistence } = setup();
    await room.join("Ada");
    room.command("START");
    await games.drain(1_000);
    expect(room.currentPhase).toBe("FINISHED");
    expect(persistence.finished).not.toBeNull();
    games.shutdown();
  });
});
