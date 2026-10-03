"use client";

import type { ErrorCode } from "@quizarena/shared/errors";
import type { HostCommand, HostView, PlayerSummary } from "@quizarena/shared/game";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { seedOffset, syncClock } from "../clock";
import { createGameSocket, emitAck, type GameSocket } from "../socket";

export type HostConnection = "connecting" | "live" | "reconnecting" | "failed";

/**
 * Host-side live game state. The socket authenticates with a short-lived ticket fetched over
 * the cookie-authenticated API, attaches to the game, and keeps a HostView in sync from
 * snapshots plus small deltas. Join bursts are batched so 100 players arriving in a second
 * cause a handful of renders, not 100.
 */
export function useHostGame(code: string) {
  const [view, setView] = useState<HostView | null>(null);
  const [connection, setConnection] = useState<HostConnection>("connecting");
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  const viewRef = useRef<HostView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const socket = createGameSocket(async () => {
      const { ticket } = await api<{ ticket: string }>("/auth/socket-ticket");
      return { ticket };
    });
    socketRef.current = socket;

    let joinBuffer: PlayerSummary[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushJoins = () => {
      flushTimer = null;
      const batch = joinBuffer;
      joinBuffer = [];
      setView((v) => {
        if (!v) return v;
        const known = new Set(v.players.map((p) => p.id));
        const added = batch.filter((p) => !known.has(p.id));
        if (!added.length) return v;
        return { ...v, players: [...v.players, ...added] };
      });
    };

    const attach = async () => {
      const res = await emitAck<HostView>(socket, "host:attach", { code });
      if (res.ok) {
        seedOffset(res.data.serverTime);
        setView(res.data);
        setConnection("live");
        setError(null);
        void syncClock(socket);
      } else {
        setError(res.error);
        setConnection("failed");
        if (["UNAUTHORIZED", "FORBIDDEN", "INVALID_GAME_CODE"].includes(res.error.code))
          socket.disconnect();
      }
    };

    socket.on("connect", () => void attach());
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") setConnection("reconnecting");
    });
    socket.on("connect_error", () => setConnection((c) => (c === "live" ? "reconnecting" : c)));
    socket.io.on("reconnect_failed", () => setConnection("failed"));

    socket.on("session:state", (v) => {
      if (v.role !== "host") return;
      joinBuffer = [];
      setView(v);
    });
    socket.on("session:player_joined", (p) => {
      joinBuffer.push(p);
      flushTimer ??= setTimeout(flushJoins, 160);
    });
    socket.on("session:player_left", ({ participantId }) =>
      setView((v) => (v ? { ...v, players: v.players.filter((p) => p.id !== participantId) } : v)),
    );
    socket.on("session:player_status", ({ participantId, connected }) =>
      setView((v) =>
        v
          ? {
              ...v,
              players: v.players.map((p) => (p.id === participantId ? { ...p, connected } : p)),
            }
          : v,
      ),
    );
    socket.on("session:player_count", ({ count, connected }) =>
      setView((v) => (v ? { ...v, playerCount: count, connectedCount: connected } : v)),
    );
    socket.on("question:progress", ({ questionId, answered, distribution }) =>
      setView((v) =>
        v && v.question?.id === questionId ? { ...v, answeredCount: answered, distribution } : v,
      ),
    );
    socket.on("timer:sync", ({ deadline, paused, remainingMs }) =>
      setView((v) =>
        v && v.timer ? { ...v, paused, timer: { ...v.timer, deadline, paused, remainingMs } } : v,
      ),
    );

    socket.connect();
    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code]);

  const command = useCallback(
    async (cmd: HostCommand) => {
      const socket = socketRef.current;
      if (!socket)
        return {
          ok: false as const,
          error: { code: "INTERNAL" as ErrorCode, message: "Not connected" },
        };
      // Tell the server what this screen showed, so a second host screen (projector +
      // laptop) can't apply the same step twice.
      const v = viewRef.current;
      const res = await emitAck<HostView>(socket, "host:command", {
        code,
        command: cmd,
        expected: v ? { phase: v.phase, questionIndex: v.questionIndex } : undefined,
      });
      if (res.ok) setView(res.data);
      return res;
    },
    [code],
  );

  const kick = useCallback(
    async (participantId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      return emitAck<null>(socket, "host:kick", { code, participantId });
    },
    [code],
  );

  return { view, connection, error, command, kick };
}

/** The single "advance" action for Space / the big button: what a host most likely wants next. */
export function primaryCommand(view: HostView | null): HostCommand | null {
  if (!view) return null;
  const has = (c: HostCommand) => view.availableCommands.includes(c);
  switch (view.phase) {
    case "LOBBY":
      return has("START") ? "START" : null;
    case "QUESTION_READING":
      return "OPEN_ANSWERS";
    case "QUESTION_ACTIVE":
      return "LOCK";
    case "QUESTION_LOCKED":
      return has("SHOW_STATS") ? "SHOW_STATS" : "REVEAL";
    case "ANSWER_DISTRIBUTION":
      return "REVEAL";
    case "ANSWER_REVEAL":
      return has("LEADERBOARD") ? "LEADERBOARD" : "NEXT";
    case "LEADERBOARD":
      return "NEXT";
    case "FINISHED":
      return has("PODIUM_NEXT") ? "PODIUM_NEXT" : null;
    default:
      return null;
  }
}

export const COMMAND_LABELS: Record<HostCommand, string> = {
  START: "Start game",
  OPEN_ANSWERS: "Start timer",
  PAUSE: "Pause",
  RESUME: "Resume",
  ADJUST_TIMER: "Adjust timer",
  SKIP: "Skip question",
  LOCK: "Lock answers",
  SHOW_STATS: "Show answers",
  REVEAL: "Reveal answer",
  LEADERBOARD: "Leaderboard",
  NEXT: "Next question",
  PODIUM_NEXT: "Next reveal",
  END: "End game",
};

/** Human names for game phases, shared by every host surface. */
export const PHASE_LABELS: Record<HostView["phase"], string> = {
  LOBBY: "Lobby open",
  COUNTDOWN: "Starting",
  QUESTION_READING: "Reading",
  QUESTION_ACTIVE: "Answering",
  QUESTION_LOCKED: "Answers locked",
  ANSWER_DISTRIBUTION: "Showing answers",
  ANSWER_REVEAL: "Answer revealed",
  LEADERBOARD: "Leaderboard",
  FINISHED: "Final results",
};
