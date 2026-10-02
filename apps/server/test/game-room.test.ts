import { ANSWER_GRACE_MS, LOBBY_DISCONNECT_GRACE_MS, START_COUNTDOWN_MS } from "@quizarena/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
import { makeRoom } from "./helpers";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return null;
};

const asyncCodeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return null;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Joins players and runs the start countdown so question 1 is open. */
async function startedRoom(players = ["Ada", "Grace", "Linus"], settings = {}) {
  const ctx = makeRoom(settings);
  const ids: string[] = [];
  for (const name of players) ids.push((await ctx.room.join(name)).participantId);
  ctx.room.command("START");
  vi.advanceTimersByTime(START_COUNTDOWN_MS);
  return { ...ctx, ids };
}

describe("joining", () => {
  it("admits players and rejects duplicate nicknames case-insensitively", async () => {
    const { room } = makeRoom();
    await room.join("Ada Lovelace");
    expect(await asyncCodeOf(room.join("ada  LOVELACE"))).toBe("NICKNAME_TAKEN");
    expect(room.participantCount).toBe(1);
  });

  it("rejects invalid and inappropriate nicknames", async () => {
    const { room } = makeRoom();
    expect(await asyncCodeOf(room.join("x"))).toBe("NICKNAME_INVALID");
    expect(await asyncCodeOf(room.join("<b>hi</b>"))).toBe("NICKNAME_INVALID");
    expect(await asyncCodeOf(room.join("sh1thead"))).toBe("NICKNAME_INVALID");
  });

  it("enforces the participant limit", async () => {
    const { room } = makeRoom({ participantLimit: 2 });
    await room.join("One1");
    await room.join("Two2");
    expect(await asyncCodeOf(room.join("Three"))).toBe("PARTICIPANT_LIMIT");
  });

  it("enforces the limit under concurrent joins", async () => {
    const { room } = makeRoom({ participantLimit: 5 });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => room.join(`Player${i}`)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(room.participantCount).toBe(5);
  });

  it("closes the door after start unless late join is enabled", async () => {
    const { room } = await startedRoom();
    expect(await asyncCodeOf(room.join("Latecomer"))).toBe("GAME_ALREADY_STARTED");

    const late = await startedRoom(["Ada"], { allowLateJoin: true });
    expect(await asyncCodeOf(late.room.join("Latecomer"))).toBeNull();
  });

  it("rejects joins once the game has finished", async () => {
    const { room } = await startedRoom(["Ada"], { allowLateJoin: true });
    room.command("END");
    expect(await asyncCodeOf(room.join("Latecomer"))).toBe("GAME_ENDED");
  });

  it("pushes a fresh host snapshot when START becomes available or unavailable", async () => {
    const { room, output } = makeRoom();
    expect(room.hostView().availableCommands).not.toContain("START");
    const a = await room.join("Ada");
    expect(output.lastHostView().availableCommands).toContain("START");
    room.remove(a.participantId);
    expect(output.lastHostView().availableCommands).not.toContain("START");
  });

  it("notifies hosts of joins", async () => {
    const { room, output } = makeRoom();
    await room.join("Ada");
    expect(output.hostEvents.some((e) => e.event === "session:player_joined")).toBe(true);
  });
});

