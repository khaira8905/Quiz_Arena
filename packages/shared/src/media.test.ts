import { describe, expect, it } from "vitest";
import { mediaNameFromFile, mediaRenameSchema, mediaSrcSet } from "./media";

describe("media helpers", () => {
  it("turns a file name into a label without trusting it as a path", () => {
    expect(mediaNameFromFile("../../etc/passwd")).toBe("passwd");
    expect(mediaNameFromFile("C:\\Users\\me\\Eiffel_tower.JPG")).toBe("Eiffel tower");
    expect(mediaNameFromFile("")).toBe("Image");
    // Videos without a usable name are labelled as videos, not images.
    expect(mediaNameFromFile("", "Video")).toBe("Video");
    expect(mediaNameFromFile(".mp4", "Video")).toBe("Video");
    expect(mediaNameFromFile("C:\\clips\\Big_Reveal.webm", "Video")).toBe("Big Reveal");
    expect(mediaNameFromFile("x".repeat(300) + ".png")).toHaveLength(120);
  });

  it("strips control characters from renames and rejects empty names", () => {
    expect(mediaRenameSchema.parse({ name: " Map\u0000 " }).name).toBe("Map");
    expect(mediaRenameSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("builds a srcset from the renditions", () => {
    expect(
      mediaSrcSet({
        url: "/full.webp",
        width: 2400,
        variants: { "960": "/m.webp", "480": "/s.webp" },
      }),
    ).toBe("/s.webp 480w, /m.webp 960w, /full.webp 1920w");
  });
});

describe("partial updates", async () => {
  const { questionUpdateSchema, quizUpdateSchema } = await import("./schemas");
  it("leave unsent question fields alone", () => {
    expect(questionUpdateSchema.parse({ text: "Hi" })).toEqual({ text: "Hi" });
  });
  it("leave unsent quiz settings alone", () => {
    expect(quizUpdateSchema.parse({ title: "Pub quiz" })).toEqual({ title: "Pub quiz" });
    expect(quizUpdateSchema.parse({ defaultTimerSec: 30 })).toEqual({ defaultTimerSec: 30 });
  });
});
