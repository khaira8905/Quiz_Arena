import { generateGameCode } from "../lib/random";
import { GameRoom, type Logger, type RoomOutput } from "./game-room";
import type { GamePersistence } from "./persistence";
import type { QuizSnapshot } from "./snapshot";

/** Finished rooms stay in memory briefly so late reconnects still see the final screen. */
const FINISHED_RETENTION_MS = 15 * 60_000;
/** A lobby nobody started is abandoned after this long. */
const LOBBY_MAX_AGE_MS = 6 * 60 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Registry of live rooms on this node. Each room is owned by exactly one process; see
 * docs/ARCHITECTURE.md for how this scales out (Redis adapter for fan-out + routing by code).
 */
export class GameManager {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly sweeper: ReturnType<typeof setInterval>;

  constructor(
    private readonly outputFor: (code: string) => RoomOutput,
    private readonly persistence: GamePersistence,
    private readonly log: Logger,
    private readonly onAbandon: (sessionId: string) => Promise<void> = async () => {},
  ) {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  get size() {
    return this.rooms.size;
  }

  /** Picks a code not used by any live room here, nor reported taken by storage. */
  async allocateCode(isTaken: (code: string) => Promise<boolean>): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = generateGameCode();
      if (this.rooms.has(code)) continue;
      if (await isTaken(code)) continue;
      return code;
    }
    throw new Error("Could not allocate a game code");
  }

  create(params: { sessionId: string; code: string; hostId: string; snapshot: QuizSnapshot }): GameRoom {
    if (this.rooms.has(params.code)) throw new Error(`Room ${params.code} already exists`);
    const room = new GameRoom(params, this.outputFor(params.code), this.persistence, this.log);
    this.rooms.set(params.code, room);
    return room;
  }

  findBySession(sessionId: string): GameRoom | undefined {
    for (const room of this.rooms.values()) if (room.sessionId === sessionId) return room;
    return undefined;
  }

  remove(code: string) {
    this.rooms.get(code)?.dispose();
    this.rooms.delete(code);
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const finishedAt = room.finishedTime;
      if (finishedAt !== null && now - finishedAt > FINISHED_RETENTION_MS) {
        this.remove(code);
      } else if (room.currentPhase === "LOBBY" && now - room.createdAt > LOBBY_MAX_AGE_MS) {
        this.remove(code);
        this.onAbandon(room.sessionId).catch((err) => this.log.error({ err, code }, "failed to abandon session"));
      }
    }
  }

  shutdown() {
    clearInterval(this.sweeper);
    for (const code of [...this.rooms.keys()]) this.remove(code);
  }
}
