import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { withRetry } from "./lib/retry";
import { enableRedisAdapter } from "./realtime/redis";

async function main() {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL);
  const { app, io, games } = await buildApp(config, db);

  if (config.REDIS_URL) {
    await enableRedisAdapter(io, config.REDIS_URL);
    app.log.info("Socket.IO Redis adapter enabled");
  } else {
    // Single-node mode: rooms live in this process, so any session left open by a previous
    // process can no longer be played. Close them out so the dashboard stays truthful.
    // A sleeping database (Neon suspends idle computes) must not stop the server booting.
    try {
      const { count } = await withRetry(
        () =>
          db.quizSession.updateMany({
            where: { status: { in: ["LOBBY", "LIVE"] } },
            data: { status: "ABANDONED", endedAt: new Date() },
          }),
        [2_000, 5_000, 10_000],
        (err, attempt) => app.log.warn({ err, attempt }, "database not reachable yet; retrying"),
      );
      if (count > 0)
        app.log.warn({ count }, "marked sessions from a previous process as abandoned");
    } catch (err) {
      app.log.error({ err }, "could not close out sessions from a previous process");
    }
  }

  await app.listen({ port: config.PORT, host: config.HOST });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    // Platforms allow ~30s after SIGTERM; finish games and save results first.
    await games.drain(8_000);
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
