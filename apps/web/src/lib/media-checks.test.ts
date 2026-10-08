import { VIDEO_MAX_BYTES } from "@quizarena/shared/media";
import { describe, expect, it } from "vitest";
import { checkImageFile, formatBytes } from "./media-upload";
import { checkVideoFile, formatDuration } from "./video-upload";

/** Only name, type and size are read before upload; no need for real bytes. */
const file = (name: string, type: string, size: number) => ({ name, type, size }) as File;

describe("pre-upload checks", () => {
  it("accepts PNG, JPG and WEBP images and refuses the rest with a reason", () => {
    expect(checkImageFile(file("a.png", "image/png", 1000))).toBeNull();
    expect(checkImageFile(file("a.webp", "image/webp", 1000))).toBeNull();
    expect(checkImageFile(file("a.gif", "image/gif", 1000))).toMatch(/isn't a PNG, JPG or WEBP/);
    expect(checkImageFile(file("huge.jpg", "image/jpeg", 41 * 1024 * 1024))).toMatch(/too large/);
  });

  it("accepts MP4 and WebM videos up to the limit", () => {
    expect(checkVideoFile(file("clip.mp4", "video/mp4", 5_000_000))).toBeNull();
    expect(checkVideoFile(file("clip.webm", "video/webm", VIDEO_MAX_BYTES))).toBeNull();
    expect(checkVideoFile(file("clip.mov", "video/quicktime", 1000))).toMatch(
      /isn't an MP4 \(H\.264\) or WebM video/,
    );
    expect(checkVideoFile(file("film.mp4", "video/mp4", VIDEO_MAX_BYTES + 1))).toMatch(
      /videos can be up to 100 MB/,
    );
  });
});

describe("sizes and lengths", () => {
  it("formats byte counts the way the library shows them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(41_000)).toBe("40 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatBytes(48 * 1024 * 1024)).toBe("48 MB");
  });

  it("formats video lengths as m:ss", () => {
    expect(formatDuration(6003)).toBe("0:06");
    expect(formatDuration(75_400)).toBe("1:15");
    expect(formatDuration(300_000)).toBe("5:00");
    expect(formatDuration(null)).toBe("");
  });
});
