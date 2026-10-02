import {
  ANSWER_GRACE_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  START_COUNTDOWN_MS,
  cleanNickname,
  computePoints,
  nicknameKey,
  validateNickname,
  type AnswerReceipt,
  type FinalResults,
  type FinalStanding,
  type GamePhase,
  type HostCommand,
  type HostView,
  type LeaderboardEntry,
  type PlayerSummary,
  type PlayerView,
  type PublicQuestion,
  type ServerToClientEvents,
  type TimerState,
} from "@quizarena/shared";
import { createPlayerToken, hashToken } from "../lib/auth";
import { AppError } from "../lib/errors";
import { newId } from "../lib/random";
import { withRetry } from "../lib/retry";
import { throttle } from "../lib/throttle";
import type { AnswerRecord, GamePersistence } from "./persistence";
import type { QuizSnapshot, SnapshotQuestion } from "./snapshot";

/** Backoff for writes that must survive a database blip (about 1.5 minutes in total). */
const PERSIST_RETRY_DELAYS_MS = [1_000, 5_000, 20_000, 60_000];

/**
 * Transport-agnostic output. The Socket.IO gateway implements this with rooms; tests
 * implement it with arrays. The engine never touches sockets directly.
 */
export interface RoomOutput {
  toPlayer(participantId: string, view: PlayerView): void;
  toHosts<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  toPlayers<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  closePlayer(participantId: string, code: "SESSION_EXPIRED" | "GAME_ENDED", message: string): void;
}

export interface Logger {
  error(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
}

interface Participant {
  id: string;
  nickname: string;
  key: string;
  tokenHash: string;
  joinedAt: number;
  connected: boolean;
  score: number;
  correctCount: number;
  answeredCount: number;
  totalResponseMs: number;
  streak: number;
  bestStreak: number;
  rank: number | null;
  previousRank: number | null;
  lastPoints: number;
  /** Last revealed result, kept for the reveal/leaderboard screens. */
  lastResult: PlayerView["result"];
}

interface PendingAnswer {
  optionId: string;
  receivedAt: number;
  responseMs: number;
}

const HOST_LEADERBOARD_SIZE = 10;
const PLAYER_LEADERBOARD_SIZE = 5;

export class GameRoom {
  readonly sessionId: string;
  readonly code: string;
  readonly hostId: string;
  readonly createdAt = Date.now();

  private phase: GamePhase = "LOBBY";
  private paused = false;
  private countdownEndsAt: number | null = null;
  private questionIndex = -1;
  private playedQuestions = 0;

  // Timing of the open question, all in server ms.
  private openedAt = 0;
  private deadline = 0;
  private remainingAtPause = 0;

  private readonly participants = new Map<string, Participant>();
  private readonly byKey = new Map<string, string>();
  private readonly byToken = new Map<string, string>();
  /** Nicknames reserved while a join is being persisted, to close the check-then-insert race. */
  private readonly reserved = new Set<string>();
  private answers = new Map<string, PendingAnswer>();
  private leaderboard: Participant[] = [];

  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly lobbyEvictions = new Map<string, ReturnType<typeof setTimeout>>();
  private finishedAt: number | null = null;
  private results: FinalResults | null = null;
  private resultsSaved = false;
  private saving: Promise<void> | null = null;
  /** Last host command, join or answer: lets the manager end games their host walked away from. */
  private lastActivityAt = Date.now();

  private readonly emitProgress: ReturnType<typeof throttle>;
  private readonly emitCounts: ReturnType<typeof throttle>;

  constructor(
    params: { sessionId: string; code: string; hostId: string; snapshot: QuizSnapshot },
    private readonly output: RoomOutput,
    private readonly persistence: GamePersistence,
    private readonly log: Logger,
  ) {
    this.sessionId = params.sessionId;
    this.code = params.code;
    this.hostId = params.hostId;
    this.snapshot = params.snapshot;
    this.emitProgress = throttle(() => this.sendProgress(), 150);
    this.emitCounts = throttle(() => this.sendCounts(), 400);
  }

  private readonly snapshot: QuizSnapshot;

