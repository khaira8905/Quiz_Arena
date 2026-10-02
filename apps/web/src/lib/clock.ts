import type { ClientToServerEvents, ServerToClientEvents } from "@quizarena/shared/events";
import type { Socket } from "socket.io-client";

/**
 * Server clock estimate (NTP-style). Each probe measures round-trip time; the probe with the
 * lowest RTT gives the most trustworthy offset. All countdowns render `serverNow()` against
 * the server deadline, so phones with wrong clocks still show the right time remaining.
 * Display only — the server alone decides whether an answer was on time.
 */
let offset = 0;
let bestRtt = Infinity;

export const serverNow = () => Date.now() + offset;

/** Coarse correction from a snapshot's serverTime, used until a probe completes. */
export function seedOffset(serverTime: number) {
  if (bestRtt === Infinity) offset = serverTime - Date.now();
}

export async function syncClock(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  probes = 5,
) {
  bestRtt = Infinity;
  for (let i = 0; i < probes; i++) {
    if (!socket.connected) return;
    const sent = Date.now();
    const res = await new Promise<{ serverTime: number } | null>((resolve) => {
      const t = setTimeout(() => resolve(null), 2000);
      socket.emit("timer:sync", { clientTime: sent }, (r) => {
        clearTimeout(t);
        resolve(r);
      });
    });
    const received = Date.now();
    if (res) {
      const rtt = received - sent;
      if (rtt < bestRtt) {
        bestRtt = rtt;
        offset = res.serverTime + rtt / 2 - received;
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }
}