describe("state machine", () => {
  it("only allows commands valid for the current phase", async () => {
    const { room } = makeRoom();
    expect(codeOf(() => room.command("START"))).toBe("COMMAND_NOT_ALLOWED"); // no players yet
    await room.join("Ada");
    expect(codeOf(() => room.command("REVEAL"))).toBe("COMMAND_NOT_ALLOWED");
    expect(codeOf(() => room.command("NEXT"))).toBe("COMMAND_NOT_ALLOWED");
    room.command("START");
    expect(room.currentPhase).toBe("COUNTDOWN");
    expect(codeOf(() => room.command("START"))).toBe("COMMAND_NOT_ALLOWED");
  });

  it("runs LOBBY → COUNTDOWN → ACTIVE → LOCKED → REVEAL → LEADERBOARD → … → FINISHED", async () => {
    const { room, persistence } = await startedRoom(["Ada"]);
    expect(persistence.started).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(room.currentPhase).toBe("QUESTION_ACTIVE");
      room.command("LOCK");
      expect(room.currentPhase).toBe("QUESTION_LOCKED");
      room.command("REVEAL");
      expect(room.currentPhase).toBe("ANSWER_REVEAL");
      room.command("LEADERBOARD");
      expect(room.currentPhase).toBe("LEADERBOARD");
      room.command("NEXT");
    }
    expect(room.currentPhase).toBe("FINISHED");
    expect(room.availableCommands()).toEqual([]);
  });

  it("omits the leaderboard step when the quiz hides it", async () => {
    const { room } = await startedRoom(["Ada"], { showLeaderboard: false });
    room.command("REVEAL");
    expect(room.availableCommands()).not.toContain("LEADERBOARD");
  });

  it("locks automatically when the timer expires", async () => {
    const { room } = await startedRoom();
    vi.advanceTimersByTime(20_000 + ANSWER_GRACE_MS - 1);
    expect(room.currentPhase).toBe("QUESTION_ACTIVE");
    vi.advanceTimersByTime(2);
    expect(room.currentPhase).toBe("QUESTION_LOCKED");
  });

  it("locks early once every connected player has answered", async () => {
    const { room, ids } = await startedRoom(["Ada", "Grace"]);
    room.submitAnswer(ids[0]!, "q0", "q0_a");
    expect(room.currentPhase).toBe("QUESTION_ACTIVE");
    room.submitAnswer(ids[1]!, "q0", "q0_b");
    expect(room.currentPhase).toBe("QUESTION_LOCKED");
  });

  it("does not wait for disconnected players", async () => {
    const { room, ids } = await startedRoom(["Ada", "Grace"]);
    room.setConnected(ids[1]!, false);
    room.submitAnswer(ids[0]!, "q0", "q0_a");
    expect(room.currentPhase).toBe("QUESTION_LOCKED");
  });

  it("END works from any live phase and persists results", async () => {
    const { room, persistence } = await startedRoom(["Ada"]);
    room.command("END");
    expect(room.currentPhase).toBe("FINISHED");
    await vi.runAllTimersAsync();
    expect(persistence.finished?.participantCount).toBe(1);
  });
});

describe("answers", () => {
  it("rejects double answers", async () => {
    const { room, ids } = await startedRoom();
    room.submitAnswer(ids[0]!, "q0", "q0_a");
    expect(codeOf(() => room.submitAnswer(ids[0]!, "q0", "q0_b"))).toBe("ANSWER_DUPLICATE");
  });

  it("rejects options and questions that are not current", async () => {
    const { room, ids } = await startedRoom();
    expect(codeOf(() => room.submitAnswer(ids[0]!, "q0", "q1_a"))).toBe("ANSWER_INVALID");
    expect(codeOf(() => room.submitAnswer(ids[0]!, "q1", "q1_a"))).toBe("QUESTION_NOT_ACTIVE");
    expect(codeOf(() => room.submitAnswer("nobody", "q0", "q0_a"))).toBe("SESSION_EXPIRED");
  });

  it("rejects answers received after the deadline plus grace, by server timestamp", async () => {
    const { room, ids } = await startedRoom();
    const deadline = Date.now() + 20_000;
    // A late answer is rejected even though the lock timer hasn't fired yet.
    expect(
      codeOf(() => room.submitAnswer(ids[0]!, "q0", "q0_a", deadline + ANSWER_GRACE_MS + 1)),
    ).toBe("ANSWER_TOO_LATE");
    expect(
      codeOf(() => room.submitAnswer(ids[1]!, "q0", "q0_a", deadline + ANSWER_GRACE_MS)),
    ).toBeNull();
  });

  it("rejects answers after a manual lock", async () => {
    const { room, ids } = await startedRoom();
    room.command("LOCK");
    expect(codeOf(() => room.submitAnswer(ids[0]!, "q0", "q0_a"))).toBe("QUESTION_NOT_ACTIVE");
  });

  it("rejects answers while paused, and pause time does not count against the player", async () => {
    const { room, ids } = await startedRoom(["Ada", "Grace"]);
    vi.advanceTimersByTime(5_000);
    room.command("PAUSE");
    expect(codeOf(() => room.submitAnswer(ids[0]!, "q0", "q0_a"))).toBe("QUESTION_NOT_ACTIVE");
    vi.advanceTimersByTime(60_000); // long pause — must not expire the question
    expect(room.currentPhase).toBe("QUESTION_ACTIVE");
    room.command("RESUME");
    room.submitAnswer(ids[0]!, "q0", "q0_a");
    room.submitAnswer(ids[1]!, "q0", "q0_b");
    room.command("REVEAL");
    // 5s of 20s elapsed → 1000 * (1 - 0.5 * 0.25) = 875
    expect(room.hostView().leaderboard[0]!.score).toBe(875);
  });
});

