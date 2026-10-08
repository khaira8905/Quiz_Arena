import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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
import { LocalStorage, S3Storage } from "../src/media/storage";
import { issueTicket, readTicket, sniffVideo } from "../src/media/video";

const hasDb = !!process.env.DATABASE_URL;
const SECRET = "test-secret-test-secret-test-secret-123";

/** Enough of an MP4 to be recognised: an `ftyp` box, then filler. */
const mp4 = (size = 4096) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from("ftypisom\0\0\x02\0isomiso2", "latin1"),
    randomBytes(size - 24),
  ]);
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), randomBytes(2000)]);

describe("video sniffing and tickets", () => {
  it("judges files by their bytes", () => {
    expect(sniffVideo(mp4())).toBe("video/mp4");
    expect(sniffVideo(webm())).toBe("video/webm");
    const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  ", "latin1")]);
    expect(sniffVideo(mov)).toBeNull();
    expect(sniffVideo(Buffer.from("#!/bin/sh\necho hi\n"))).toBeNull();
  });

  it("only honours untampered, unexpired tickets for their owner", () => {
    const t = issueTicket(
      { owner: "u1", key: "media/u1/abc123", mime: "video/mp4", bytes: 10, name: "Clip" },
      SECRET,
    );
    expect(readTicket(t, "u1", SECRET).key).toBe("media/u1/abc123");
    expect(() => readTicket(t, "u2", SECRET)).toThrow();
    const [body, mac] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), bytes: 9e9 }),
    ).toString("base64url");
    expect(() => readTicket(`${forged}.${mac}`, "u1", SECRET)).toThrow(/isn't valid/);
    expect(() => readTicket(t, "u1", "another-secret-another-secret-12345")).toThrow();
  });
});