  /* ======================================================================== queries */

  get currentPhase(): GamePhase {
    return this.phase;
  }

  get isFinished() {
    return this.phase === "FINISHED";
  }

  get finishedTime() {
    return this.finishedAt;
  }

  /** False until the final standings are safely in the database. */
  get resultsPersisted() {
    return this.resultsSaved;
  }

  get lastActivity() {
    return this.lastActivityAt;
  }

  get quizTitle() {
    return this.snapshot.title;
  }

  get appearance() {
    return this.snapshot.settings.appearance;
  }

  get joinable() {
    return (
      this.phase === "LOBBY" || (this.phase !== "FINISHED" && this.snapshot.settings.allowLateJoin)
    );
  }

  get participantCount() {
    return this.participants.size;
  }

  hasParticipant(id: string) {
    return this.participants.has(id);
  }

  private get question(): SnapshotQuestion | null {
    return this.snapshot.questions[this.questionIndex] ?? null;
  }

  private get connectedCount() {
    let n = 0;
    for (const p of this.participants.values()) if (p.connected) n++;
    return n;
  }

  /* ======================================================================== players */

  async join(
    rawNickname: string,
  ): Promise<{ participantId: string; token: string; view: PlayerView }> {
    if (this.phase === "FINISHED") throw new AppError("GAME_ENDED");
    this.lastActivityAt = Date.now();
    if (this.phase !== "LOBBY" && !this.snapshot.settings.allowLateJoin)
      throw new AppError("GAME_ALREADY_STARTED");
    if (this.participants.size + this.reserved.size >= this.snapshot.settings.participantLimit) {
      throw new AppError("PARTICIPANT_LIMIT");
    }

    const invalid = validateNickname(rawNickname, this.snapshot.settings.nicknameFilter);
    if (invalid) {
      const message = {
        TOO_SHORT: "Nicknames need at least 2 characters.",
        TOO_LONG: "Nicknames can be at most 20 characters.",
        INVALID_CHARACTERS: "Use letters, numbers, spaces and . _ - ! ? only.",
        INAPPROPRIATE: "Please choose a different nickname.",
      }[invalid];
      throw new AppError("NICKNAME_INVALID", message);
    }

    const nickname = cleanNickname(rawNickname);
    const key = nicknameKey(nickname);
    if (this.byKey.has(key) || this.reserved.has(key)) throw new AppError("NICKNAME_TAKEN");

    this.reserved.add(key);
    const id = newId();
    const { token, hash } = createPlayerToken();
    try {
      await this.persistence.participantJoined(this.sessionId, {
        id,
        nickname,
        nicknameKey: key,
        tokenHash: hash,
      });
    } catch (err) {
      this.log.error({ err, code: this.code }, "failed to persist participant");
      throw new AppError("INTERNAL");
    } finally {
      this.reserved.delete(key);
    }
    // The game may have ended while we awaited the insert (read via getter: not narrowed).
    if (this.isFinished) throw new AppError("GAME_ENDED");

    const participant: Participant = {
      id,
      nickname,
      key,
      tokenHash: hash,
      joinedAt: Date.now(),
      connected: true,
      score: 0,
      correctCount: 0,
      answeredCount: 0,
      totalResponseMs: 0,
      streak: 0,
      bestStreak: 0,
      rank: null,
      previousRank: null,
      lastPoints: 0,
      lastResult: null,
    };
    this.participants.set(id, participant);
    this.byKey.set(key, id);
    this.byToken.set(hash, id);

    this.output.toHosts("session:player_joined", this.summarize(participant));
    this.emitCounts();
    // START becomes available with the first player: hosts need the new command set.
    if (this.phase === "LOBBY" && this.participants.size === 1)
      this.output.toHosts("session:state", this.hostView());
    return { participantId: id, token, view: this.playerView(id) };
  }

  /** Resolves a reconnect token to a seat. The token is the only credential a player has. */
  reconnect(token: string): { participantId: string; view: PlayerView } {
    const id = this.byToken.get(hashToken(token));
    const participant = id ? this.participants.get(id) : undefined;
    if (!participant) throw new AppError("SESSION_EXPIRED");
    this.setConnected(participant.id, true);
    return { participantId: participant.id, view: this.playerView(participant.id) };
  }

