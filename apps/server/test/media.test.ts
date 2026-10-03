import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createDb, type Db } from "../src/db";
import { MemoryGamePersistence } from "../src/game/persistence";
import { hashPassword } from "../src/lib/auth";
import { createStorage, LocalStorage, S3Storage } from "../src/media/storage";

const hasDb = !!process.env.DATABASE_URL;
const BOUNDARY = "----qa-test-boundary";

/** A multipart/form-data body with one file part, as a browser would send it. */
function multipart(filename: string, type: string, data: Buffer) {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#3366ff" } })
    .png()
    .toBuffer();

describe("media storage selection", () => {
  const base = { DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40) };
  it("never falls back to the disk in production", () => {
    const c = createStorage(
      loadConfig({ ...base, NODE_ENV: "production", JWT_SECRET: "p".repeat(40) }),
    );
    expect(c.storage).toBeNull();
    expect(c.reason).toMatch(/S3_/);
  });
  it("names the missing S3 settings", () => {
    const c = createStorage(loadConfig({ ...base, MEDIA_STORAGE: "s3", S3_BUCKET: "quiz" }));
    expect(c.storage).toBeNull();
    expect(c.reason).toMatch(/S3_ENDPOINT/);
    expect(c.reason).not.toMatch(/S3_BUCKET/);
  });
  it("uses the disk in development", () => {
    expect(createStorage(loadConfig(base)).storage?.driver).toBe("local");
  });
});

