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

describe.skipIf(!hasDb)("team accounts", () => {
  let app: FastifyInstance;
  let db: Db;
  const suffix = randomBytes(4).toString("hex");
  const admin = { email: `team-admin-${suffix}@test.dev`, password: "correct horse battery" };
  const organiser = { email: `team-org-${suffix}@test.dev`, password: "correct horse battery" };
  const newcomer = { email: `Team-New-${suffix}@Test.dev`, password: "fresh-pass-2026" };
  let adminCookie = "";
  let organiserCookie = "";

  const login = (u: { email: string; password: string }) =>
    app.inject({ method: "POST", url: "/api/auth/login", payload: u });
  const cookieOf = (res: { headers: Record<string, unknown> }) =>
    String(res.headers["set-cookie"]).split(";")[0]!;

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
    const passwordHash = await hashPassword(admin.password);
    await db.user.createMany({
      data: [
        { email: admin.email, name: "Admin", passwordHash, role: "ADMIN" },
        { email: organiser.email, name: "Organiser", passwordHash },
      ],
    });
    adminCookie = cookieOf(await login(admin));
    organiserCookie = cookieOf(await login(organiser));
  });

  afterAll(async () => {
    await db?.user.deleteMany({
      where: { email: { in: [admin.email, organiser.email, newcomer.email.toLowerCase()] } },
    });
    await app?.close();
    await db?.$disconnect();
  });

  it("is for admins only", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/team",
      headers: { cookie: organiserCookie },
    });
    expect(res.statusCode).toBe(403);
    const create = await app.inject({
      method: "POST",
      url: "/api/team",
      headers: { cookie: organiserCookie },
      payload: { ...newcomer, name: "Sneaky" },
    });
    expect(create.statusCode).toBe(403);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: organiserCookie },
    });
    expect(me.json().user.role).toBe("ORGANISER");
  });

  let newcomerId = "";

  it("creates a sign-in that works immediately, without verification", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/team",
      headers: { cookie: adminCookie },
      payload: { ...newcomer, name: "  Priya  " },
    });
    expect(res.statusCode).toBe(201);
    const member = res.json().member;
    expect(member).toMatchObject({
      email: newcomer.email.toLowerCase(),
      name: "Priya",
      role: "ORGANISER",
      disabled: false,
      lastLoginAt: null,
      quizCount: 0,
    });
    expect(JSON.stringify(res.json())).not.toContain(newcomer.password);
    newcomerId = member.id;

    // The email is matched case-insensitively; they're in straight away.
    const signIn = await login({
      email: newcomer.email.toUpperCase(),
      password: newcomer.password,
    });
    expect(signIn.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/api/team",
      headers: { cookie: adminCookie },
    });
    const listed = list.json().members.find((m: { id: string }) => m.id === newcomerId);
    expect(listed.lastLoginAt).not.toBeNull();
    expect(JSON.stringify(list.json())).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("refuses duplicates and weak passwords", async () => {
    const dup = await app.inject({
      method: "POST",
      url: "/api/team",
      headers: { cookie: adminCookie },
      payload: { ...newcomer, name: "Again" },
    });
    expect(dup.statusCode).toBe(409);
    const weak = await app.inject({
      method: "POST",
      url: "/api/team",
      headers: { cookie: adminCookie },
      payload: { email: `weak-${suffix}@test.dev`, name: "Weak", password: "short" },
    });
    expect(weak.statusCode).toBe(400);
  });

  it("resets a password, signing the person out everywhere", async () => {
    const session = cookieOf(await login(newcomer));
    const reset = await app.inject({
      method: "PATCH",
      url: `/api/team/${newcomerId}`,
      headers: { cookie: adminCookie },
      payload: { password: "brand-new-pass-99" },
    });
    expect(reset.statusCode).toBe(200);
    expect((await login(newcomer)).statusCode).toBe(401);
    expect((await login({ email: newcomer.email, password: "brand-new-pass-99" })).statusCode).toBe(
      200,
    );
    const old = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: session },
    });
    expect(old.statusCode).toBe(401);
    newcomer.password = "brand-new-pass-99";
  });

  it("disables and re-enables an account", async () => {
    const session = cookieOf(await login(newcomer));
    await app.inject({
      method: "PATCH",
      url: `/api/team/${newcomerId}`,
      headers: { cookie: adminCookie },
      payload: { disabled: true },
    });
    const blocked = await login(newcomer);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.message).toMatch(/disabled/);
    expect(
      (await app.inject({ method: "GET", url: "/api/quizzes", headers: { cookie: session } }))
        .statusCode,
    ).toBe(401);

    await app.inject({
      method: "PATCH",
      url: `/api/team/${newcomerId}`,
      headers: { cookie: adminCookie },
      payload: { disabled: false, role: "ADMIN" },
    });
    const back = await login(newcomer);
    expect(back.statusCode).toBe(200);
    expect(back.json().user.role).toBe("ADMIN");
  });

  it("won't let an admin lock themselves out", async () => {
    const me = (
      await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: adminCookie } })
    ).json().user;
    for (const payload of [{ disabled: true }, { role: "ORGANISER" }]) {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/team/${me.id}`,
        headers: { cookie: adminCookie },
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
    const del = await app.inject({
      method: "DELETE",
      url: `/api/team/${me.id}`,
      headers: { cookie: adminCookie },
    });
    expect(del.statusCode).toBe(400);
  });

  it("deletes an account and everything it owns", async () => {
    const cookie = cookieOf(await login(newcomer));
    await app.inject({
      method: "POST",
      url: "/api/quizzes",
      headers: { cookie },
      payload: { title: "Priya's quiz" },
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/team",
      headers: { cookie: adminCookie },
    });
    expect(list.json().members.find((m: { id: string }) => m.id === newcomerId).quizCount).toBe(1);
    const del = await app.inject({
      method: "DELETE",
      url: `/api/team/${newcomerId}`,
      headers: { cookie: adminCookie },
    });
    expect(del.statusCode).toBe(204);
    expect(await db.user.findUnique({ where: { id: newcomerId } })).toBeNull();
    expect(await db.quiz.count({ where: { ownerId: newcomerId } })).toBe(0);
  });
});