describe("scoring and privacy", () => {
  it("never sends correctness to players before the reveal", async () => {
    const { room, output, ids } = await startedRoom();
    room.submitAnswer(ids[0]!, "q0", "q0_a");
    room.command("LOCK");
    const locked = output.lastPlayerView(ids[0]!);
    expect(locked.phase).toBe("QUESTION_LOCKED");
    expect(locked.correctOptionIds).toBeNull();
    expect(locked.result).toBeNull();
    expect(locked.me.score).toBe(0);
    expect(JSON.stringify(locked)).not.toContain("isCorrect");

    room.command("REVEAL");
    const revealed = output.lastPlayerView(ids[0]!);
    expect(revealed.correctOptionIds).toEqual(["q0_a"]);
    expect(revealed.result?.correct).toBe(true);
    expect(revealed.me.score).toBe(1000);
    expect(revealed.explanation).toBe("Because.");
  });

  it("hides correct answers from players when the quiz disables them", async () => {
    const { room, output, ids } = await startedRoom(["Ada"], { showCorrectAnswers: false });
    room.submitAnswer(ids[0]!, "q0", "q0_b");
    room.command("REVEAL");
    const view = output.lastPlayerView(ids[0]!);
    expect(view.correctOptionIds).toBeNull();
    expect(view.result?.correct).toBe(false);
  });

  it("ranks by score, then speed, and tracks streaks", async () => {
    const { room, ids } = await startedRoom(["Ada", "Grace", "Linus"]);
    vi.advanceTimersByTime(2_000);
    room.submitAnswer(ids[1]!, "q0", "q0_a"); // Grace: correct, fast
    vi.advanceTimersByTime(8_000);
    room.submitAnswer(ids[0]!, "q0", "q0_a"); // Ada: correct, slower
    room.submitAnswer(ids[2]!, "q0", "q0_c"); // Linus: wrong
    room.command("REVEAL");
    const board = room.hostView().leaderboard;
    expect(board.map((e) => e.nickname)).toEqual(["Grace", "Ada", "Linus"]);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board[2]!.score).toBe(0);
    expect(board[0]!.streak).toBe(1);
    expect(board[2]!.streak).toBe(0);
  });

  it("skipping an open question awards nothing", async () => {
    const { room, ids, persistence } = await startedRoom(["Ada"]);
    room.submitAnswer(ids[0]!, "q0", "q0_a");
    // Answering locked it; skip from LOCKED moves on without scoring.
    room.command("SKIP");
    expect(room.currentPhase).toBe("QUESTION_ACTIVE");
    expect(room.hostView().question?.id).toBe("q1");
    room.command("END");
    expect(persistence.answers).toHaveLength(0);
    expect(room.hostView().results?.standings[0]!.score).toBe(0);
    expect(room.hostView().results?.playedQuestions).toBe(0);
  });

  it("persists scored answers with server timestamps", async () => {
    const { room, ids, persistence } = await startedRoom(["Ada"]);
    vi.advanceTimersByTime(4_000);
    room.submitAnswer(ids[0]!, "q0", "q0_a");
    room.command("REVEAL");
    await vi.advanceTimersByTimeAsync(0);
    expect(persistence.answers).toHaveLength(1);
    expect(persistence.answers[0]).toMatchObject({
      questionId: "q0",
      isCorrect: true,
      responseMs: 4_000,
      points: 900,
    });
  });

  it("produces final results with accuracy and response stats", async () => {
    const { room, ids } = await startedRoom(["Ada", "Grace"]);
    for (let q = 0; q < 3; q++) {
      vi.advanceTimersByTime(1_000);
      room.submitAnswer(ids[0]!, `q${q}`, `q${q}_a`);
      room.submitAnswer(ids[1]!, `q${q}`, q === 0 ? `q${q}_a` : `q${q}_b`);
      room.command("REVEAL");
      room.command("NEXT");
    }
    const results = room.hostView().results!;
    expect(results.playedQuestions).toBe(3);
    expect(results.standings[0]).toMatchObject({
      nickname: "Ada",
      correctCount: 3,
      accuracy: 1,
      bestStreak: 3,
    });
    expect(results.standings[1]).toMatchObject({
      nickname: "Grace",
      correctCount: 1,
      bestStreak: 1,
    });
    expect(results.standings[1]!.accuracy).toBeCloseTo(1 / 3);
    expect(results.averageResponseMs).toBe(1_000);
  });
});

