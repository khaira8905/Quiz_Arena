/**
 * Load simulation: N players join a real game and play every question while a host drives it.
 *
 *   pnpm loadtest -- --players 100 --api http://localhost:4000
 *   pnpm loadtest -- --players 500 --burst      (everyone answers in the same tick)
 *
 * Requires a running server and an admin account (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
 * Reports join time, answer ack latency percentiles and broadcast fan-out time.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import type {
  AckResponse,
  ClientToServerEvents,
  HostView,
  JoinResult,
  PlayerView,
  ProjectorView,
  QuizSummaryDto,
  ServerToClientEvents,
  SessionSummaryDto,
} from "@quizarena/shared";
import { io, type Socket } from "socket.io-client";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const { values } = parseArgs({
  // `pnpm loadtest -- --players 100` forwards the literal "--"; drop it.
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    players: { type: "string", default: "100" },
    api: { type: "string", default: "http://localhost:4000" },
    questions: { type: "string", default: "4" },
    // Every player answers in the same tick: the worst case for the answer path.
    burst: { type: "boolean", default: false },
  },
});
const PLAYERS = Number(values.players);
const API = values.api!;
const MAX_QUESTIONS = Number(values.questions);

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function call<T>(
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<AckResponse<T>> {
  return new Promise((resolve) =>
    (socket.emit as (e: string, p: unknown, a: (r: AckResponse<T>) => void) => void)(
      event,
      payload,
      resolve,
    ),
  );
}

async function api<T>(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<{ data: T; cookie?: string }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return { data: (await res.json()) as T, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD");

  const { cookie } = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!cookie) throw new Error("login returned no cookie");
  const { data: list } = await api<{ quizzes: QuizSummaryDto[] }>("/api/quizzes?status=PUBLISHED", {
    cookie,
  });
  const quiz = list.quizzes[0];
  if (!quiz) throw new Error("No published quiz — run pnpm db:seed");
  const { data: created } = await api<{ session: SessionSummaryDto }>("/api/sessions", {
    method: "POST",
    cookie,
    body: JSON.stringify({ quizId: quiz.id }),
  });
  const code = created.session.code;
  const { data: t } = await api<{ ticket: string }>("/api/auth/socket-ticket", { cookie });

  console.log(`▶ ${quiz.title} — game ${code}, ${PLAYERS} players`);

  const host: Client = io(API, { transports: ["websocket"], auth: { ticket: t.ticket } });
  await new Promise<void>((r) => host.once("connect", () => r()));
  const attach = await call<HostView>(host, "host:attach", { code });
  if (!attach.ok) throw new Error(`host attach failed: ${attach.error.code}`);

  // ---- join
  const joinStart = Date.now();
  const players: { socket: Client; latest: PlayerView | null; id: string }[] = [];
  const errors: Record<string, number> = {};
  const bump = (k: string) => (errors[k] = (errors[k] ?? 0) + 1);

  await Promise.all(
    Array.from({ length: PLAYERS }, async (_, i) => {
      await sleep(Math.random() * 1500); // a crowd scanning a QR code, not a single burst
      const socket: Client = io(API, { transports: ["websocket"], forceNew: true });
      await new Promise<void>((r) => socket.once("connect", () => r()));
      const res = await call<JoinResult>(socket, "session:join", {
        code,
        nickname: `Bot ${String(i).padStart(3, "0")}`,
      });
      if (!res.ok) {
        bump(`join:${res.error.code}`);
        socket.disconnect();
        return;
      }
      const entry = {
        socket,
        latest: res.data.view as PlayerView | null,
        id: res.data.participantId,
      };
      socket.on("session:state", (v) => (entry.latest = v as PlayerView));
      players.push(entry);
    }),
  );
  const joinMs = Date.now() - joinStart;
  console.log(`  joined ${players.length}/${PLAYERS} in ${joinMs} ms`);

  const ackLatencies: number[] = [];
  const fanout: number[] = [];

  /** Time from issuing a host command until every player has received the resulting phase. */
  // Quizzes with a reading period open each question with the answers closed: the host
  // opens them (measured like every other broadcast).
  const readingMode = attach.data.settings.readingMode;
  async function openAnswers() {
    if (readingMode !== "OFF") await commandAndMeasure("OPEN_ANSWERS", "QUESTION_ACTIVE");
  }

  async function commandAndMeasure(command: string, phase: PlayerView["phase"]) {
    const t0 = Date.now();
    const waits = players.map(
      (p) =>
        new Promise<number>((resolve) => {
          if (p.latest?.phase === phase && command !== "NEXT") return resolve(0);
          const h = (v: PlayerView | HostView | ProjectorView) => {
            if (v.phase === phase) {
              p.socket.off("session:state", h);
              resolve(Date.now() - t0);
            }
          };
          p.socket.on("session:state", h);
        }),
    );
    const res = await call<HostView>(host, "host:command", { code, command });
    if (!res.ok) throw new Error(`${command} failed: ${res.error.code}`);
    const times = await Promise.race([Promise.all(waits), sleep(10_000).then(() => null)]);
    if (!times) throw new Error(`${command}: not every player received ${phase} within 10s`);
    fanout.push(Math.max(...times));
    return res.data;
  }

  // ---- start
  const startWaits = players.map(
    (p) =>
      new Promise<void>((resolve) => {
        const h = (v: PlayerView | HostView | ProjectorView) => {
          if (v.phase === "QUESTION_READING" || v.phase === "QUESTION_ACTIVE") {
            p.socket.off("session:state", h);
            resolve();
          }
        };
        p.socket.on("session:state", h);
      }),
  );
  await call(host, "host:command", { code, command: "START" });
  await Promise.all(startWaits);
  await openAnswers();

  const rounds = Math.min(MAX_QUESTIONS, created.session.questionCount);
  for (let q = 0; q < rounds; q++) {
    // ---- answer
    await Promise.all(
      players.map(async (p) => {
        const question = p.latest?.question;
        if (!question || p.latest?.phase !== "QUESTION_ACTIVE") return bump("not-active");
        await sleep(values.burst ? 300 : 300 + Math.random() * 2500);
        const option = question.options[Math.floor(Math.random() * question.options.length)]!;
        const t0 = Date.now();
        const res = await call(p.socket, "question:answer", {
          questionId: question.id,
          optionId: option.id,
        });
        ackLatencies.push(Date.now() - t0);
        if (!res.ok) bump(`answer:${res.error.code}`);
      }),
    );
    await sleep(200);
    await commandAndMeasure("REVEAL", "ANSWER_REVEAL");
    const correct = players.filter((p) => p.latest?.result?.correct).length;
    await commandAndMeasure("LEADERBOARD", "LEADERBOARD");
    console.log(`  Q${q + 1}: ${correct}/${players.length} correct`);
    if (q + 1 < rounds) {
      await commandAndMeasure(
        "NEXT",
        readingMode === "OFF" ? "QUESTION_ACTIVE" : "QUESTION_READING",
      );
      await openAnswers();
    }
  }

  const final = await commandAndMeasure("END", "FINISHED");
  const winner = final.results?.standings[0];

  console.log("\n── results ───────────────────────────────");
  console.log(`  players                 ${players.length}`);
  console.log(`  join (all)              ${joinMs} ms`);
  console.log(
    `  answer ack p50/p95/p99  ${pct(ackLatencies, 50)} / ${pct(ackLatencies, 95)} / ${pct(ackLatencies, 99)} ms`,
  );
  console.log(`  broadcast fan-out max   ${Math.max(...fanout)} ms (p95 ${pct(fanout, 95)} ms)`);
  console.log(`  winner                  ${winner?.nickname} (${winner?.score})`);
  console.log(
    `  errors                  ${Object.keys(errors).length ? JSON.stringify(errors) : "none"}`,
  );

  for (const p of players) p.socket.disconnect();
  host.disconnect();
  process.exit(Object.keys(errors).length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
