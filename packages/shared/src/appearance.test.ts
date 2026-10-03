import { describe, expect, it } from "vitest";
import {
  ARENA_THEMES,
  DEFAULT_APPEARANCE,
  THEME_TOKENS,
  arenaAppearanceSchema,
  arenaCssVariables,
  resolveAppearance,
  resolveArenaColors,
} from "./appearance";
import { contrastRatio, inkFor } from "./color";

describe("built-in themes", () => {
  it.each(ARENA_THEMES)("%s meets WCAG AA for text and answer tiles", (name) => {
    const t = THEME_TOKENS[name];
    for (const bg of [t.bg, t.surface, t.elevated]) {
      expect(contrastRatio(t.text, bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
    for (const a of t.answers) expect(contrastRatio(a, inkFor(a))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ARENA_THEMES)("%s status colours are readable as small text", (name) => {
    const t = THEME_TOKENS[name];
    // Badges draw status text on a ~16% tint of itself over the surface.
    const tint = (fg: string, bg: string) => {
      const [a, b] = [fg, bg].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
      return `#${a!
        .map((v, i) =>
          Math.round(v * 0.16 + b![i]! * 0.84)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    };
    for (const status of [t.success, t.warning, t.danger]) {
      for (const bg of [t.bg, t.surface]) {
        expect(contrastRatio(status, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(status, tint(status, bg))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("every theme passes its own validation", () => {
    for (const theme of ARENA_THEMES) {
      const c = resolveArenaColors({ ...DEFAULT_APPEARANCE, theme });
      expect(
        arenaAppearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, theme, answerColors: c.answers })
          .success,
      ).toBe(true);
    }
  });
});

describe("appearance validation", () => {
  it("rejects an accent that disappears into the theme background", () => {
    const r = arenaAppearanceSchema.safeParse({ theme: "WHITE", accent: "#f0f0f0" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["accent"]);
    expect(arenaAppearanceSchema.safeParse({ theme: "BLACK", accent: "#f0f0f0" }).success).toBe(
      true,
    );
  });

  it("rejects indistinguishable answer colours", () => {
    const r = arenaAppearanceSchema.safeParse({
      answerColors: ["#ff0000", "#fe0505", "#00aa00", "#0000ff"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed colours and requires an image for IMAGE backgrounds", () => {
    expect(arenaAppearanceSchema.safeParse({ accent: "red" }).success).toBe(false);
    expect(arenaAppearanceSchema.safeParse({ background: "IMAGE" }).success).toBe(false);
    expect(
      arenaAppearanceSchema.safeParse({
        background: "IMAGE",
        backgroundImageUrl: "https://x.dev/a.jpg",
      }).success,
    ).toBe(true);
  });

  it("falls back to defaults for missing or corrupt stored values", () => {
    expect(resolveAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance({ theme: "BLUE" }).theme).toBe("BLUE");
    expect(resolveAppearance({ theme: "PINK" })).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("css variables", () => {
  it("emits semantic tokens, inks and public aliases", () => {
    const vars = arenaCssVariables({ ...DEFAULT_APPEARANCE, theme: "WHITE", accent: "#2443ff" });
    expect(vars["--background"]).toBe(THEME_TOKENS.WHITE.bg);
    expect(vars["--accent-ink"]).toBe("#ffffff");
    expect(vars["--arena-accent"]).toBe("#2443ff");
    expect(vars["--answer-ink-3"]).toBe("#0a0b0f");
  });
});
