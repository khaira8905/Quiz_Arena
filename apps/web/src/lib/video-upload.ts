import type { ApiErrorBody } from "@quizarena/shared/errors";
import {
  type MediaAssetDto,
  VIDEO_ACCEPT,
  VIDEO_ACCEPT_LABEL,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
  type VideoUploadTicketDto,
} from "@quizarena/shared/media";
import { api, ApiError } from "./api";
import { formatBytes } from "./media-upload";

/** A friendly reason a file can't be used, or null when it can. Checked before anything. */
export function checkVideoFile(file: File): string | null {
  if (!(VIDEO_ACCEPT as readonly string[]).includes(file.type)) {
    return `“${file.name}” isn't an ${VIDEO_ACCEPT_LABEL} video.`;
  }
  if (file.size > VIDEO_MAX_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}; videos can be up to ${formatBytes(VIDEO_MAX_BYTES)}. Trim or compress it first.`;
  }
  return null;
}

export interface ProbedVideo {
  durationMs: number;
  width: number;
  height: number;
  /** A still from early in the clip, for the poster. Null if the browser couldn't draw it. */
  poster: Blob | null;
}

/**
 * Decodes the start of a video in this browser: its real duration and size, and a poster
 * frame. A file the browser can't decode is refused here, because a projector browser
 * wouldn't play it either.
 */
export function probeVideo(source: File | string): Promise<ProbedVideo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
    if (typeof source === "string") video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      fn();
    };
    const timeout = setTimeout(
      () => finish(() => reject(new Error("That video took too long to open. Try another file."))),
      20_000,
    );
    video.onerror = () =>
      finish(() =>
        reject(
          new Error(
            `This browser can't play that video. Use ${VIDEO_ACCEPT_LABEL}; most phones and editors can export it.`,
          ),
        ),
      );
    video.onloadedmetadata = () => {
      const durationMs = Math.round(video.duration * 1000);
      if (!Number.isFinite(durationMs) || durationMs <= 0 || !video.videoWidth) {
        return finish(() => reject(new Error("That file has no playable video track.")));
      }
      if (durationMs > VIDEO_MAX_DURATION_MS) {
        return finish(() =>
          reject(
            new Error(
              `That video is ${Math.round(durationMs / 1000)}s long; question videos can be up to ${VIDEO_MAX_DURATION_MS / 60_000} minutes.`,
            ),
          ),
        );
      }
      // The poster: a frame from a moment in, not the (often black) very first one.
      video.currentTime = Math.min(1, video.duration * 0.1);
    };
    video.onseeked = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationMs = Math.round(video.duration * 1000);
      const scale = Math.min(1, 1920 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      try {
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (poster) => finish(() => resolve({ durationMs, width, height, poster })),
          "image/jpeg",
          0.88,
        );
      } catch {
        // A cross-origin video without CORS can't be drawn: no poster, but still usable.
        finish(() => resolve({ durationMs, width, height, poster: null }));
      }
    };
    video.src = objectUrl ?? (source as string);
  });
}

export type VideoUploadPhase = "checking" | "uploading" | "processing" | "done";

export interface VideoUploadHandle {
  promise: Promise<MediaAssetDto>;
  cancel: () => void;
}

/**
 * The three steps: ask the server where to send the file (a presigned bucket URL in
 * production), send it with real progress, then have the server check it and add it to the
 * library, and attach the poster frame captured while probing.
 */
export function uploadVideo(
  file: File,
  on: { progress: (fraction: number) => void; phase: (phase: VideoUploadPhase) => void },
): VideoUploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;
  const promise = (async () => {
    const problem = checkVideoFile(file);
    if (problem) throw new Error(problem);
    on.phase("checking");
    const probed = await probeVideo(file);
    if (cancelled) throw new DOMException("Upload cancelled", "AbortError");

    const { ticket, target } = await api<VideoUploadTicketDto>("/media/videos/uploads", {
      method: "POST",
      json: { name: file.name, mimeType: file.type, bytes: file.size },
    });
    on.phase("uploading");
    await new Promise<void>((resolve, reject) => {
      const req = new XMLHttpRequest();
      xhr = req;
      req.open(target.method, target.url);
      // Our own endpoint needs the session cookie; a bucket URL is signed and needs none.
      req.withCredentials = target.url.startsWith("/");
      for (const [k, v] of Object.entries(target.headers)) req.setRequestHeader(k, v);
      req.upload.onprogress = (e) => e.lengthComputable && on.progress(e.loaded / e.total);
      req.onload = () => {
        if (req.status >= 200 && req.status < 300) return resolve();
        let body: Partial<ApiErrorBody> | null = null;
        try {
          body = JSON.parse(req.responseText) as Partial<ApiErrorBody>;
        } catch {}
        reject(
          new ApiError(
            req.status,
            body?.error?.code ?? (req.status === 413 ? "FILE_TOO_LARGE" : "INTERNAL"),
            body?.error?.message ??
              (req.status === 403
                ? "The storage bucket refused the upload. Check its CORS settings (see the README)."
                : "The upload didn't go through. Try again."),
          ),
        );
      };
      req.onerror = () =>
        reject(
          new ApiError(
            0,
            "INTERNAL",
            target.url.startsWith("/")
              ? "Can't reach the server. Check your connection."
              : "Couldn't reach the storage bucket. If this keeps happening, its CORS rule may be missing (see the README).",
          ),
        );
      req.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
      req.send(file);
    });

    on.phase("processing");
    let { asset } = await api<{ asset: MediaAssetDto }>("/media/videos", {
      method: "POST",
      json: {
        ticket,
        durationMs: probed.durationMs,
        width: probed.width,
        height: probed.height,
      },
    });
    if (probed.poster) asset = await uploadPoster(asset.id, probed.poster).catch(() => asset);
    on.phase("done");
    return asset;
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      (xhr as XMLHttpRequest | null)?.abort();
    },
  };
}

/** Sends a poster frame for a library video (also used for Drive imports). */
export async function uploadPoster(assetId: string, poster: Blob): Promise<MediaAssetDto> {
  const form = new FormData();
  form.append("file", poster, "poster.jpg");
  const { asset } = await api<{ asset: MediaAssetDto }>(`/media/${assetId}/poster`, {
    method: "POST",
    body: form,
  });
  return asset;
}

/**
 * After a Drive import the file is already in storage: open it from there to capture a
 * poster. Works when the bucket allows cross-origin reads; otherwise the video simply has
 * no poster.
 */
export async function capturePosterFromUrl(asset: MediaAssetDto): Promise<MediaAssetDto> {
  try {
    const { poster } = await probeVideo(asset.url);
    return poster ? await uploadPoster(asset.id, poster) : asset;
  } catch {
    return asset;
  }
}

export const formatDuration = (ms: number | null) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
