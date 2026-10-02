import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createDb, type Db } from "../src/db";
import { MemoryGamePersistence } from "../src/game/persistence";
import { hashPassword } from "../src/lib/auth";

/**
 * HTTP API tests against a real Postgres (DATABASE_URL). Skipped when no database is
 * configured, so `pnpm test` still runs everywhere; CI provides a database service.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("REST API", () => {
  let app: FastifyInstance;
  let db: Db;
  const suffix = randomBytes(4).toString("hex");
  const alice = { email: `alice-${suffix}@test.dev`, password: "correct horse battery" };
  const bob = { email: `bob-${suffix}@test.dev`, password: "correct horse battery" };
  let aliceCookie = "";
  let bobCookie = "";

  const login = async (u: { email: string; password: string }) => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: u });
    expect(res.statusCode).toBe(200);
    return String(res.headers["set-cookie"]).split(";")[0]!;
  };

  beforeAll(async () => {
    const config = loadConfig({
      ...process.env,
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      NODE_ENV: "test",
    });
    db = createDb(config.DATABASE_URL);
    ({ app } = await buildApp(config, db, {
      persistence: new MemoryGamePersistence(),
      logger: false,
    }));
    const passwordHash = await hashPassword(alice.password);
    await db.user.createMany({
      data: [
        { email: alice.email, name: "Alice", passwordHash },
        { email: bob.email, name: "Bob", passwordHash },
      ],
    });
    aliceCookie = await login(alice);
    bobCookie = await login(bob);
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { email: { in: [alice.email, bob.email] } } });
    await app?.close();
    await db?.$disconnect();
  });

  it("rejects bad credentials and unauthenticated requests", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { ...alice, password: "nope" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    const anon = await app.inject({ method: "GET", url: "/api/quizzes" });
    expect(anon.statusCode).toBe(401);
  });

  it("sets an httpOnly session cookie", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: alice });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("covers the quiz lifecycle with validation and ownership", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/quizzes",
      headers: { cookie: aliceCookie },
      payload: { title: "  Networks 101  " },
    });
    expect(created.statusCode).toBe(201);
    const quiz = created.json().quiz;
    expect(quiz.title).toBe("Networks 101");
    expect(quiz.questions).toHaveLength(1);

    // Another admin can't see or touch it.
    const foreign = await app.inject({
      method: "GET",
      url: `/api/quizzes/${quiz.id}`,
      headers: { cookie: bobCookie },
    });
    expect(foreign.statusCode).toBe(404);

    // Publishing an incomplete quiz is refused with per-question problems.
    const publish = await app.inject({
      method: "PATCH",
      url: `/api/quizzes/${quiz.id}`,
      headers: { cookie: aliceCookie },
      payload: { status: "PUBLISHED" },
    });
    expect(publish.statusCode).toBe(400);
    expect(publish.json().error.details.problems[0].issues).toContain(
      "Mark exactly one correct answer",
    );

    // Going live with an incomplete quiz is refused too.
    const early = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers: { cookie: aliceCookie },
      payload: { quizId: quiz.id },
    });
    expect(early.statusCode).toBe(400);

    const qid = quiz.questions[0].id;
    const optionIds = quiz.questions[0].options.map((o: { id: string }) => o.id);
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/questions/${qid}`,
      headers: { cookie: aliceCookie },
      payload: {
        text: "Which layer does TCP live in?",
        timeLimitSec: 15,
        options: [
          { text: "Transport", isCorrect: true },
          { text: "Network", isCorrect: false },
          { text: "Session", isCorrect: false },
        ],
      },
    });
    expect(edited.statusCode).toBe(200);
    const q = edited.json().question;
    expect(q.options).toHaveLength(3);
    // Option ids are stable across edits.
    expect(q.options.map((o: { id: string }) => o.id)).toEqual(optionIds.slice(0, 3));

    const twoCorrect = await app.inject({
      method: "PATCH",
      url: `/api/questions/${qid}`,
      headers: { cookie: aliceCookie },
      payload: {
        options: [
          { text: "a", isCorrect: true },
          { text: "b", isCorrect: true },
        ],
      },
    });
    expect(twoCorrect.statusCode).toBe(400);

    const tf = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quiz.id}/questions`,
      headers: { cookie: aliceCookie },
      payload: { type: "TRUE_FALSE", text: "UDP is connectionless." },
    });
    expect(tf.statusCode).toBe(201);
    expect(tf.json().question.options.map((o: { text: string }) => o.text)).toEqual([
      "True",
      "False",
    ]);

    const dup = await app.inject({
      method: "POST",
      url: `/api/questions/${qid}/duplicate`,
      headers: { cookie: aliceCookie },
    });
    expect(dup.statusCode).toBe(201);
    expect(dup.json().question.order).toBe(1);

    const full = (
      await app.inject({
        method: "GET",
        url: `/api/quizzes/${quiz.id}`,
        headers: { cookie: aliceCookie },
      })
    ).json().quiz;
    const ids = full.questions.map((x: { id: string }) => x.id);
    expect(ids).toHaveLength(3);
    const reordered = await app.inject({
      method: "PUT",
      url: `/api/quizzes/${quiz.id}/questions/order`,
      headers: { cookie: aliceCookie },
      payload: { questionIds: [...ids].reverse() },
    });
    expect(reordered.json().quiz.questions.map((x: { id: string }) => x.id)).toEqual(
      [...ids].reverse(),
    );

    const published = await app.inject({
      method: "PATCH",
      url: `/api/quizzes/${quiz.id}`,
      headers: { cookie: aliceCookie },
      payload: { status: "PUBLISHED", defaultTimerSec: 30, showLeaderboard: false },
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().quiz).toMatchObject({
      status: "PUBLISHED",
      defaultTimerSec: 30,
      showLeaderboard: false,
    });

    // Session: created, discoverable by code, owned by Alice only.
    const session = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers: { cookie: aliceCookie },
      payload: { quizId: quiz.id },
    });
    expect(session.statusCode).toBe(201);
    const { code, id: sessionId } = session.json().session;
    expect(code).toMatch(/^QA\d{4}$/);
    const lookup = await app.inject({ method: "GET", url: `/api/games/${code.toLowerCase()}` });
    expect(lookup.json()).toMatchObject({ code, joinable: true, phase: "LOBBY" });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/sessions/${sessionId}`,
          headers: { cookie: bobCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/sessions/${sessionId}/results`,
          headers: { cookie: aliceCookie },
        })
      ).statusCode,
    ).toBe(409);

    const copy = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quiz.id}/duplicate`,
      headers: { cookie: aliceCookie },
    });
    expect(copy.json().quiz).toMatchObject({
      title: "Networks 101 (copy)",
      status: "DRAFT",
      questionCount: 3,
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/api/quizzes/${quiz.id}`,
      headers: { cookie: aliceCookie },
    });
    expect(del.statusCode).toBe(204);
  });

  it("rejects unknown game codes on the public lookup", async () => {
    expect((await app.inject({ method: "GET", url: "/api/games/QA0001" })).json()).toMatchObject({
      error: { code: "INVALID_GAME_CODE" },
    });
    expect((await app.inject({ method: "GET", url: "/api/games/hello" })).statusCode).toBe(404);
  });

  it("exports finished results as CSV with formula injection neutralised", async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { email: alice.email } });
    const session = await db.quizSession.create({
      data: {
        code: "QA0002",
        hostId: owner.id,
        status: "FINISHED",
        quizTitle: "CSV",
        quizSnapshot: { questions: [{}, {}] },
        participants: { create: { nickname: "=cmd()", nicknameKey: "=cmd()", tokenHash: "x" } },
      },
      include: { participants: true },
    });
    await db.quizResult.create({
      data: {
        sessionId: session.id,
        participantId: session.participants[0]!.id,
        rank: 1,
        score: 1900,
        correctCount: 2,
        answeredCount: 2,
        totalQuestions: 2,
        avgResponseMs: 1500,
        bestStreak: 2,
      },
    });
    const csv = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/results.csv`,
      headers: { cookie: aliceCookie },
    });
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body.split("\n")[1]).toBe("1,'=cmd(),1900,2,2,100,1500,2");
  });
});