describe("S3-compatible storage", () => {
  it("signs a path-style PUT and returns the public URL", async () => {
    const calls: Request[] = [];
    const s3 = new S3Storage(
      {
        endpoint: "https://acct.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "quiz-media",
        accessKeyId: "AKIA",
        secretAccessKey: "secret",
        publicUrl: "https://cdn.example.com/",
      },
      (async (req: Request) => {
        calls.push(req);
        return new Response(null, { status: 200 });
      }) as typeof fetch,
    );
    const url = await s3.put("media/user123456/asset123456.webp", Buffer.from("x"), "image/webp");
    expect(url).toBe("https://cdn.example.com/media/user123456/asset123456.webp");
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe(
      "https://acct.r2.cloudflarestorage.com/quiz-media/media/user123456/asset123456.webp",
    );
    expect(calls[0]!.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(calls[0]!.headers.get("cache-control")).toMatch(/immutable/);
    // Keys come from the server only; anything else is refused before any request.
    await expect(s3.put("../escape.webp", Buffer.from("x"), "image/webp")).rejects.toThrow();
  });
});

describe.skipIf(!hasDb)("media library API", () => {
  let app: FastifyInstance;
  let db: Db;
  let dir: string;
  const suffix = randomBytes(4).toString("hex");
  const alice = { email: `media-a-${suffix}@test.dev`, password: "correct horse battery" };
  const bob = { email: `media-b-${suffix}@test.dev`, password: "correct horse battery" };
  let aliceCookie = "";
  let bobCookie = "";

  const login = async (u: { email: string; password: string }) => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: u });
    return String(res.headers["set-cookie"]).split(";")[0]!;
  };
  const upload = (cookie: string, filename: string, type: string, data: Buffer) => {
    const body = multipart(filename, type, data);
    return app.inject({
      method: "POST",
      url: "/api/media",
      headers: { cookie, ...body.headers },
      payload: body.payload,
    });
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qa-media-"));
    const config = loadConfig({
      ...process.env,
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      NODE_ENV: "test",
    });
    db = createDb(config.DATABASE_URL);
    ({ app } = await buildApp(config, db, {
      persistence: new MemoryGamePersistence(),
      logger: false,
      media: { storage: new LocalStorage(dir), reason: null },
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
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("optimizes an upload into WebP renditions and serves them", async () => {
    const res = await upload(
      aliceCookie,
      "../../Eiffel_tower.png",
      "image/png",
      await png(1200, 800),
    );
    expect(res.statusCode).toBe(201);
    const { asset } = res.json();
    expect(asset).toMatchObject({ name: "Eiffel tower", width: 1200, height: 800, usageCount: 0 });
    expect(Object.keys(asset.variants).sort()).toEqual(["480", "960"]);
    expect(asset.placeholder).toMatch(/^data:image\/webp;base64,/);
    expect(asset.placeholder.length).toBeLessThan(1500);
    expect(asset.url).toMatch(/^\/api\/media\/files\/media\/[a-z0-9]+\/[a-z0-9]+\.webp$/);

    const file = await app.inject({ method: "GET", url: asset.url });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/webp");
    expect(file.headers["cache-control"]).toMatch(/immutable/);
    expect((await sharp(file.rawPayload).metadata()).format).toBe("webp");
  });

  it("caps the stored size and applies EXIF rotation", async () => {
    const big = await upload(aliceCookie, "big.png", "image/png", await png(3000, 1000));
    expect(big.json().asset).toMatchObject({ width: 1920, height: 640 });

    const sideways = await sharp({
      create: { width: 400, height: 200, channels: 3, background: "#ff0000" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const rotated = await upload(aliceCookie, "phone.jpg", "image/jpeg", sideways);
    expect(rotated.statusCode).toBe(201);
    expect(rotated.json().asset).toMatchObject({ width: 200, height: 400 });
  });

  it("refuses anything that isn't a real PNG, JPG or WEBP", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>');
    expect((await upload(aliceCookie, "x.svg", "image/svg+xml", svg)).statusCode).toBe(415);
    const gif = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#000" },
    })
      .gif()
      .toBuffer();
    expect((await upload(aliceCookie, "x.gif", "image/gif", gif)).statusCode).toBe(415);
    // A script renamed to .png is judged by its bytes, not its name.
    const fake = Buffer.from("#!/bin/sh\nrm -rf /\n");
    expect((await upload(aliceCookie, "evil.png", "image/png", fake)).statusCode).toBe(415);
    const tiny = await upload(aliceCookie, "tiny.png", "image/png", await png(20, 20));
    expect(tiny.statusCode).toBe(415);
    expect(tiny.json().error.message).toMatch(/too small/);
  });

  it("refuses files over the size limit", async () => {
    const huge = Buffer.concat([await png(100, 100), randomBytes(9 * 1024 * 1024)]);
    const res = await upload(aliceCookie, "huge.png", "image/png", huge);
    expect(res.statusCode).toBe(413);
  });

  it("keeps each organiser's library private", async () => {
    const mine = (await upload(aliceCookie, "private.png", "image/png", await png(300, 300))).json()
      .asset;
    const bobList = await app.inject({
      method: "GET",
      url: "/api/media",
      headers: { cookie: bobCookie },
    });
    expect(bobList.json().assets.map((a: { id: string }) => a.id)).not.toContain(mine.id);
    for (const req of [
      { method: "PATCH" as const, payload: { name: "mine now" } },
      { method: "DELETE" as const },
    ]) {
      const res = await app.inject({
        ...req,
        url: `/api/media/${mine.id}`,
        headers: { cookie: bobCookie },
      });
      expect(res.statusCode).toBe(404);
    }
    const search = await app.inject({
      method: "GET",
      url: "/api/media?q=PRIV",
      headers: { cookie: aliceCookie },
    });
    expect(search.json().assets.map((a: { id: string }) => a.id)).toEqual([mine.id]);
    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/media/${mine.id}`,
      headers: { cookie: aliceCookie },
      payload: { name: "  Team photo  " },
    });
    expect(renamed.json().asset.name).toBe("Team photo");
  });

  it("attaches library images to questions and tracks their use", async () => {
    const asset = (await upload(aliceCookie, "map.png", "image/png", await png(800, 600))).json()
      .asset;
    const quiz = (
      await app.inject({
        method: "POST",
        url: "/api/quizzes",
        headers: { cookie: aliceCookie },
        payload: { title: "Media quiz" },
      })
    ).json().quiz;
    const qid = quiz.questions[0].id;
    const patch = (payload: object, cookie = aliceCookie) =>
      app.inject({ method: "PATCH", url: `/api/questions/${qid}`, headers: { cookie }, payload });

    // Bob can't attach Alice's image to anything.
    expect((await patch({ imageAssetId: asset.id }, bobCookie)).statusCode).toBe(404);

    const attached = await patch({
      imageAssetId: asset.id,
      imageFit: "COVER",
      imagePosition: "TOP",
    });
    expect(attached.json().question).toMatchObject({
      imageAssetId: asset.id,
      imageUrl: asset.url,
      imageFit: "COVER",
      imagePosition: "TOP",
    });
    // Editing other fields leaves the image (and everything else unsent) alone.
    const edited = await patch({ text: "Where is this?" });
    expect(edited.json().question).toMatchObject({
      text: "Where is this?",
      imageAssetId: asset.id,
      imageFit: "COVER",
    });

    const listed = await app.inject({
      method: "GET",
      url: "/api/media",
      headers: { cookie: aliceCookie },
    });
    expect(listed.json().assets.find((a: { id: string }) => a.id === asset.id).usageCount).toBe(1);

    // Deleting an image in use needs confirmation, then clears it from the question.
    const refused = await app.inject({
      method: "DELETE",
      url: `/api/media/${asset.id}`,
      headers: { cookie: aliceCookie },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.details).toEqual({ usageCount: 1 });
    const file = path.join(dir, asset.url.replace("/api/media/files/", ""));
    expect(existsSync(file)).toBe(true);
    const forced = await app.inject({
      method: "DELETE",
      url: `/api/media/${asset.id}?force=1`,
      headers: { cookie: aliceCookie },
    });
    expect(forced.statusCode).toBe(204);
    expect(existsSync(file)).toBe(false);
    const q = await db.question.findUniqueOrThrow({ where: { id: qid } });
    expect(q).toMatchObject({ imageAssetId: null, imageUrl: null, text: "Where is this?" });

    // External links still work, and replace a library image.
    const linked = await patch({ imageUrl: "https://example.com/a.png" });
    expect(linked.json().question).toMatchObject({
      imageUrl: "https://example.com/a.png",
      imageAssetId: null,
    });
  });

  it("serves only server-generated keys", async () => {
    for (const url of [
      "/api/media/files/../../etc/passwd",
      "/api/media/files/media/abc/..%2F..%2Fsecret.webp",
      "/api/media/files/media/abcdefgh/abcdefgh.png",
    ]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
  });
});

describe.skipIf(!hasDb)("media without storage", () => {
  it("explains that uploads are off and refuses them", async () => {
    const config = loadConfig({
      ...process.env,
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      NODE_ENV: "test",
    });
    const db = createDb(config.DATABASE_URL);
    const { app } = await buildApp(config, db, {
      persistence: new MemoryGamePersistence(),
      logger: false,
      media: { storage: null, reason: "Uploads need object storage." },
    });
    const email = `media-off-${randomBytes(4).toString("hex")}@test.dev`;
    await db.user.create({
      data: { email, name: "Off", passwordHash: await hashPassword("correct horse battery") },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "correct horse battery" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const cfg = await app.inject({ method: "GET", url: "/api/media/config", headers: { cookie } });
    expect(cfg.json()).toMatchObject({
      enabled: false,
      driver: "none",
      reason: "Uploads need object storage.",
    });
    const body = multipart("a.png", "image/png", await png(100, 100));
    const res = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { cookie, ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("MEDIA_UNAVAILABLE");
    await db.user.delete({ where: { email } });
    await app.close();
    await db.$disconnect();
  });
});
