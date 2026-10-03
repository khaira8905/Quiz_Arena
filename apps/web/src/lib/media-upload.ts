import type { ApiErrorBody } from "@quizarena/shared/errors";
import {
  MEDIA_ACCEPT,
  MEDIA_ACCEPT_LABEL,
  MEDIA_CLIENT_MAX_SIDE,
  MEDIA_CLIENT_TARGET_BYTES,
  MEDIA_MAX_BYTES,
  MEDIA_MIN_SIDE,
  type MediaAssetDto,
} from "@quizarena/shared/media";
import { ApiError } from "./api";

/** A friendly reason a file can't be used, or null when it can. Checked before uploading. */
export function checkImageFile(file: File): string | null {
  if (!(MEDIA_ACCEPT as readonly string[]).includes(file.type)) {
    return `“${file.name}” isn't a ${MEDIA_ACCEPT_LABEL} image.`;
  }
  // Big photos are shrunk in the browser first; this only stops absurd files early.
  if (file.size > 40 * 1024 * 1024)
    return `“${file.name}” is too large (max 40 MB before resizing).`;
  return null;
}

/**
 * Shrinks large photos in the browser before upload (long side ≤ 2560px, ≤ ~3 MB), so a
 * 12 MB phone photo uploads in a second on venue Wi-Fi. The server re-encodes everything
 * anyway; this only saves bandwidth. Small files are sent untouched.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`“${file.name}” couldn't be read as an image.`);
  }
  const { width, height } = bitmap;
  if (Math.min(width, height) < MEDIA_MIN_SIDE) {
    bitmap.close();
    throw new Error(
      `That image is too small (${width}×${height}). Use at least ${MEDIA_MIN_SIDE}px.`,
    );
  }
  const longest = Math.max(width, height);
  if (file.size <= MEDIA_CLIENT_TARGET_BYTES && longest <= MEDIA_CLIENT_MAX_SIDE) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, MEDIA_CLIENT_MAX_SIDE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  // Browsers without WebP encoding hand back PNG; fall back to JPEG for photos.
  if (blob && blob.type === "image/webp") return blob;
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!jpeg) throw new Error("Your browser couldn't prepare that image.");
  return jpeg;
}

export interface UploadHandle {
  promise: Promise<MediaAssetDto>;
  cancel: () => void;
}

/**
 * Uploads one image as multipart form data with progress (XHR: fetch can't report upload
 * progress). Same-origin through the /api proxy, so the session cookie goes along.
 */
export function uploadImage(
  blob: Blob,
  filename: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<MediaAssetDto>((resolve, reject) => {
    if (blob.size > MEDIA_MAX_BYTES) {
      reject(new ApiError(413, "FILE_TOO_LARGE", "That image is still over 8 MB after resizing."));
      return;
    }
    const form = new FormData();
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    form.append("file", blob, filename.replace(/\.[a-z0-9]+$/i, "") + "." + ext);
    xhr.open("POST", "/api/media");
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = xhr.response as ({ asset: MediaAssetDto } & Partial<ApiErrorBody>) | null;
      if (xhr.status === 201 && body?.asset) return resolve(body.asset);
      const err = body?.error;
      reject(
        new ApiError(
          xhr.status,
          err?.code ?? (xhr.status === 413 ? "FILE_TOO_LARGE" : "INTERNAL"),
          err?.message ??
            (xhr.status === 413
              ? "That image is too large."
              : "The upload didn't go through. Try again."),
          err?.details,
          !!err,
        ),
      );
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "INTERNAL", "Can't reach the server. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.send(form);
  });
  return { promise, cancel: () => xhr.abort() };
}

export const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
