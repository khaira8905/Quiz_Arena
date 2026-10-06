import { createHmac, timingSafeEqual } from "node:crypto";
import type { VideoMime } from "@quizarena/shared";
import { AppError } from "../lib/errors";

/**
 * What a file really is, from its first bytes: MP4/MOV-family files carry an `ftyp` box at
 * offset 4, WebM/Matroska files start with the EBML magic. The browser's claimed type and
 * the file name are never trusted.
 */
export function sniffVideo(head: Buffer): VideoMime | null {
  if (head.length >= 12 && head.subarray(4, 8).toString("latin1") === "ftyp") {
    // QuickTime (.mov) shares the box layout but many projector browsers can't play it.
    const brand = head.subarray(8, 12).toString("latin1");
    return brand === "qt  " ? null : "video/mp4";
  }
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
  return null;
}

export const videoExtension = (mime: VideoMime) => (mime === "video/webm" ? "webm" : "mp4");

/**
 * A video upload ticket: who may upload, to which key, what type and size. Signed with the
 * server secret and short-lived, so the upload needs no pending row in the database and a
 * ticket can't be reused for another account or a bigger file.
 */
export interface UploadTicket {
  owner: string;
  /** Storage key without extension: the video and its poster share it. */
  key: string;
  mime: VideoMime;
  bytes: number;
  name: string;
  exp: number;
}

const TICKET_TTL_MS = 30 * 60 * 1000;

function sign(body: string, secret: string) {
  return createHmac("sha256", `video-ticket:${secret}`).update(body).digest("base64url");
}

export function issueTicket(input: Omit<UploadTicket, "exp">, secret: string): string {
  const body = Buffer.from(JSON.stringify({ ...input, exp: Date.now() + TICKET_TTL_MS })).toString(
    "base64url",
  );
  return `${body}.${sign(body, secret)}`;
}

export function readTicket(ticket: string, owner: string, secret: string): UploadTicket {
  const [body, mac] = ticket.split(".");
  const expected = body ? sign(body, secret) : "";
  if (
    !body ||
    !mac ||
    mac.length !== expected.length ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    throw new AppError("BAD_REQUEST", "That upload link isn't valid. Try the upload again.");
  }
  const t = JSON.parse(Buffer.from(body, "base64url").toString()) as UploadTicket;
  if (t.owner !== owner) throw new AppError("FORBIDDEN");
  if (t.exp < Date.now()) {
    throw new AppError("BAD_REQUEST", "That upload took too long. Try it again.");
  }
  return t;
}
