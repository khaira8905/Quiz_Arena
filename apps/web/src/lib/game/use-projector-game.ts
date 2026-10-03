"use client";

import type { ErrorCode } from "@quizarena/shared/errors";
import { leaderboardDue, type HostCommand, type ProjectorView } from "@quizarena/shared/game";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { seedOffset, syncClock } from "../clock";
import { createGameSocket, emitAck, type GameSocket } from "../socket";

export type StageConnection = "connecting" | "live" | "reconnecting" | "failed";

/** Names the stage keeps in the lobby roster (matches the server's cap). */
const ROSTER_CAP = 140;

/**
 * The stage's live state: the projector window and the host's projector preview both use
 * this, so they show exactly the same thing. It receives only the server's audience-safe
 * ProjectorView plus stage-safe deltas (joins, counts, answer totals, clock changes).
 */
export function useProjectorGame(code: string) {
  const [view, setView] = useState<ProjectorView | null>(null);
  const [connection, setConnection] = useState<StageConnection>("connecting");
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  const viewRef = useRef<ProjectorView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const socket = createGameSocket(async () => {
      const { ticket } = await api<{ ticket: string }>("/auth/socket-ticket");
      return { ticket };
    });
    socketRef.current = socket;

    // Join bursts are batched: 100 players arriving in a second cause a few renders.
    let joined: ProjectorView["lobbyPlayers"] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushJoins = () => {
      flushTimer = null;
      const batch = joined;
      joined = [];
      setView((v) => {
        if (!v || v.phase !== "LOBBY") return v;
        const known = new Set(v.lobbyPlayers.map((p) => p.id));
        const added = batch.filter((p) => !known.has(p.id));
        if (!added.length) return v;
        return { ...v, lobbyPlayers: [...v.lobbyPlayers, ...added].slice(0, ROSTER_CAP) };
      });
    };

    const attach = async () => {
      const res = await emitAck<ProjectorView>(socket, "projector:attach", { code });
      if (res.ok) {
        seedOffset(res.data.serverTime);
        setView(res.data);
        setConnection("live");
        setError(null);
        void syncClock(socket);
      } else {
        setError(res.error);
        setConnection("failed");
        if (["FORBIDDEN", "INVALID_GAME_CODE"].includes(res.error.code)) socket.disconnect();
      }
    };

    socket.on("connect", () => void attach());
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") setConnection("reconnecting");
    });
    socket.on("connect_error", () => setConnection((c) => (c === "live" ? "reconnecting" : c)));

    socket.on("session:state", (v) => {
      if (v.role !== "projector") return;
      joined = [];
      setView(v);
    });
    socket.on("session:player_joined", (p) => {
      joined.push({ id: p.id, nickname: p.nickname, connected: p.connected });
      flushTimer ??= setTimeout(flushJoins, 160);
    });
    socket.on("session:player_left", ({ participantId }) =>
      setView((v) =>
        v ? { ...v, lobbyPlayers: v.lobbyPlayers.filter((p) => p.id !== participantId) } : v,
      ),
    );
    socket.on("session:player_status", ({ participantId, connected }) =>
      setView((v) =>
        v
          ? {
              ...v,
              lobbyPlayers: v.lobbyPlayers.map((p) =>
                p.id === participantId ? { ...p, connected } : p,
              ),
            }
          : v,
      ),
    );
    socket.on("session:player_count", ({ count, connected }) =>
      setView((v) => (v ? { ...v, playerCount: count, connectedCount: connected } : v)),
    );
    socket.on("question:answered", ({ questionId, answered }) =>
      setView((v) => (v && v.question?.id === questionId ? { ...v, answeredCount: answered } : v)),
    );
    socket.on("timer:sync", ({ deadline, paused, remainingMs, durationMs }) =>
      setView((v) =>
        v && v.timer
          ? { ...v, paused, timer: { ...v.timer, deadline, paused, remainingMs, durationMs } }
          : v,
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

  /**
   * Keyboard control from the projector window itself (single-screen setups): the window is
   * the host's own browser, so the server accepts the host's commands from it.
   */
  const command = useCallback(
    async (cmd: HostCommand) => {
      const socket = socketRef.current;
      if (!socket) return;
      // Same double-step guard as the control room: the step applies only if the game is
      // still where this screen last saw it.
      const v = viewRef.current;
      const index = v?.question
        ? v.question.index
        : v && ["LOBBY", "COUNTDOWN"].includes(v.phase)
          ? -1
          : null;
      return emitAck(socket, "host:command", {
        code,
        command: cmd,
        expected: v && index !== null ? { phase: v.phase, questionIndex: index } : undefined,
      });
    },
    [code],
  );

  return { view, connection, error, command };
}

/** The "advance" step the stage's keyboard triggers, derived from what the stage knows. */
export function stagePrimaryCommand(v: ProjectorView | null): HostCommand | null {
  if (!v) return null;
  switch (v.phase) {
    case "LOBBY":
      return v.playerCount > 0 ? "START" : null;
    case "QUESTION_READING":
      return "OPEN_ANSWERS";
    case "QUESTION_ACTIVE":
      return "LOCK";
    case "QUESTION_LOCKED":
      return v.settings.showAnswerStats ? "SHOW_STATS" : "REVEAL";
    case "ANSWER_DISTRIBUTION":
      return "REVEAL";
    case "ANSWER_REVEAL":
      return v.question && leaderboardDue(v.settings, v.question.index, v.question.total)
        ? "LEADERBOARD"
        : "NEXT";
    case "LEADERBOARD":
      return "NEXT";
    case "FINISHED":
      return v.podiumStep !== "BOARD" ? "PODIUM_NEXT" : null;
    default:
      return null;
  }
}