  setConnected(participantId: string, connected: boolean) {
    const p = this.participants.get(participantId);
    if (!p || p.connected === connected) return;
    p.connected = connected;

    const eviction = this.lobbyEvictions.get(participantId);
    if (eviction) {
      clearTimeout(eviction);
      this.lobbyEvictions.delete(participantId);
    }
    // In the lobby a dropped seat is released after a grace period; mid-game it is kept so
    // the player can return to their score.
    if (!connected && this.phase === "LOBBY") {
      this.lobbyEvictions.set(
        participantId,
        setTimeout(() => this.remove(participantId), LOBBY_DISCONNECT_GRACE_MS),
      );
    }

    this.output.toHosts("session:player_status", { participantId, connected });
    this.emitCounts();
    if (!connected) this.maybeAutoLock();
  }

  /** Voluntary leave or host kick. Lobby leavers free their nickname. */
  remove(participantId: string, closeReason?: string) {
    const p = this.participants.get(participantId);
    if (!p) return;
    // After the final whistle a player belongs to the results: leaving just drops the seat.
    if (this.phase === "FINISHED") {
      if (closeReason) this.output.closePlayer(participantId, "SESSION_EXPIRED", closeReason);
      this.setConnected(participantId, false);
      return;
    }
    const eviction = this.lobbyEvictions.get(participantId);
    if (eviction) clearTimeout(eviction);
    this.lobbyEvictions.delete(participantId);

    this.participants.delete(participantId);
    this.byKey.delete(p.key);
    this.byToken.delete(p.tokenHash);
    this.answers.delete(participantId);
    this.leaderboard = this.leaderboard.filter((x) => x.id !== participantId);

    if (closeReason) this.output.closePlayer(participantId, "SESSION_EXPIRED", closeReason);
    this.output.toHosts("session:player_left", { participantId });
    this.emitCounts();
    if (this.phase === "LOBBY" && this.participants.size === 0)
      this.output.toHosts("session:state", this.hostView());
    this.persistence.participantRemoved(this.sessionId, participantId).catch((err) => {
      this.log.error({ err, code: this.code }, "failed to persist participant removal");
    });
    this.maybeAutoLock();
  }

  submitAnswer(
    participantId: string,
    questionId: string,
    optionId: string,
    receivedAt = Date.now(),
  ): AnswerReceipt {
    this.lastActivityAt = receivedAt;
    const p = this.participants.get(participantId);
    if (!p) throw new AppError("SESSION_EXPIRED");
    const q = this.question;
    if (this.phase !== "QUESTION_ACTIVE" || !q || this.paused)
      throw new AppError("QUESTION_NOT_ACTIVE");
    if (q.id !== questionId) throw new AppError("QUESTION_NOT_ACTIVE");
    if (this.answers.has(participantId)) throw new AppError("ANSWER_DUPLICATE");
    if (!q.options.some((o) => o.id === optionId)) throw new AppError("ANSWER_INVALID");
    // The authoritative check: the server's receipt time against the server's deadline.
    if (receivedAt > this.deadline + ANSWER_GRACE_MS) throw new AppError("ANSWER_TOO_LATE");

    // Elapsed time measured against the (pause-adjusted) deadline, never against client clocks.
    const responseMs = Math.min(
      q.durationMs,
      Math.max(0, q.durationMs - (this.deadline - receivedAt)),
    );
    this.answers.set(participantId, { optionId, receivedAt, responseMs });

    this.emitProgress();
    this.maybeAutoLock();
    return { questionId, optionId, receivedAt };
  }

  /* ======================================================================== host commands */

