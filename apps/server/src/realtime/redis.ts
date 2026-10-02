import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type { IoServer } from "./gateway";

/**
 * Enables cross-node fan-out: an emit to `h:QA482193` on node A reaches host sockets connected
 * to node B. Game rooms themselves remain owned by one node — route players by game code
 * (see docs/ARCHITECTURE.md, "Scaling out").
 */
export async function enableRedisAdapter(io: IoServer, url: string) {
  const pub = createClient({ url });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
}
