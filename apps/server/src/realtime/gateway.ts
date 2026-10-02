import type { Server as HttpServer } from "node:http";
import {
  ERROR_COPY,
  answerPayloadSchema,
  hostAttachSchema,
  hostCommandSchema,
  hostKickSchema,
  joinPayloadSchema,
  reconnectPayloadSchema,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "@quizarena/shared";
import { Server, type Socket } from "socket.io";
import { ZodError } from "zod";
import type { GameManager } from "../game/game-manager";
import type { GameRoom, Logger, RoomOutput } from "../game/game-room";
import type { TokenService } from "../lib/auth";
import { AppError, isAppError } from "../lib/errors";
import { TokenBucket } from "./socket-rate-limit";

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Room naming. Every broadcast is addressed to one of these, never to `io` as a whole. */
export const rooms = {
  player: (participantId: string) => `p:${participantId}`,
  players: (code: string) => `g:${code}`,
  hosts: (code: string) => `h:${code}`,
};

export function createRoomOutput(io: IoServer, code: string): RoomOutput {
  return {
    toPlayer: (participantId, view) => io.to(rooms.player(participantId)).emit("session:state", view),
    toHosts: (event, ...args) => io.to(rooms.hosts(code)).emit(event, ...args),
    toPlayers: (event, ...args) => io.to(rooms.players(code)).emit(event, ...args),
    closePlayer: (participantId, errorCode, message) => {
      const target = io.in(rooms.player(participantId));
      target.emit("session:closed", { code: errorCode, message });
      target.disconnectSockets(true);
    },
  };
}

export function createIo(httpServer: HttpServer, origins: string[]): IoServer {
  return new Server(httpServer, {
    cors: { origin: origins, credentials: true },
    // Heartbeats: a dead phone is detected within ~25s and its seat marked offline.
    pingInterval: 10_000,
    pingTimeout: 15_000,
    // Clients only ever send tiny payloads.
    maxHttpBufferSize: 16 * 1024,
    serveClient: false,
  });
}

interface GatewayDeps {
  io: IoServer;
  games: GameManager;
  tokens: TokenService;
  log: Logger;
}

export function attachGateway({ io, games, tokens, log }: GatewayDeps) {
  io.use(async (socket, next) => {
    socket.data = { role: "anonymous", userId: null, gameCode: null, participantId: null };
    const ticket: unknown = socket.handshake.auth?.ticket;
    if (typeof ticket === "string" && ticket.length < 2048) {
      socket.data.userId = await tokens.verify(ticket, "socket");
    }
    next();
  });

  io.on("connection", (socket: IoSocket) => {
    const general = new TokenBucket(30, 10);
    const joins = new TokenBucket(6, 0.2);

    /**
     * Wraps every acknowledged handler: rate limiting, validation errors, and a guarantee
     * that the client always receives exactly one well-formed response.
     */
    const handle =
      <P, T>(fn: (payload: P) => Promise<T> | T, bucket = general) =>
      async (payload: P, ack: Ack<T>) => {
        if (typeof ack !== "function") return;
        if (!bucket.take()) {
          ack({ ok: false, error: { code: "RATE_LIMITED", message: ERROR_COPY.RATE_LIMITED.message } });
          return;
        }
        try {
          ack({ ok: true, data: await fn(payload) });
        } catch (err) {
          if (isAppError(err)) ack({ ok: false, error: { code: err.code, message: err.message } });
          else if (err instanceof ZodError) {
            ack({ ok: false, error: { code: "BAD_REQUEST", message: err.issues[0]?.message ?? "Invalid payload" } });
          } else {
            log.error({ err }, "socket handler failed");
            ack({ ok: false, error: { code: "INTERNAL", message: ERROR_COPY.INTERNAL.message } });
          }
        }
      };

    const roomFor = (code: string): GameRoom => {
      const room = games.get(code);
      if (!room) throw new AppError("INVALID_GAME_CODE");
      return room;
    };

    /** Detaches this socket from whatever game it was bound to (switching games, leaving). */
    const unbind = () => {
      const { gameCode, participantId, role } = socket.data;
      if (gameCode && participantId && role === "player") {
        socket.leave(rooms.player(participantId));
        socket.leave(rooms.players(gameCode));
      }
      if (gameCode && role === "host") socket.leave(rooms.hosts(gameCode));
      socket.data.role = "anonymous";
      socket.data.gameCode = null;
      socket.data.participantId = null;
    };

    const bindPlayer = async (code: string, participantId: string) => {
      // One live connection per seat: a second tab or device takes over the seat.
      const previous = await io.in(rooms.player(participantId)).fetchSockets();
      for (const s of previous) {
        if (s.id === socket.id) continue;
        s.emit("session:closed", {
          code: "REPLACED_BY_NEW_CONNECTION",
          message: ERROR_COPY.REPLACED_BY_NEW_CONNECTION.message,
        });
        s.data.participantId = null;
        s.data.role = "anonymous";
        s.disconnect(true);
      }
      unbind();
      socket.join([rooms.player(participantId), rooms.players(code)]);
      socket.data = { ...socket.data, role: "player", gameCode: code, participantId };
    };

    socket.on(
      "session:join",
      handle(async (raw) => {
        const payload = joinPayloadSchema.parse(raw);
        const room = roomFor(payload.code);
        // Leaving a previous seat in the same game first keeps "rejoin with a new name" sane.
        if (socket.data.role === "player" && socket.data.gameCode === room.code && socket.data.participantId) {
          room.remove(socket.data.participantId);
        }
        const result = await room.join(payload.nickname);
        await bindPlayer(room.code, result.participantId);
        return result;
      }, joins),
    );

    socket.on(
      "player:reconnect",
      handle(async (raw) => {
        const payload = reconnectPayloadSchema.parse(raw);
        const room = roomFor(payload.code);
        const { participantId } = room.reconnect(payload.token);
        await bindPlayer(room.code, participantId);
        // Re-read after binding so the view reflects the connected state.
        return { participantId, token: payload.token, view: room.playerView(participantId) };
      }, joins),
    );

    socket.on("session:leave", () => {
      const { gameCode, participantId, role } = socket.data;
      if (role === "player" && gameCode && participantId) {
        const room = games.get(gameCode);
        unbind();
        room?.remove(participantId);
      }
    });

    socket.on(
      "question:answer",
      handle((raw) => {
        // Stamp receipt before anything else: this is the authoritative answer time.
        const receivedAt = Date.now();
        const payload = answerPayloadSchema.parse(raw);
        const { gameCode, participantId, role } = socket.data;
        if (role !== "player" || !gameCode || !participantId) throw new AppError("SESSION_EXPIRED");
        return roomFor(gameCode).submitAnswer(participantId, payload.questionId, payload.optionId, receivedAt);
      }),
    );

    socket.on("timer:sync", (payload, ack) => {
      if (typeof ack !== "function" || !general.take(0.25)) return;
      const clientTime = typeof payload?.clientTime === "number" ? payload.clientTime : 0;
      ack({ clientTime, serverTime: Date.now() });
    });

    const requireHost = (code: string): GameRoom => {
      if (!socket.data.userId) throw new AppError("UNAUTHORIZED");
      const room = roomFor(code);
      if (room.hostId !== socket.data.userId) throw new AppError("FORBIDDEN");
      return room;
    };

    socket.on(
      "host:attach",
      handle((raw) => {
        const { code } = hostAttachSchema.parse(raw);
        const room = requireHost(code);
        unbind();
        socket.join(rooms.hosts(room.code));
        socket.data.role = "host";
        socket.data.gameCode = room.code;
        return room.hostView();
      }),
    );

    socket.on(
      "host:command",
      handle((raw) => {
        const { code, command } = hostCommandSchema.parse(raw);
        const room = requireHost(code);
        room.command(command);
        return room.hostView();
      }),
    );

    socket.on(
      "host:kick",
      handle((raw) => {
        const { code, participantId } = hostKickSchema.parse(raw);
        const room = requireHost(code);
        if (!room.hasParticipant(participantId)) throw new AppError("NOT_FOUND");
        room.remove(participantId, "The host removed you from this game.");
        return null;
      }),
    );

    socket.on("disconnect", () => {
      const { gameCode, participantId, role } = socket.data;
      if (role !== "player" || !gameCode || !participantId) return;
      const room = games.get(gameCode);
      if (!room) return;
      // Only mark offline if no other socket still holds this seat.
      void io
        .in(rooms.player(participantId))
        .fetchSockets()
        .then((others) => {
          if (others.length === 0) room.setConnected(participantId, false);
        })
        .catch((err) => log.error({ err }, "disconnect bookkeeping failed"));
    });
  });
}