describe("connections", () => {
  it("restores a seat from its reconnect token", async () => {
    const { room } = makeRoom();
    const { participantId, token } = await room.join("Ada");
    room.setConnected(participantId, false);
    const again = room.reconnect(token);
    expect(again.participantId).toBe(participantId);
    expect(room.hostView().players[0]!.connected).toBe(true);
  });

  it("rejects unknown tokens", async () => {
    const { room } = makeRoom();
    expect(codeOf(() => room.reconnect("not-a-real-token-at-all"))).toBe("SESSION_EXPIRED");
  });

  it("keeps mid-game seats, evicts lobby seats after the grace period", async () => {
    const lobby = makeRoom();
    const a = await lobby.room.join("Ada");
    lobby.room.setConnected(a.participantId, false);
    vi.advanceTimersByTime(LOBBY_DISCONNECT_GRACE_MS + 1);
    expect(lobby.room.participantCount).toBe(0);
    // Nickname is free again.
    expect(await asyncCodeOf(lobby.room.join("Ada"))).toBeNull();

    const game = await startedRoom(["Ada"]);
    game.room.setConnected(game.ids[0]!, false);
    vi.advanceTimersByTime(LOBBY_DISCONNECT_GRACE_MS + 1);
    expect(game.room.participantCount).toBe(1);
  });

  it("a lobby reconnect inside the grace period cancels eviction", async () => {
    const { room } = makeRoom();
    const a = await room.join("Ada");
    room.setConnected(a.participantId, false);
    vi.advanceTimersByTime(LOBBY_DISCONNECT_GRACE_MS / 2);
    room.reconnect(a.token);
    vi.advanceTimersByTime(LOBBY_DISCONNECT_GRACE_MS);
    expect(room.participantCount).toBe(1);
  });

  it("kicking closes the player's connection", async () => {
    const { room, output } = makeRoom();
    const a = await room.join("Ada");
    room.remove(a.participantId, "Removed");
    expect(output.closed).toEqual([{ participantId: a.participantId, code: "SESSION_EXPIRED" }]);
    expect(codeOf(() => room.reconnect(a.token))).toBe("SESSION_EXPIRED");
  });
});
