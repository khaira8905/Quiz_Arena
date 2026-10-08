import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createDb, type Db } from "../src/db";
import { MemoryGamePersistence } from "../src/game/persistence";
import { hashPassword } from "../src/lib/auth";
import { GoogleDriveClient, TokenCipher } from "../src/lib/google-drive";
import { LocalStorage } from "../src/media/storage";

const hasDb = !!process.env.DATABASE_URL;
const CONFIG = {
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3000/api/google/callback",
};

describe("token encryption", () => {
  it("round-trips, and refuses tampered or foreign ciphertext", () => {
    const a = new TokenCipher("a".repeat(40));
    const sealed = a.encrypt("1//refresh-token");
    expect(sealed).not.toContain("refresh");
    expect(a.decrypt(sealed)).toBe("1//refresh-token");
    expect(new TokenCipher("b".repeat(40)).decrypt(sealed)).toBeNull();
    const parts = sealed.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(a.decrypt(parts.join("."))).toBeNull();
  });
});

describe("Google consent URL", () => {
  it("asks for read-only Drive access, offline, with our state", () => {
    const url = new URL(new GoogleDriveClient(CONFIG).authUrl("STATE"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/drive.readonly",
    );
    expect(url.searchParams.get("scope")).not.toMatch(/auth\/drive(\s|$)/);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("STATE");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });
});

describe("Drive video import", () => {
  /** A minimal Drive that serves one file's metadata and bytes. */
  const drive = (meta: Record<string, unknown>, bytes = Buffer.from("video-bytes")) => {
    const calls: string[] = [];
    const impl = (async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input : input.url,
      );
      calls.push(url.search);
      if (url.searchParams.get("alt") === "media") return new Response(bytes);
      if (url.pathname === "/drive/v3/files")
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: "file_1234567890", ...meta }), { status: 200 });
    }) as typeof fetch;
    return { client: new GoogleDriveClient(CONFIG, impl), calls };
  };
  const video = {
    name: "Reveal.mp4",
    mimeType: "video/mp4",
    size: "4096",
    videoMediaMetadata: { width: 1920, height: 1080, durationMillis: "12500" },
  };

  it("downloads a video with Drive's own duration and size", async () => {
    const { client } = drive(video);
    const got = await client.downloadVideo("token", "file_1234567890");
    expect(got).toMatchObject({
      name: "Reveal.mp4",
      mime: "video/mp4",
      width: 1920,
      height: 1080,
      durationMs: 12_500,
    });
    expect(got.body.toString()).toBe("video-bytes");
  });

  it("refuses other file types, oversized files and videos Drive is still processing", async () => {
    await expect(
      drive({ ...video, mimeType: "video/quicktime" }).client.downloadVideo("t", "file_1234567890"),
    ).rejects.toThrow(/Only MP4 and WebM/);
    await expect(
      drive({ ...video, size: String(41 * 1024 * 1024) }).client.downloadVideo(
        "t",
        "file_1234567890",
      ),
    ).rejects.toThrow(/over 40 MB/);
    await expect(
      drive({ ...video, videoMediaMetadata: undefined }).client.downloadVideo(
        "t",
        "file_1234567890",
      ),
    ).rejects.toThrow(/still processing/);
  });

  it("lists only MP4 and WebM files when asked for videos", async () => {
    const { client, calls } = drive(video);
    await client.listImages("token", { kind: "video" });
    const q = new URLSearchParams(calls[0]).get("q")!;
    expect(q).toContain("mimeType = 'video/mp4'");
    expect(q).toContain("mimeType = 'video/webm'");
    expect(q).not.toContain("image/");
  });
});

/** A fake Google: token, userinfo, Drive files, thumbnails and downloads. */
function fakeGoogle() {
  const log: { url: string; method: string; body?: string }[] = [];
  let grants = 0;
  const state = {
    refreshOk: true,
    files: new Map<string, { name: string; mimeType: string; thumb?: string; data?: Buffer }>(),
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    const body = init?.body ? String(init.body) : undefined;
    log.push({ url: url.toString(), method: init?.method ?? "GET", body });
    if (url.href === "https://oauth2.googleapis.com/token") {
      const p = new URLSearchParams(body);
      if (p.get("grant_type") === "authorization_code") {
        return p.get("code") === "good-code"
          ? json({
              access_token: "at-1",
              refresh_token: `1//refresh-${++grants}`,
              expires_in: 3600,
              scope: "openid email https://www.googleapis.com/auth/drive.readonly",
            })
          : json({ error: "invalid_grant" }, 400);
      }
      return state.refreshOk
        ? json({ access_token: "at-2", expires_in: 3600 })
        : json({ error: "invalid_grant" }, 400);
    }
    if (url.href === "https://oauth2.googleapis.com/revoke")
      return new Response(null, { status: 200 });
    if (url.href.startsWith("https://openidconnect.googleapis.com/v1/userinfo"))
      return json({ email: "organiser@gmail.com" });
    if (url.pathname === "/drive/v3/files") {
      return json({
        files: [...state.files].map(([id, f]) => ({
          id,
          name: f.name,
          mimeType: f.mimeType,
          size: "1000",
        })),
      });
    }
    const m = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m) {
      const f = state.files.get(m[1]!);
      if (!f) return json({ error: { code: 404 } }, 404);
      if (url.searchParams.get("alt") === "media") return new Response(f.data ?? Buffer.alloc(0));
      return json({
        id: m[1],
        name: f.name,
        mimeType: f.mimeType,
        size: String(f.data?.length ?? 10),
        thumbnailLink: f.thumb,
      });
    }
    if (url.hostname.endsWith("googleusercontent.com"))
      return new Response(Buffer.from("thumb"), { headers: { "content-type": "image/jpeg" } });
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { impl, log, state };
}

