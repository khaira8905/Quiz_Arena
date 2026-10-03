import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createDb, type Db } from "../src/db";
import { MemoryGamePersistence } from "../src/game/persistence";
import { hashPassword } from "../src/lib/auth";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("question bank and organiser defaults", () => {
  let app: FastifyInstance;
  let db: Db;
  const suffix = randomBytes(4).toString("hex");
  const alice = { email: `bank-a-${suffix}@test.dev`, password: "correct horse battery" };
  const bob = { email: `bank-b-${suffix}@test.dev`, password: "correct horse battery" };
  let aliceCookie = "";
  let bobCookie = "";

  const login = async (u: { email: string; password: string }) => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: u });
    return String(res.headers["set-cookie"]).split(";")[0]!;
  };
  const q = (text: string, extra: object = {}) => ({
    type: "MULTIPLE_CHOICE",
    text,
    options: [
      { text: "Yes", isCorrect: true },
      { text: "No", isCorrect: false },
    ],
    ...extra,
  });
  const createQuiz = async (cookie: string, title: string, questions?: object[]) =>
    (
      await app.inject({
        method: "POST",
        url: "/api/quizzes",
        headers: { cookie },
        payload: { title, ...(questions ? { questions } : {}) },
      })
    ).json().quiz;

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
      google: null,
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

  it("lists questions across quizzes with tag, category and difficulty filters", async () => {
    await createQuiz(aliceCookie, "Science night", [
      q("Is the Sun a star?", {
        tags: ["Space", "space", " stars "],
        category: "Science",
        difficulty: "EASY",
      }),
      q("Is Pluto a planet?", { tags: ["space"], category: "Science", difficulty: "HARD" }),
    ]);
    await createQuiz(aliceCookie, "History", [
      q("Was Rome built in a day?", { category: "History" }),
    ]);
    await createQuiz(bobCookie, "Bob's", [q("Is Bob's question private?", { tags: ["space"] })]);

    const all = await app.inject({
      method: "GET",
      url: "/api/bank",
      headers: { cookie: aliceCookie },
    });
    const body = all.json();
    expect(body.questions.map((x: { text: string }) => x.text).sort()).toEqual([
      "Is Pluto a planet?",
      "Is the Sun a star?",
      "Was Rome built in a day?",
    ]);
    expect(
      body.questions.find((x: { text: string }) => x.text === "Is the Sun a star?"),
    ).toMatchObject({
      tags: ["space", "stars"],
      quizTitle: "Science night",
    });
    expect(body.facets.tags).toEqual([
      { tag: "space", count: 2 },
      { tag: "stars", count: 1 },
    ]);
    expect(body.facets.categories.map((c: { category: string }) => c.category)).toEqual([
      "History",
      "Science",
    ]);

    const hard = await app.inject({
      method: "GET",
      url: "/api/bank?tag=space&difficulty=HARD",
      headers: { cookie: aliceCookie },
    });
    expect(hard.json().questions.map((x: { text: string }) => x.text)).toEqual([
      "Is Pluto a planet?",
    ]);
    const byAnswer = await app.inject({
      method: "GET",
      url: "/api/bank?q=no",
      headers: { cookie: aliceCookie },
    });
    expect(byAnswer.json().total).toBe(3); // matches the "No" option text too
  });

  it("copies bank questions into a quiz, replacing an untouched placeholder", async () => {
    const bank = (
      await app.inject({
        method: "GET",
        url: "/api/bank?category=Science",
        headers: { cookie: aliceCookie },
      })
    ).json();
    const target = await createQuiz(aliceCookie, "Mixed bag");
    expect(target.questions).toHaveLength(1); // the blank starter question
    const ids = bank.questions.map((x: { id: string }) => x.id);
    const res = await app.inject({
      method: "POST",
      url: `/api/quizzes/${target.id}/questions/copy`,
      headers: { cookie: aliceCookie },
      payload: { questionIds: ids },
    });
    expect(res.statusCode).toBe(200);
    const quiz = res.json().quiz;
    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions.map((x: { order: number }) => x.order)).toEqual([0, 1]);
    // Copies, not links: new ids, same content.
    expect(quiz.questions.map((x: { id: string }) => x.id)).not.toContain(ids[0]);
    expect(quiz.questions[0].options).toHaveLength(2);

    // Bob can't copy Alice's questions, or into Alice's quiz.
    const bobsQuiz = await createQuiz(bobCookie, "Bob target");
    const steal = await app.inject({
      method: "POST",
      url: `/api/quizzes/${bobsQuiz.id}/questions/copy`,
      headers: { cookie: bobCookie },
      payload: { questionIds: ids },
    });
    expect(steal.statusCode).toBe(404);
  });

  it("seeds new quizzes from the organiser's defaults", async () => {
    const saved = await app.inject({
      method: "PATCH",
      url: "/api/me/preferences",
      headers: { cookie: aliceCookie },
      payload: {
        quizDefaults: {
          defaultTimerSec: 30,
          readingTimeSec: 8,
          leaderboardEvery: 3,
          autoRevealSec: 4,
        },
      },
    });
    expect(saved.statusCode).toBe(200);
    // A second patch merges instead of replacing.
    await app.inject({
      method: "PATCH",
      url: "/api/me/preferences",
      headers: { cookie: aliceCookie },
      payload: { quizDefaults: { showAnswerStats: false } },
    });
    const prefs = (
      await app.inject({
        method: "GET",
        url: "/api/me/preferences",
        headers: { cookie: aliceCookie },
      })
    ).json().preferences;
    expect(prefs.quizDefaults).toEqual({
      defaultTimerSec: 30,
      readingTimeSec: 8,
      leaderboardEvery: 3,
      autoRevealSec: 4,
      showAnswerStats: false,
    });

    const quiz = await createQuiz(aliceCookie, "Uses defaults");
    expect(quiz).toMatchObject({
      defaultTimerSec: 30,
      readingTimeSec: 8,
      leaderboardEvery: 3,
      autoRevealSec: 4,
      showAnswerStats: false,
    });
    const bobQuiz = await createQuiz(bobCookie, "Bob default");
    expect(bobQuiz.defaultTimerSec).toBe(20);

    const bad = await app.inject({
      method: "PATCH",
      url: "/api/me/preferences",
      headers: { cookie: aliceCookie },
      payload: { quizDefaults: { autoRevealSec: 999 } },
    });
    expect(bad.statusCode).toBe(400);
  });
});