describe("S3 video uploads", () => {
  const calls: Request[] = [];
  const s3 = new S3Storage(
    {
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "quiz-media",
      accessKeyId: "AKIA",
      secretAccessKey: "secret",
      publicUrl: "https://cdn.example.com",
    },
    (async (req: Request) => {
      calls.push(req);
      if (req.method === "HEAD")
        return new Response(null, { status: 200, headers: { "content-length": "4096" } });
      return new Response(mp4(64), { status: 206 });
    }) as typeof fetch,
  );

  it("presigns a short-lived PUT straight to the bucket", async () => {
    const up = await s3.directUpload("media/user123456/clip123456.mp4", "video/mp4");
    const url = new URL(up!.url);
    expect(url.origin + url.pathname).toBe(
      "https://acct.r2.cloudflarestorage.com/quiz-media/media/user123456/clip123456.mp4",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(up!.headers["content-type"]).toBe("video/mp4");
    await expect(s3.directUpload("media/../x.mp4", "video/mp4")).rejects.toThrow();
  });

  it("checks size and first bytes without downloading the file", async () => {
    expect(await s3.size("media/user123456/clip123456.mp4")).toBe(4096);
    const head = await s3.head("media/user123456/clip123456.mp4", 16);
    expect(sniffVideo(head)).toBe("video/mp4");
    const ranged = calls.find((c) => c.method === "GET")!;
    expect(ranged.headers.get("range")).toBe("bytes=0-15");
  });
});

describe.skipIf(!hasDb)("video library API", () => {
  let app: FastifyInstance;
  let db: Db;
  let dir: string;
  const suffix = randomBytes(4).toString("hex");
  const user = { email: `video-${suffix}@test.dev`, password: "correct horse battery" };
  const other = { email: `video-o-${suffix}@test.dev`, password: "correct horse battery" };
  let cookie = "";
  let otherCookie = "";

  const login = async (u: { email: string; password: string }) => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: u });
    return String(res.headers["set-cookie"]).split(";")[0]!;
  };
  const api = (
    method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
    url: string,
    payload?: unknown,
    c = cookie,
  ) => app.inject({ method, url, headers: { cookie: c }, payload: payload as never });

  /** The browser's three steps: ask, send the bytes, report what it decoded. */
  async function uploadVideo(data: Buffer, mimeType = "video/mp4", declared = data.length) {
    const ticket = await api("POST", "/api/media/videos/uploads", {
      name: "C:\\clips\\Big_Reveal.mp4",
      mimeType,
      bytes: declared,
    });
    expect(ticket.statusCode).toBe(200);
    const { target, ticket: t } = ticket.json();
    const put = await app.inject({
      method: "PUT",
      url: target.url,
      headers: { cookie, ...target.headers },
      payload: data,
    });
    if (put.statusCode !== 204) return { put, complete: null };
    const complete = await api("POST", "/api/media/videos", {
      ticket: t,
      durationMs: 12_345,
      width: 1280,
      height: 720,
    });
    return { put, complete };
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qa-video-"));
    const config = loadConfig({ ...process.env, JWT_SECRET: SECRET, NODE_ENV: "test" });
    db = createDb(config.DATABASE_URL);
    ({ app } = await buildApp(config, db, {
      persistence: new MemoryGamePersistence(),
      logger: false,
      media: { storage: new LocalStorage(dir), reason: null },
    }));
    const passwordHash = await hashPassword(user.password);
    await db.user.createMany({
      data: [
        { email: user.email, name: "Vid", passwordHash },
        { email: other.email, name: "Other", passwordHash },
      ],
    });
    cookie = await login(user);
    otherCookie = await login(other);
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { email: { in: [user.email, other.email] } } });
    await app?.close();
    await db?.$disconnect();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  let videoId = "";

  it("uploads, validates and serves a video with byte ranges", async () => {
    const data = mp4(50_000);
    const { put, complete } = await uploadVideo(data);
    expect(put.statusCode).toBe(204);
    expect(complete!.statusCode).toBe(201);
    const { asset } = complete!.json();
    expect(asset).toMatchObject({
      kind: "VIDEO",
      name: "Big Reveal",
      mimeType: "video/mp4",
      durationMs: 12_345,
      width: 1280,
      height: 720,
      bytes: 50_000,
      posterUrl: null,
    });
    expect(asset.url).toMatch(/^\/api\/media\/files\/media\/[a-z0-9]+\/[a-z0-9]+\.mp4$/);
    videoId = asset.id;

    const whole = await app.inject({ method: "GET", url: asset.url });
    expect(whole.headers["content-type"]).toBe("video/mp4");
    expect(whole.headers["accept-ranges"]).toBe("bytes");
    const part = await app.inject({
      method: "GET",
      url: asset.url,
      headers: { range: "bytes=100-199" },
    });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 100-199/50000");
    expect(part.rawPayload.equals(data.subarray(100, 200))).toBe(true);

    // A suffix range (players use it to find an MP4's index at the end of the file).
    const tail = await app.inject({
      method: "GET",
      url: asset.url,
      headers: { range: "bytes=-64" },
    });
    expect(tail.statusCode).toBe(206);
    expect(tail.headers["content-range"]).toBe("bytes 49936-49999/50000");
    expect(tail.rawPayload.equals(data.subarray(49_936))).toBe(true);

    // An open-ended range runs to the end; a range past the end is refused.
    const rest = await app.inject({
      method: "GET",
      url: asset.url,
      headers: { range: "bytes=49990-" },
    });
    expect(rest.headers["content-range"]).toBe("bytes 49990-49999/50000");
    const past = await app.inject({
      method: "GET",
      url: asset.url,
      headers: { range: "bytes=60000-60010" },
    });
    expect(past.statusCode).toBe(416);
    expect(past.headers["content-range"]).toBe("bytes */50000");
  });

  it("refuses non-videos, oversized bodies and other people's tickets", async () => {
    const before = (await readdir(dir, { recursive: true })).length;
    const fake = await uploadVideo(Buffer.from("#!/bin/sh\nrm -rf /\n".repeat(50)));
    expect(fake.complete!.statusCode).toBe(415);
    // A refused file doesn't stay in storage.
    expect((await readdir(dir, { recursive: true })).length).toBeLessThanOrEqual(before + 2);

    // More bytes than the ticket allows: the stream is cut off.
    const over = await uploadVideo(mp4(20_000), "video/mp4", 10_000);
    expect(over.put.statusCode).toBe(413);

    const ticket = (
      await api("POST", "/api/media/videos/uploads", {
        name: "x.mp4",
        mimeType: "video/mp4",
        bytes: 100,
      })
    ).json().ticket;
    const stolen = await api(
      "POST",
      "/api/media/videos",
      { ticket, durationMs: 1000, width: 640, height: 360 },
      otherCookie,
    );
    expect(stolen.statusCode).toBe(403);

    const tooLong = await api("POST", "/api/media/videos/uploads", {
      name: "film.mov",
      mimeType: "video/quicktime",
      bytes: 100,
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it("stores a poster frame through the image pipeline", async () => {
    const frame = await sharp({
      create: { width: 1280, height: 720, channels: 3, background: "#204080" },
    })
      .jpeg()
      .toBuffer();
    const boundary = "----qa-poster";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="poster.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      frame,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/api/media/${videoId}/poster`,
      headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const { asset } = res.json();
    expect(asset.posterUrl).toMatch(/\.webp\?v=/);
    expect(asset.placeholder).toMatch(/^data:image\/webp/);
    expect(asset.bytes).toBeGreaterThan(50_000);
    const poster = await app.inject({ method: "GET", url: asset.posterUrl.split("?")[0] });
    expect(poster.headers["content-type"]).toBe("image/webp");
  });

  it("filters the library by kind", async () => {
    const videos = (await api("GET", "/api/media?kind=video")).json().assets;
    expect(videos.map((a: { id: string }) => a.id)).toEqual([videoId]);
    const images = (await api("GET", "/api/media?kind=image")).json().assets;
    expect(images.some((a: { id: string }) => a.id === videoId)).toBe(false);
  });

  it("attaches a video to a question instead of an image, and back", async () => {
    const quiz = (await api("POST", "/api/quizzes", { title: "Video quiz" })).json().quiz;
    const qid = quiz.questions[0].id;
    await api("PATCH", `/api/questions/${qid}`, { imageUrl: "https://example.com/a.png" });

    const withVideo = await api("PATCH", `/api/questions/${qid}`, { videoAssetId: videoId });
    expect(withVideo.statusCode).toBe(200);
    expect(withVideo.json().question).toMatchObject({
      videoAssetId: videoId,
      imageUrl: null,
      video: { durationMs: 12_345 },
    });
    expect(withVideo.json().question.video.posterUrl).toMatch(/\.webp/);

    // A video can't be used as an image, nor someone else's video at all.
    expect(
      (await api("PATCH", `/api/questions/${qid}`, { imageAssetId: videoId })).statusCode,
    ).toBe(404);
    const theirs = await api("POST", "/api/quizzes", { title: "Theirs" }, otherCookie);
    const theirQ = theirs.json().quiz.questions[0].id;
    expect(
      (await api("PATCH", `/api/questions/${theirQ}`, { videoAssetId: videoId }, otherCookie))
        .statusCode,
    ).toBe(404);

    // Usage is counted; deleting needs force and detaches it.
    const listed = (await api("GET", "/api/media?kind=video")).json().assets[0];
    expect(listed.usageCount).toBe(1);
    expect((await api("DELETE", `/api/media/${videoId}`)).statusCode).toBe(409);

    // Choosing an image again removes the video.
    const back = await api("PATCH", `/api/questions/${qid}`, {
      imageUrl: "https://example.com/b.png",
    });
    expect(back.json().question).toMatchObject({ videoAssetId: null, video: null });

    await api("PATCH", `/api/questions/${qid}`, { videoAssetId: videoId });
    expect((await api("DELETE", `/api/media/${videoId}?force=1`)).statusCode).toBe(204);
    const after = (await api("GET", `/api/quizzes/${quiz.id}`)).json().quiz.questions[0];
    expect(after.videoAssetId).toBeNull();
  });
});
