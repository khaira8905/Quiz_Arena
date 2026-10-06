import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { VIDEO_ACCEPT, VIDEO_DRIVE_MAX_BYTES, type VideoMime } from "@quizarena/shared";
import { AppError } from "./errors";

/**
 * Google Drive image picking, server side. The organiser grants read-only Drive access
 * through Google's OAuth consent screen; the refresh token is stored encrypted and never
 * reaches the browser. Listing, thumbnails and downloads all go through this server.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const VIDEO_TYPES = VIDEO_ACCEPT;
/** Drive photos are often large; they're resized after download, so allow more than uploads. */
export const DRIVE_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
/** Thumbnails come from Google's image CDN only. */
const THUMBNAIL_HOST = /(^|\.)googleusercontent\.com$/;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  width: number | null;
  height: number | null;
  /** Videos: length as Drive measured it (null while Drive is still processing it). */
  durationMs: number | null;
  modifiedTime: string | null;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/* ------------------------------------------------------------------ token encryption */

/** AES-256-GCM with a key derived from the server secret (HKDF), so tokens at rest are useless alone. */
export class TokenCipher {
  private key: Buffer;
  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync("sha256", secret, "quizarena", "google-refresh-token", 32));
  }
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
  }
  decrypt(sealed: string): string | null {
    try {
      const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv!);
      decipher.setAuthTag(tag!);
      return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ client */

export class GoogleDriveClient {
  /** Access tokens last an hour; cache per refresh token to avoid a token call per request. */
  private cache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    readonly config: GoogleConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      // Always ask, so Google returns a refresh token even on a reconnect.
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_URL}?${params}`;
  }

  private async post(url: string, body: Record<string, string>) {
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, json };
  }

  /** Authorization code → tokens + the account's email. */
  async exchange(code: string) {
    const { ok, json } = await this.post(TOKEN_URL, {
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
    });
    if (!ok || typeof json.access_token !== "string") {
      throw new AppError("BAD_REQUEST", "Google didn't accept the sign-in. Try connecting again.");
    }
    const scope = String(json.scope ?? "");
    if (!scope.includes("drive.readonly")) {
      throw new AppError(
        "BAD_REQUEST",
        "Drive access wasn't granted. Connect again and allow access to your Drive files.",
      );
    }
    if (typeof json.refresh_token !== "string") {
      throw new AppError("BAD_REQUEST", "Google didn't return offline access. Connect again.");
    }
    const info = await this.fetchImpl(USERINFO_URL, {
      headers: { authorization: `Bearer ${json.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const user = (await info.json().catch(() => ({}))) as { email?: string };
    return {
      refreshToken: json.refresh_token,
      accessToken: json.access_token,
      expiresIn: Number(json.expires_in ?? 3600),
      scope,
      email: user.email ?? "Google account",
    };
  }

  async accessToken(refreshToken: string): Promise<string> {
    const hit = this.cache.get(refreshToken);
    if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
    const { ok, json } = await this.post(TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
    });
    if (!ok || typeof json.access_token !== "string") {
      // Revoked in the Google account, or expired (Testing-mode apps expire after 7 days).
      this.cache.delete(refreshToken);
      throw new AppError("GOOGLE_NOT_CONNECTED", "Google Drive access expired. Connect again.");
    }
    this.cache.set(refreshToken, {
      token: json.access_token,
      expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
    });
    return json.access_token;
  }

  private async drive(token: string, url: string) {
    const res = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401)
      throw new AppError("GOOGLE_NOT_CONNECTED", "Google Drive access expired. Connect again.");
    if (res.status === 404)
      throw new AppError("NOT_FOUND", "That file isn't in your Drive (or was deleted).");
    if (!res.ok)
      throw new AppError("BAD_REQUEST", `Google Drive returned an error (${res.status}).`);
    return res;
  }

  /** Images in the organiser's Drive (PNG/JPG/WEBP), newest first, optionally by name. */
  async listImages(
    token: string,
    opts: { q?: string; pageToken?: string; kind?: "image" | "video" } = {},
  ) {
    const types = opts.kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;
    const clauses = ["trashed = false", `(${types.map((t) => `mimeType = '${t}'`).join(" or ")})`];
    if (opts.q)
      clauses.push(`name contains '${opts.q.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
    const params = new URLSearchParams({
      q: clauses.join(" and "),
      pageSize: "40",
      orderBy: "modifiedTime desc",
      fields:
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });
    if (opts.pageToken) params.set("pageToken", opts.pageToken);
    const res = await this.drive(token, `${FILES_URL}?${params}`);
    const body = (await res.json()) as {
      nextPageToken?: string;
      files?: {
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime?: string;
        imageMediaMetadata?: { width?: number; height?: number };
        videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
      }[];
    };
    return {
      nextPageToken: body.nextPageToken ?? null,
      files: (body.files ?? []).map((f): DriveFile => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? Number(f.size) : null,
        width: f.imageMediaMetadata?.width ?? f.videoMediaMetadata?.width ?? null,
        height: f.imageMediaMetadata?.height ?? f.videoMediaMetadata?.height ?? null,
        durationMs: f.videoMediaMetadata?.durationMillis
          ? Number(f.videoMediaMetadata.durationMillis)
          : null,
        modifiedTime: f.modifiedTime ?? null,
      })),
    };
  }

  private async meta(token: string, fileId: string) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new AppError("NOT_FOUND");
    const res = await this.drive(
      token,
      `${FILES_URL}/${fileId}?fields=id,name,mimeType,size,thumbnailLink,videoMediaMetadata(width,height,durationMillis)&supportsAllDrives=true`,
    );
    return (await res.json()) as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      thumbnailLink?: string;
      videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
    };
  }

  /** A small preview for the picker grid, fetched by the server (the link needs the token). */
  async thumbnail(token: string, fileId: string): Promise<{ body: Buffer; type: string } | null> {
    const meta = await this.meta(token, fileId);
    if (!meta.thumbnailLink) return null;
    const url = new URL(meta.thumbnailLink);
    if (url.protocol !== "https:" || !THUMBNAIL_HOST.test(url.hostname)) return null;
    // Ask for a ~320px rendition (Drive thumbnail links end in =s220 by default).
    url.pathname = url.pathname.replace(/=s\d+$/, "=s320");
    const res = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const body = Buffer.from(await res.arrayBuffer());
    return body.length > 2 * 1024 * 1024 ? null : { body, type };
  }

  /** Downloads one image for import, refusing other file types and oversized files. */
  async download(token: string, fileId: string): Promise<{ name: string; body: Buffer }> {
    const meta = await this.meta(token, fileId);
    if (!(IMAGE_TYPES as readonly string[]).includes(meta.mimeType)) {
      throw new AppError("UNSUPPORTED_MEDIA");
    }
    if (meta.size && Number(meta.size) > DRIVE_IMPORT_MAX_BYTES) {
      throw new AppError("FILE_TOO_LARGE", "That Drive image is over 25 MB.");
    }
    const res = await this.drive(token, `${FILES_URL}/${fileId}?alt=media&supportsAllDrives=true`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > DRIVE_IMPORT_MAX_BYTES) {
      throw new AppError("FILE_TOO_LARGE", "That Drive image is over 25 MB.");
    }
    return { name: meta.name, body };
  }

  /**
   * Downloads one video for import (MP4 or WebM, at most 40 MB: it passes through this
   * server's memory). Duration and size come from Drive's own processing of the file.
   */
  async downloadVideo(token: string, fileId: string) {
    const meta = await this.meta(token, fileId);
    if (!(VIDEO_TYPES as readonly string[]).includes(meta.mimeType)) {
      throw new AppError("UNSUPPORTED_MEDIA", "Only MP4 and WebM videos can be imported.");
    }
    const tooBig = `That Drive video is over ${VIDEO_DRIVE_MAX_BYTES / 1024 / 1024} MB. Download it and upload it from your computer instead.`;
    if (meta.size && Number(meta.size) > VIDEO_DRIVE_MAX_BYTES) {
      throw new AppError("FILE_TOO_LARGE", tooBig);
    }
    const v = meta.videoMediaMetadata;
    if (!v?.width || !v.height || !v.durationMillis) {
      throw new AppError(
        "BAD_REQUEST",
        "Google Drive is still processing that video. Try again in a minute.",
      );
    }
    const res = await this.drive(token, `${FILES_URL}/${fileId}?alt=media&supportsAllDrives=true`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > VIDEO_DRIVE_MAX_BYTES) throw new AppError("FILE_TOO_LARGE", tooBig);
    return {
      name: meta.name,
      body,
      mime: meta.mimeType as VideoMime,
      width: v.width,
      height: v.height,
      durationMs: Number(v.durationMillis),
    };
  }

  async revoke(refreshToken: string) {
    this.cache.delete(refreshToken);
    await this.post(REVOKE_URL, { token: refreshToken }).catch(() => {});
  }
}