  availableCommands(): HostCommand[] {
    switch (this.phase) {
      case "LOBBY":
        return this.participants.size > 0 ? ["START", "END"] : ["END"];
      case "COUNTDOWN":
        return ["END"];
      case "QUESTION_ACTIVE":
        return [this.paused ? "RESUME" : "PAUSE", "LOCK", "REVEAL", "SKIP", "END"];
      case "QUESTION_LOCKED":
        return ["REVEAL", "SKIP", "END"];
      case "ANSWER_REVEAL":
        return [
          ...(this.snapshot.settings.showLeaderboard ? (["LEADERBOARD"] as const) : []),
          "NEXT",
          "END",
        ];
      case "LEADERBOARD":
        return ["NEXT", "END"];
      case "FINISHED":
        return [];
    }
  }

  command(command: HostCommand, expected?: { phase: GamePhase; questionIndex: number }): void {
    if (
      expected &&
      (expected.phase !== this.phase || expected.questionIndex !== this.questionIndex)
    )
      throw new AppError("COMMAND_OUT_OF_DATE");
    if (!this.availableCommands().includes(command)) throw new AppError("COMMAND_NOT_ALLOWED");
    this.lastActivityAt = Date.now();
    switch (command) {
      case "START":
        return this.start();
      case "PAUSE":
        return this.pause();
      case "RESUME":
        return this.resume();
      case "LOCK":
        return this.lock();
      case "REVEAL":
        if (this.phase === "QUESTION_ACTIVE") this.lock(false);
        return this.reveal();
      case "SKIP":
        return this.advance();
      case "LEADERBOARD":
        this.setPhase("LEADERBOARD");
        return this.broadcast();
      case "NEXT":
        return this.advance();
      case "END":
        return this.finish();
    }
  }

  private start() {
    // Everyone seated at the whistle keeps their seat, connected or not.
    for (const t of this.lobbyEvictions.values()) clearTimeout(t);
    this.lobbyEvictions.clear();
    this.setPhase("COUNTDOWN");
    this.countdownEndsAt = Date.now() + START_COUNTDOWN_MS;
    this.schedule(START_COUNTDOWN_MS, () => this.openQuestion(0));
    this.persistence.sessionStarted(this.sessionId, Date.now()).catch((err) => {
      this.log.error({ err, code: this.code }, "failed to persist session start");
    });
    this.broadcast();
  }

  private openQuestion(index: number) {
    const q = this.snapshot.questions[index];
    if (!q) return this.finish();
    this.questionIndex = index;
    this.countdownEndsAt = null;
    this.paused = false;
    this.answers = new Map();
    for (const p of this.participants.values()) p.lastResult = null;

    this.openedAt = Date.now();
    this.deadline = this.openedAt + q.durationMs;
    this.setPhase("QUESTION_ACTIVE");
    // The timeout only drives the UI transition; acceptance is decided by timestamps.
    this.schedule(q.durationMs + ANSWER_GRACE_MS, () => this.lock());
    this.broadcast();
  }

  private pause() {
    this.paused = true;
    this.remainingAtPause = Math.max(0, this.deadline - Date.now());
    this.clearPhaseTimer();
    this.broadcastTimer();
    this.broadcast();
  }

  private resume() {
    this.paused = false;
    this.deadline = Date.now() + this.remainingAtPause;
    this.schedule(this.remainingAtPause + ANSWER_GRACE_MS, () => this.lock());
    this.broadcastTimer();
    this.broadcast();
  }

  private lock(broadcast = true) {
    if (this.phase !== "QUESTION_ACTIVE") return;
    this.clearPhaseTimer();
    if (this.paused) {
      this.paused = false;
      this.deadline = Date.now();
    }
    this.emitProgress.flush();
    this.setPhase("QUESTION_LOCKED");
    if (broadcast) this.broadcast();
  }