describe.skipIf(!hasDb)("Google Drive import API", () => {
  let app: FastifyInstance;
  let db: Db;
  let dir: string;
  const google = fakeGoogle();
  const suffix = randomBytes(4).toString("hex");
  const alice = { email: `drive-a-${suffix}@test.dev`, password: "correct horse battery" };
  const bob = { email: `drive-b-${suffix}@test.dev`, password: "correct horse battery" };
  let aliceCookie = "";
  let bobCookie = "";
  let aliceId = "";
  const cipher = new TokenCipher("test-secret-test-secret-test-secret-123");

  const login = async (u: { email: string; password: string }) => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: u });
    return String(res.headers["set-cookie"]).split(";")[0]!;
  };
  /** Runs connect → callback like the popup would; returns the callback's HTML. */
  const connect = async (cookie: string, opts: { code?: string; stateFrom?: string } = {}) => {
    const start = await app.inject({
      method: "GET",
      url: "/api/google/connect",
      headers: { cookie },
    });
    expect(start.statusCode).toBe(302);
    const location = new URL(String(start.headers.location));
    const nonceCookie = String(start.headers["set-cookie"]).split(";")[0]!;
    let state = location.searchParams.get("state")!;
    if (opts.stateFrom) {
      const other = await app.inject({
        method: "GET",
        url: "/api/google/connect",
        headers: { cookie: opts.stateFrom },
      });
      state = new URL(String(other.headers.location)).searchParams.get("state")!;
    }
    const cb = await app.inject({
      method: "GET",
      url: `/api/google/callback?code=${opts.code ?? "good-code"}&state=${encodeURIComponent(state)}`,
      headers: { cookie: `${cookie}; ${nonceCookie}` },
    });
    return cb.body;
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qa-drive-"));
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
      google: { client: new GoogleDriveClient(CONFIG, google.impl), cipher },
    }));
    const passwordHash = await hashPassword(alice.password);
    await db.user.createMany({
      data: [
        { email: alice.email, name: "Alice", passwordHash },
        { email: bob.email, name: "Bob", passwordHash },
      ],
    });
    aliceId = (await db.user.findUniqueOrThrow({ where: { email: alice.email } })).id;
    aliceCookie = await login(alice);
    bobCookie = await login(bob);
  });

  beforeEach(() => {
    google.state.refreshOk = true;
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { email: { in: [alice.email, bob.email] } } });
    await app?.close();
    await db?.$disconnect();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("requires a signed-in organiser to start", async () => {
    const res = await app.inject({ method: "GET", url: "/api/google/connect" });
    expect(res.statusCode).toBe(401);
  });

  it("refuses a callback whose state belongs to someone else", async () => {
    const html = await connect(aliceCookie, { stateFrom: bobCookie });
    expect(html).toContain('"ok":false');
    expect(await db.googleAccount.findUnique({ where: { userId: aliceId } })).toBeNull();
  });

  it("refuses a callback without this browser's nonce cookie", async () => {
    const start = await app.inject({
      method: "GET",
      url: "/api/google/connect",
      headers: { cookie: aliceCookie },
    });
    const state = new URL(String(start.headers.location)).searchParams.get("state")!;
    const cb = await app.inject({
      method: "GET",
      url: `/api/google/callback?code=good-code&state=${encodeURIComponent(state)}`,
      headers: { cookie: aliceCookie },
    });
    expect(cb.body).toContain('"ok":false');
    expect(await db.googleAccount.findUnique({ where: { userId: aliceId } })).toBeNull();
  });

  it("connects, storing the refresh token encrypted", async () => {
    const html = await connect(aliceCookie);
    expect(html).toContain('"ok":true');
    expect(html).toContain("window.opener.postMessage");
    const account = await db.googleAccount.findUniqueOrThrow({ where: { userId: aliceId } });
    expect(account.email).toBe("organiser@gmail.com");
    expect(account.refreshToken).not.toContain("1//refresh");
    expect(cipher.decrypt(account.refreshToken)).toMatch(/^1\/\/refresh-\d+$/);
    const status = await app.inject({
      method: "GET",
      url: "/api/google/status",
      headers: { cookie: aliceCookie },
    });
    expect(status.json()).toEqual({
      configured: true,
      connected: true,
      email: "organiser@gmail.com",
    });
    // The token itself never appears in any response.
    expect(status.body).not.toContain("refresh");
  });

  it("lists only images, escaping the search", async () => {
    google.state.files.set("file_png_123456", { name: "Map.png", mimeType: "image/png" });
    const res = await app.inject({
      method: "GET",
      url: `/api/google/files?q=${encodeURIComponent("it's")}`,
      headers: { cookie: aliceCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().files[0]).toMatchObject({ id: "file_png_123456", name: "Map.png" });
    const call = google.log.findLast((c) => c.url.includes("/drive/v3/files?"))!;
    const q = new URL(call.url).searchParams.get("q")!;
    expect(q).toContain("mimeType = 'image/png'");
    expect(q).toContain("trashed = false");
    expect(q).toContain("name contains 'it\\'s'");
    // Bob hasn't connected Drive.
    const bobRes = await app.inject({
      method: "GET",
      url: "/api/google/files",
      headers: { cookie: bobCookie },
    });
    expect(bobRes.statusCode).toBe(409);
    expect(bobRes.json().error.code).toBe("GOOGLE_NOT_CONNECTED");
  });

  it("proxies thumbnails from Google's image CDN only", async () => {
    google.state.files.set("file_thumb_ok1", {
      name: "a.jpg",
      mimeType: "image/jpeg",
      thumb: "https://lh3.googleusercontent.com/abc=s220",
    });
    google.state.files.set("file_thumb_bad", {
      name: "b.jpg",
      mimeType: "image/jpeg",
      thumb: "https://169.254.169.254/latest/meta-data=s220",
    });
    const ok = await app.inject({
      method: "GET",
      url: "/api/google/thumbnail/file_thumb_ok1",
      headers: { cookie: aliceCookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/jpeg");
    expect(google.log.some((c) => c.url === "https://lh3.googleusercontent.com/abc=s320")).toBe(
      true,
    );
    const bad = await app.inject({
      method: "GET",
      url: "/api/google/thumbnail/file_thumb_bad",
      headers: { cookie: aliceCookie },
    });
    expect(bad.statusCode).toBe(404);
    expect(google.log.some((c) => c.url.includes("169.254"))).toBe(false);
  });

  it("imports a Drive image into the media library, optimized", async () => {
    const data = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#0a0" },
    })
      .jpeg()
      .toBuffer();
    google.state.files.set("file_photo_001", {
      name: "Team photo.jpg",
      mimeType: "image/jpeg",
      data,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/google/import",
      headers: { cookie: aliceCookie },
      payload: { fileId: "file_photo_001" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().asset).toMatchObject({
      name: "Team photo",
      source: "GOOGLE_DRIVE",
      width: 640,
      height: 480,
    });

    google.state.files.set("file_pdf_00001", { name: "notes.pdf", mimeType: "application/pdf" });
    const pdf = await app.inject({
      method: "POST",
      url: "/api/google/import",
      headers: { cookie: aliceCookie },
      payload: { fileId: "file_pdf_00001" },
    });
    expect(pdf.statusCode).toBe(415);
  });

  it("forgets a grant Google no longer honours", async () => {
    // A new grant (nothing cached for it), then Google refuses to refresh it.
    await connect(aliceCookie);
    google.state.refreshOk = false;
    const res = await app.inject({
      method: "GET",
      url: "/api/google/files",
      headers: { cookie: aliceCookie },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("GOOGLE_NOT_CONNECTED");
    expect(await db.googleAccount.findUnique({ where: { userId: aliceId } })).toBeNull();
  });

  it("disconnects and revokes", async () => {
    await connect(aliceCookie);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/google/connection",
      headers: { cookie: aliceCookie },
    });
    expect(res.statusCode).toBe(204);
    expect(await db.googleAccount.findUnique({ where: { userId: aliceId } })).toBeNull();
    expect(google.log.some((c) => c.url === "https://oauth2.googleapis.com/revoke")).toBe(true);
  });
});

describe("Google Drive not configured", () => {
  it("is reported as unavailable instead of pretending", async () => {
    if (!hasDb) return;
    const config = loadConfig({
      ...process.env,
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      NODE_ENV: "test",
    });
    const db = createDb(config.DATABASE_URL);
    const { app } = await buildApp(config, db, {
      persistence: new MemoryGamePersistence(),
      logger: false,
      google: null,
    });
    const email = `drive-off-${randomBytes(4).toString("hex")}@test.dev`;
    await db.user.create({
      data: { email, name: "Off", passwordHash: await hashPassword("correct horse battery") },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "correct horse battery" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const status = await app.inject({
      method: "GET",
      url: "/api/google/status",
      headers: { cookie },
    });
    expect(status.json()).toEqual({ configured: false, connected: false, email: null });
    const start = await app.inject({
      method: "GET",
      url: "/api/google/connect",
      headers: { cookie },
    });
    expect(start.statusCode).toBe(503);
    await db.user.delete({ where: { email } });
    await app.close();
    await db.$disconnect();
  });
});
