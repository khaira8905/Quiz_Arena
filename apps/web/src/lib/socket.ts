import type { AckResponse, ClientToServerEvents, ServerToClientEvents } from "@quizarena/shared/events";
import { io, type Socket } from "socket.io-client";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";

export function createGameSocket(auth?: () => Promise<Record<string, string>>): GameSocket {
  return io(REALTIME_URL, {
    // WebSocket first; long-polling fallback for venues whose proxies block upgrades.
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    randomizationFactor: 0.5,
    timeout: 8000,
    // Ticket is refetched on every (re)connect: tickets are short-lived by design.
    auth: auth ? (cb) => void auth().then(cb, () => cb({})) : undefined,
  });
}

/** Promise wrapper for acknowledged emits, with a timeout so the UI never hangs. */
export function emitAck<T>(
  socket: GameSocket,
  event: keyof ClientToServerEvents,
  payload: unknown,
  timeoutMs = 8000,
): Promise<AckResponse<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, error: { code: "INTERNAL", message: "The server didn't respond in time." } }),
      timeoutMs,
    );
    (socket.emit as (e: string, p: unknown, ack: (r: AckResponse<T>) => void) => void)(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}