  /** Scores are applied at reveal so nothing leaks before the answer is shown on screen. */
  private reveal() {
    const q = this.question;
    if (!q) return;
    const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
    const { scoringMode, streakBonus } = this.snapshot.settings;
    const records: AnswerRecord[] = [];

    for (const p of this.participants.values()) {
      const a = this.answers.get(p.id);
      if (!a) {
        p.streak = 0;
        p.lastPoints = 0;
        continue;
      }
      const correct = correctIds.has(a.optionId);
      const streak = correct ? p.streak + 1 : 0;
      const points = computePoints(
        {
          correct,
          responseMs: a.responseMs,
          durationMs: q.durationMs,
          basePoints: q.points,
          streak,
        },
        { mode: scoringMode, streakBonus },
      );
      p.streak = streak;
      p.bestStreak = Math.max(p.bestStreak, streak);
      p.score += points;
      p.lastPoints = points;
      p.answeredCount += 1;
      p.totalResponseMs += a.responseMs;
      if (correct) p.correctCount += 1;
      records.push({
        participantId: p.id,
        questionId: q.id,
        questionIndex: this.questionIndex,
        optionId: a.optionId,
        isCorrect: correct,
        responseMs: a.responseMs,
        points,
        receivedAt: a.receivedAt,
      });
    }

    this.playedQuestions += 1;
    this.rank();
    for (const p of this.participants.values()) {
      const a = this.answers.get(p.id);
      p.lastResult = {
        answered: !!a,
        optionId: a?.optionId ?? null,
        correct: !!a && correctIds.has(a.optionId),
        points: p.lastPoints,
        responseMs: a?.responseMs ?? null,
        streak: p.streak,
        rank: p.rank,
        previousRank: p.previousRank,
      };
    }

    // Idempotent (skipDuplicates), so retrying after a partial failure is safe.
    withRetry(
      () => this.persistence.answersScored(this.sessionId, records),
      PERSIST_RETRY_DELAYS_MS,
      (err, attempt) =>
        this.log.warn({ err, code: this.code, attempt }, "retrying answer persistence"),
    ).catch((err) => {
      this.log.error(
        { err, code: this.code, question: this.questionIndex, answers: records.length },
        "failed to persist answers",
      );
    });
    this.setPhase("ANSWER_REVEAL");
    this.broadcast();
  }

  /** NEXT and SKIP: open the following question, or finish after the last one. */
  private advance() {
    this.clearPhaseTimer();
    if (this.questionIndex + 1 < this.snapshot.questions.length)
      this.openQuestion(this.questionIndex + 1);
    else this.finish();
  }

  private finish() {
    if (this.phase === "FINISHED") return;
    this.clearPhaseTimer();
    this.emitProgress.cancel();
    this.countdownEndsAt = null;
    this.paused = false;
    this.rank();
    this.setPhase("FINISHED");
    this.finishedAt = Date.now();
    this.results = this.buildResults();
    for (const t of this.lobbyEvictions.values()) clearTimeout(t);
    this.lobbyEvictions.clear();

    void this.saveResults();
    this.broadcast();
  }

  /**
   * Persists the final standings, retrying through a database blip. If every attempt fails
   * the room stays in memory (see GameManager) and the manager calls this again later.
   */
  saveResults(): Promise<void> {
    if (!this.results || this.finishedAt === null || this.resultsSaved) return Promise.resolve();
    if (this.saving) return this.saving;
    const { results, finishedAt } = this;
    this.saving = withRetry(
      () => this.persistence.sessionFinished(this.sessionId, finishedAt, results),
      PERSIST_RETRY_DELAYS_MS,
      (err, attempt) => this.log.warn({ err, code: this.code, attempt }, "retrying results save"),
    ).then(
      () => {
        this.resultsSaved = true;
        this.saving = null;
      },
      (err) => {
        this.saving = null;
        this.log.error({ err, code: this.code }, "failed to persist results; will retry");
      },
    );
    return this.saving;
  }

  /** Ends a game nobody is driving any more, saving the results reached so far. */
  endAbandoned() {
    this.finish();
  }

  /** Last resort before the room is dropped: the standings go to the log, not to nowhere. */
  get unsavedResults(): FinalResults | null {
    return this.resultsSaved ? null : this.results;
  }

  /** Called by the manager when the room is torn down. */
  dispose() {
    this.clearPhaseTimer();
    this.emitProgress.cancel();
    this.emitCounts.cancel();
    for (const t of this.lobbyEvictions.values()) clearTimeout(t);
    this.lobbyEvictions.clear();
  }

