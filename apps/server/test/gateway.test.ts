import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  AckResponse,
  ClientToServerEvents,
  HostView,
  JoinResult,
  PlayerView,
  ServerToClientEvents,
} from "@quizarena/shared";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameManager } from "../src/game/game-manager";
import { MemoryGamePersistence } from "../src/game/persistence";
import { TokenService } from "../src/lib/auth";
import { attachGateway, createIo, createRoomOutput, type IoServer } from "../src/realtime/gateway";
import { makeSnapshot, silentLog } from "./helpers";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let http: HttpServer;
let io: IoServer;
let games: GameManager;
let url: string;
const tokens = new TokenService("test-secret-test-secret-test-secret-123");
const clients: Client[] = [];

function client(auth: Record<string, string> = {}): Promise<Client> {
  const socket: Client = connect(url, {
    transports: ["websocket"],
    auth,
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

/** Emits with an ack and unwraps it. */
function call<T>(
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<AckResponse<T>> {
  return new Promise((resolve) => {
    (socket.emit as (e: string, p: unknown, ack: (r: AckResponse<T>) => void) => void)(
      event,
      payload,
      resolve,
    );
  });
}

function nextState<T extends PlayerView | HostView>(
  socket: Client,
  predicate: (v: T) => boolean,
): Promise<T> {
  return new Promise((resolve) => {
    const handler = (view: PlayerView | HostView) => {
      if (predicate(view as T)) {
        socket.off("session:state", handler);
        resolve(view as T);
      }
    };
    socket.on("session:state", handler);
  });
}

beforeEach(async () => {
  http = createServer();
  io = createIo(http, ["http://localhost"]);
  games = new GameManager(
    (code) => createRoomOutput(io, code),
    new MemoryGamePersistence(),
    silentLog,
  );
  attachGateway({ io, games, tokens, log: silentLog });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  games.shutdown();
  await new Promise<void>((r) => io.close(() => r()));
});

function createGame(settings = {}) {
  return games.create({
    sessionId: "sess_1",
    code: "QA1234",
    hostId: "host_1",
    snapshot: makeSnapshot(settings, 2),
  });
}

describe("socket gateway", () => {
  it("rejects unknown codes and malformed payloads", async () => {
    const p = await client();
    const unknown = await call<JoinResult>(p, "session:join", { code: "QA0000", nickname: "Ada" });
    expect(unknown).toMatchObject({ ok: false, error: { code: "INVALID_GAME_CODE" } });
    const malformed = await call<JoinResult>(p, "session:join", { code: "nope", nickname: "Ada" });
    expect(malformed).toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
  });

  it("only lets the session's host attach and issue commands", async () => {
    createGame();
    const anonymous = await client();
    expect(await call(anonymous, "host:attach", { code: "QA1234" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    const intruder = await client({ ticket: await tokens.signSocketTicket("someone_else") });
    expect(await call(intruder, "host:command", { code: "QA1234", command: "END" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    // A session cookie token is not accepted as a socket ticket.
    const wrongPurpose = await client({ ticket: await tokens.signSession("host_1") });
    expect(await call(wrongPurpose, "host:attach", { code: "QA1234" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    const host = await client({ ticket: await tokens.signSocketTicket("host_1") });
    expect(await call(host, "host:attach", { code: "QA1234" })).toMatchObject({ ok: true });
  });

  it("plays a full round over real sockets without leaking answers", async () => {
    createGame();
    const host = await client({ ticket: await tokens.signSocketTicket("host_1") });
    await call(host, "host:attach", { code: "QA1234" });

    const a = await client();
    const b = await client();
    const joinA = await call<JoinResult>(a, "session:join", { code: "qa 1234", nickname: "Ada" });
    expect(joinA.ok).toBe(true);
    const dup = await call<JoinResult>(b, "session:join", { code: "QA1234", nickname: "ADA" });
    expect(dup).toMatchObject({ ok: false, error: { code: "NICKNAME_TAKEN" } });
    expect(
      (await call<JoinResult>(b, "session:join", { code: "QA1234", nickname: "Grace" })).ok,
    ).toBe(true);

    const activeA = nextState<PlayerView>(a, (v) => v.phase === "QUESTION_ACTIVE");
    const start = await call<HostView>(host, "host:command", { code: "QA1234", command: "START" });
    expect(start).toMatchObject({ ok: true, data: { phase: "COUNTDOWN" } });

    const view = await activeA;
    expect(view.question?.options).toHaveLength(4);
    expect(JSON.stringify(view)).not.toContain("isCorrect");
    expect(view.correctOptionIds).toBeNull();

    const qid = view.question!.id;
    const answer = await call(a, "question:answer", { questionId: qid, optionId: `${qid}_a` });
    expect(answer.ok).toBe(true);
    expect(
      await call(a, "question:answer", { questionId: qid, optionId: `${qid}_b` }),
    ).toMatchObject({
      ok: false,
      error: { code: "ANSWER_DUPLICATE" },
    });

    const revealA = nextState<PlayerView>(a, (v) => v.phase === "ANSWER_REVEAL");
    const revealB = nextState<PlayerView>(b, (v) => v.phase === "ANSWER_REVEAL");
    await call(b, "question:answer", { questionId: qid, optionId: `${qid}_c` });
    await call(host, "host:command", { code: "QA1234", command: "REVEAL" });
    const [ra, rb] = await Promise.all([revealA, revealB]);
    expect(ra.result).toMatchObject({ correct: true, rank: 1 });
    expect(rb.result).toMatchObject({ correct: false, points: 0, rank: 2 });
    // Each player only ever sees their own result.
    expect(JSON.stringify(rb)).not.toContain("Ada");

    const ended = await call<HostView>(host, "host:command", { code: "QA1234", command: "END" });
    expect(ended).toMatchObject({ ok: true, data: { phase: "FINISHED" } });
  }, 20_000);

  it("rejects answers from sockets that never joined", async () => {
    createGame();
    const stranger = await client();
    expect(
      await call(stranger, "question:answer", { questionId: "q0", optionId: "q0_a" }),
    ).toMatchObject({
      ok: false,
      error: { code: "SESSION_EXPIRED" },
    });
  });

  it("reconnects a player to their seat and replaces the older connection", async () => {
    createGame();
    const first = await client();
    const joined = await call<JoinResult>(first, "session:join", {
      code: "QA1234",
      nickname: "Ada",
    });
    if (!joined.ok) throw new Error("join failed");

    const closed = new Promise<string>((resolve) =>
      first.on("session:closed", (p) => resolve(p.code)),
    );
    const second = await client();
    const again = await call<JoinResult>(second, "player:reconnect", {
      code: "QA1234",
      token: joined.data.token,
    });
    expect(again).toMatchObject({ ok: true, data: { participantId: joined.data.participantId } });
    expect(await closed).toBe("REPLACED_BY_NEW_CONNECTION");

    const bad = await client();
    expect(
      await call(bad, "player:reconnect", { code: "QA1234", token: "x".repeat(43) }),
    ).toMatchObject({
      ok: false,
      error: { code: "SESSION_EXPIRED" },
    });
  });

  it("marks a dropped player offline for the host", async () => {
    createGame();
    const host = await client({ ticket: await tokens.signSocketTicket("host_1") });
    await call(host, "host:attach", { code: "QA1234" });
    const p = await client();
    const joined = await call<JoinResult>(p, "session:join", { code: "QA1234", nickname: "Ada" });
    if (!joined.ok) throw new Error("join failed");
    const offline = new Promise((resolve) =>
      host.on("session:player_status", (s) => {
        if (!s.connected) resolve(s.participantId);
      }),
    );
    p.disconnect();
    expect(await offline).toBe(joined.data.participantId);
  });

  it("answers timer sync pings with server time", async () => {
    const p = await client();
    const res = await new Promise<{ clientTime: number; serverTime: number }>((resolve) =>
      p.emit("timer:sync", { clientTime: 42 }, resolve),
    );
    expect(res.clientTime).toBe(42);
    expect(Math.abs(res.serverTime - Date.now())).toBeLessThan(1000);
  });
});
