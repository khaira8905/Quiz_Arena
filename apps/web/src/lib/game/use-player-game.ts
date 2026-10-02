"use client";

import type { GameLookupDto } from "@quizarena/shared/dto";
import type { ErrorCode } from "@quizarena/shared/errors";
import type { AnswerReceipt, JoinResult } from "@quizarena/shared/events";
import type { PlayerView } from "@quizarena/shared/game";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, isApiError } from "../api";
import { seedOffset, syncClock } from "../clock";
import { createGameSocket, emitAck, type GameSocket } from "../socket";

export type PlayerStep =
  | { kind: "code"; error?: { code: ErrorCode; message: string }; attempted?: string }
  | { kind: "checking"; code: string }
  | { kind: "name"; game: GameLookupDto; error?: { code: ErrorCode; message: string } }
  | { kind: "joining"; game: GameLookupDto }
  | { kind: "resuming"; code: string }
  | { kind: "playing" }
  | { kind: "closed"; code: ErrorCode; message: string };

export type Connection = "online" | "reconnecting" | "offline";

interface Seat {
  code: string;
  token: string;
  participantId: string;
  nickname: string;
}

const seatKey = (code: string) => `qa:seat:${code}`;
function loadSeat(code: string): Seat | null {
  try {
    const raw = localStorage.getItem(seatKey(code));
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
}
function saveSeat(seat: Seat) {
  try {
    localStorage.setItem(seatKey(seat.code), JSON.stringify(seat));
  } catch {
    /* private mode: reconnect falls back to rejoining */
  }
}
function clearSeat(code: string) {
  try {
    localStorage.removeItem(seatKey(code));
  } catch {
    /* ignore */
  }
}

/**
 * Player-side game flow: code → nickname → live game, with transparent reconnection.
 * The reconnect token is stored per game code so a phone that locks, refreshes or drops
 * Wi-Fi returns to the same seat and score.
 */
export function usePlayerGame(initialCode: string | null) {
  const [step, setStep] = useState<PlayerStep>(() => (initialCode ? { kind: "checking", code: initialCode } : { kind: "code" }));
  const [view, setView] = useState<PlayerView | null>(null);
  const [connection, setConnection] = useState<Connection>("online");
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  const seatRef = useRef<Seat | null>(null);
  /** Bumped on every new flow and on unmount; async continuations from older flows bail out. */
  const generation = useRef(0);

  const closeWith = useCallback((code: ErrorCode, message: string) => {
    if (seatRef.current) clearSeat(seatRef.current.code);
    seatRef.current = null;
    socketRef.current?.disconnect();
    setStep({ kind: "closed", code, message });
  }, []);

  /** Lazily creates the socket and wires listeners once. */
  const ensureSocket = useCallback((): GameSocket => {
    if (socketRef.current) return socketRef.current;
    const socket = createGameSocket();
    socketRef.current = socket;

    socket.on("connect", async () => {
      setConnection("online");
      void syncClock(socket);
      // Every new transport connection must re-bind to the seat.
      const seat = seatRef.current;
      if (!seat) return;
      const res = await emitAck<JoinResult>(socket, "player:reconnect", { code: seat.code, token: seat.token });
      if (res.ok) {
        seedOffset(res.data.view.serverTime);
        setView(res.data.view);
        setStep({ kind: "playing" });
      } else if (res.error.code === "SESSION_EXPIRED" || res.error.code === "INVALID_GAME_CODE") {
        closeWith(res.error.code, res.error.code === "INVALID_GAME_CODE" ? "This game is no longer running." : res.error.message);
      }
    });
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") setConnection("reconnecting");
    });
    socket.io.on("reconnect_failed", () => setConnection("offline"));
    socket.on("session:state", (v) => {
      if (v.role !== "player") return;
      setView(v);
      setPendingAnswer(null);
    });
    socket.on("session:player_count", ({ count }) => setView((v) => (v ? { ...v, playerCount: count } : v)));
    socket.on("timer:sync", ({ deadline, paused, remainingMs }) =>
      setView((v) => (v && v.timer ? { ...v, paused, timer: { ...v.timer, deadline, paused, remainingMs } } : v)),
    );
    socket.on("session:closed", ({ code, message }) => closeWith(code, message));
    return socket;
  }, [closeWith]);

  const waitConnected = (socket: GameSocket) =>
    new Promise<boolean>((resolve) => {
      if (socket.connected) return resolve(true);
      const t = setTimeout(() => resolve(false), 8000);
      socket.once("connect", () => {
        clearTimeout(t);
        resolve(true);
      });
      socket.connect();
    });

  /** Step 1: validate the code over HTTP so typos fail fast, before asking for a name. */
  const submitCode = useCallback(
    async (raw: string) => {
      const gen = ++generation.current;
      const code = raw.replace(/\s+/g, "").toUpperCase();
      setStep({ kind: "checking", code });
      const seat = loadSeat(code);
      if (seat) {
        seatRef.current = seat;
        setStep({ kind: "resuming", code });
        const socket = ensureSocket();
        const connected = await waitConnected(socket);
        if (gen !== generation.current) return;
        if (!connected) {
          setStep({ kind: "code", attempted: code, error: { code: "INTERNAL", message: "Can't reach the game server. Check your connection." } });
        }
        return;
      }
      try {
        const game = await api<GameLookupDto>(`/games/${encodeURIComponent(code)}`);
        if (gen !== generation.current) return;
        if (!game.joinable) setStep({ kind: "code", attempted: code, error: { code: "GAME_ALREADY_STARTED", message: "This game has already started and isn't accepting new players." } });
        else setStep({ kind: "name", game });
      } catch (err) {
        if (gen !== generation.current) return;
        if (isApiError(err)) setStep({ kind: "code", attempted: code, error: { code: err.code, message: err.status === 0 || err.status >= 500 ? "Can't reach the game server right now." : err.message } });
        else setStep({ kind: "code", attempted: code, error: { code: "INTERNAL", message: "Something went wrong." } });
      }
    },
    [ensureSocket],
  );

  // Resolve an initial ?game= code on mount. Scheduled (not called inline) so a Strict Mode
  // remount cancels the first attempt instead of racing it.
  useEffect(() => {
    if (!initialCode) return;
    const t = setTimeout(() => void submitCode(initialCode), 0);
    return () => clearTimeout(t);
  }, [initialCode, submitCode]);

  /** Step 2: claim a seat with a nickname. */
  const join = useCallback(
    async (nickname: string) => {
      if (step.kind !== "name") return;
      const game = step.game;
      const gen = ++generation.current;
      setStep({ kind: "joining", game });
      const socket = ensureSocket();
      const connected = await waitConnected(socket);
      if (gen !== generation.current) return;
      if (!connected) {
        setStep({ kind: "name", game, error: { code: "INTERNAL", message: "Can't reach the game server. Try again." } });
        return;
      }
      const res = await emitAck<JoinResult>(socket, "session:join", { code: game.code, nickname });
      if (gen !== generation.current) return;
      if (res.ok) {
        const seat = { code: game.code, token: res.data.token, participantId: res.data.participantId, nickname };
        seatRef.current = seat;
        saveSeat(seat);
        seedOffset(res.data.view.serverTime);
        setView(res.data.view);
        setStep({ kind: "playing" });
      } else if (["INVALID_GAME_CODE", "GAME_ENDED", "GAME_ALREADY_STARTED", "PARTICIPANT_LIMIT"].includes(res.error.code)) {
        setStep({ kind: "code", error: res.error });
      } else {
        setStep({ kind: "name", game, error: res.error });
      }
    },
    [step, ensureSocket],
  );

  /** Answers are optimistic for feel; the server's ack is the truth. */
  const answer = useCallback(
    async (optionId: string): Promise<{ ok: true; receipt: AnswerReceipt } | { ok: false; code: ErrorCode; message: string }> => {
      const socket = socketRef.current;
      const q = view?.question;
      if (!socket || !q) return { ok: false, code: "QUESTION_NOT_ACTIVE", message: "No open question." };
      setPendingAnswer(optionId);
      const res = await emitAck<AnswerReceipt>(socket, "question:answer", { questionId: q.id, optionId }, 5000);
      if (res.ok) {
        setView((v) => (v && v.question?.id === q.id ? { ...v, myAnswerId: optionId } : v));
        return { ok: true, receipt: res.data };
      }
      setPendingAnswer(null);
      if (res.error.code === "ANSWER_DUPLICATE") return { ok: true, receipt: { questionId: q.id, optionId, receivedAt: Date.now() } };
      return { ok: false, code: res.error.code, message: res.error.message };
    },
    [view?.question],
  );

  const leave = useCallback(() => {
    socketRef.current?.emit("session:leave");
    if (seatRef.current) clearSeat(seatRef.current.code);
    seatRef.current = null;
    socketRef.current?.disconnect();
    setView(null);
    setStep({ kind: "code" });
  }, []);

  const reset = useCallback(() => {
    generation.current++;
    socketRef.current?.removeAllListeners();
    socketRef.current?.disconnect();
    socketRef.current = null;
    seatRef.current = null;
    setView(null);
    setStep({ kind: "code" });
  }, []);

  const retryConnection = useCallback(() => {
    setConnection("reconnecting");
    socketRef.current?.connect();
  }, []);

  useEffect(
    () => () => {
      generation.current++;
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
    },
    [],
  );

  return { step, view, connection, pendingAnswer, submitCode, join, answer, leave, reset, retryConnection };
}