  /* ======================================================================== internals */

  private setPhase(phase: GamePhase) {
    this.phase = phase;
  }

  private schedule(ms: number, fn: () => void) {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      try {
        fn();
      } catch (err) {
        this.log.error({ err, code: this.code }, "scheduled transition failed");
      }
    }, ms);
  }

  private clearPhaseTimer() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  /** Locks early once every connected player has answered — no one waits on an empty timer. */
  private maybeAutoLock() {
    if (this.phase !== "QUESTION_ACTIVE" || this.paused) return;
    let connected = 0;
    for (const p of this.participants.values()) {
      if (!p.connected) continue;
      connected++;
      if (!this.answers.has(p.id)) return;
    }
    if (connected > 0) this.lock();
  }

  /**
   * Strict ranking: score, then total response time (faster wins ties), then join order.
   * Unique ranks keep the leaderboard unambiguous on a projector.
   */
  private rank() {
    const sorted = [...this.participants.values()].sort(
      (a, b) =>
        b.score - a.score || a.totalResponseMs - b.totalResponseMs || a.joinedAt - b.joinedAt,
    );
    sorted.forEach((p, i) => {
      p.previousRank = p.rank;
      p.rank = i + 1;
    });
    this.leaderboard = sorted;
  }

  private entry(p: Participant): LeaderboardEntry {
    return {
      participantId: p.id,
      nickname: p.nickname,
      score: p.score,
      rank: p.rank ?? 0,
      previousRank: p.previousRank,
      correctCount: p.correctCount,
      streak: p.streak,
      lastPoints: p.lastPoints,
    };
  }

  private buildResults(): FinalResults {
    const standings: FinalStanding[] = this.leaderboard.map((p) => ({
      ...this.entry(p),
      accuracy: this.playedQuestions ? p.correctCount / this.playedQuestions : 0,
      avgResponseMs: p.answeredCount ? p.totalResponseMs / p.answeredCount : null,
      bestStreak: p.bestStreak,
      answeredCount: p.answeredCount,
    }));
    const answered = standings.filter((s) => s.avgResponseMs !== null);
    return {
      totalQuestions: this.snapshot.questions.length,
      playedQuestions: this.playedQuestions,
      participantCount: standings.length,
      averageAccuracy: standings.length
        ? standings.reduce((s, x) => s + x.accuracy, 0) / standings.length
        : 0,
      averageResponseMs: answered.length
        ? answered.reduce((s, x) => s + (x.avgResponseMs ?? 0), 0) / answered.length
        : null,
      standings,
    };
  }

  private summarize(p: Participant): PlayerSummary {
    return {
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
      score: p.score,
      answered: this.answers.has(p.id),
    };
  }

  private publicQuestion(): PublicQuestion | null {
    const q = this.question;
    if (!q) return null;
    return {
      id: q.id,
      index: this.questionIndex,
      total: this.snapshot.questions.length,
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      points: q.points,
      durationMs: q.durationMs,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    };
  }

  private timerState(): TimerState | null {
    const q = this.question;
    if (!q || this.phase === "LOBBY" || this.phase === "COUNTDOWN" || this.phase === "FINISHED")
      return null;
    const active = this.phase === "QUESTION_ACTIVE";
    return {
      startedAt: this.openedAt,
      deadline: this.deadline,
      durationMs: q.durationMs,
      paused: this.paused,
      remainingMs: !active
        ? 0
        : this.paused
          ? this.remainingAtPause
          : Math.max(0, this.deadline - Date.now()),
    };
  }

  private distribution(): Record<string, number> {
    const q = this.question;
    const dist: Record<string, number> = {};
    if (!q) return dist;
    for (const o of q.options) dist[o.id] = 0;
    for (const a of this.answers.values()) dist[a.optionId] = (dist[a.optionId] ?? 0) + 1;
    return dist;
  }

  private isRevealed() {
    return this.phase === "ANSWER_REVEAL" || this.phase === "LEADERBOARD";
  }

  hostView(): HostView {
    const q = this.question;
    const showQuestion =
      this.phase !== "LOBBY" && this.phase !== "COUNTDOWN" && this.phase !== "FINISHED";
    return {
      role: "host",
      sessionId: this.sessionId,
      code: this.code,
      quizTitle: this.snapshot.title,
      coverImageUrl: this.snapshot.coverImageUrl,
      phase: this.phase,
      paused: this.paused,
      serverTime: Date.now(),
      settings: this.snapshot.settings,
      countdownEndsAt: this.countdownEndsAt,
      questionCount: this.snapshot.questions.length,
      questionIndex: this.questionIndex,
      players: [...this.participants.values()].map((p) => this.summarize(p)),
      playerCount: this.participants.size,
      connectedCount: this.connectedCount,
      question: showQuestion ? this.publicQuestion() : null,
      correctOptionIds:
        showQuestion && q ? q.options.filter((o) => o.isCorrect).map((o) => o.id) : null,
      explanation: showQuestion && q?.explanation ? q.explanation : null,
      timer: this.timerState(),
      answeredCount: this.answers.size,
      distribution: this.distribution(),
      leaderboard: this.leaderboard.slice(0, HOST_LEADERBOARD_SIZE).map((p) => this.entry(p)),
      results: this.results,
      availableCommands: this.availableCommands(),
    };
  }

  playerView(participantId: string): PlayerView {
    const p = this.participants.get(participantId);
    if (!p) throw new AppError("SESSION_EXPIRED");
    const q = this.question;
    const revealed = this.isRevealed();
    const showQuestion =
      this.phase !== "LOBBY" && this.phase !== "COUNTDOWN" && this.phase !== "FINISHED";
    const { showCorrectAnswers, showLeaderboard } = this.snapshot.settings;
    const showBoard =
      (this.phase === "LEADERBOARD" && showLeaderboard) || this.phase === "FINISHED";

    return {
      role: "player",
      code: this.code,
      quizTitle: this.snapshot.title,
      phase: this.phase,
      paused: this.paused,
      serverTime: Date.now(),
      playerCount: this.participants.size,
      countdownEndsAt: this.countdownEndsAt,
      me: {
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        rank: p.rank,
        streak: p.streak,
        correctCount: p.correctCount,
      },
      question: showQuestion ? this.publicQuestion() : null,
      timer: showQuestion ? this.timerState() : null,
      myAnswerId: showQuestion ? (this.answers.get(p.id)?.optionId ?? null) : null,
      result: revealed ? p.lastResult : null,
      correctOptionIds:
        revealed && showCorrectAnswers && q
          ? q.options.filter((o) => o.isCorrect).map((o) => o.id)
          : null,
      leaderboard: showBoard
        ? this.leaderboard.slice(0, PLAYER_LEADERBOARD_SIZE).map((x) => this.entry(x))
        : null,
      explanation: revealed && showCorrectAnswers && q?.explanation ? q.explanation : null,
      soundEnabled: this.snapshot.settings.soundEnabled,
      appearance: this.snapshot.settings.appearance,
    };
  }

  /** One snapshot to the hosts room, one personalised snapshot per player. */
  private broadcast() {
    this.output.toHosts("session:state", this.hostView());
    for (const id of this.participants.keys()) this.output.toPlayer(id, this.playerView(id));
  }

  private broadcastTimer() {
    const payload = {
      serverTime: Date.now(),
      deadline: this.deadline,
      paused: this.paused,
      remainingMs: this.paused ? this.remainingAtPause : Math.max(0, this.deadline - Date.now()),
    };
    this.output.toHosts("timer:sync", payload);
    this.output.toPlayers("timer:sync", payload);
  }

  private sendProgress() {
    const q = this.question;
    if (!q || this.phase === "FINISHED") return;
    this.output.toHosts("question:progress", {
      questionId: q.id,
      answered: this.answers.size,
      distribution: this.distribution(),
    });
  }

  private sendCounts() {
    const payload = { count: this.participants.size, connected: this.connectedCount };
    this.output.toHosts("session:player_count", payload);
    this.output.toPlayers("session:player_count", payload);
  }
}
