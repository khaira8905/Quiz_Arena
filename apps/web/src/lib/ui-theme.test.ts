import { ARENA_THEMES, THEME_TOKENS, otherTheme } from "@quizarena/shared/appearance";
import { describe, expect, it } from "vitest";
import { UI_THEMES, uiThemeBootScript, uiThemeCss } from "./ui-theme";

describe("two themes, one switch", () => {
  it("has exactly night (black + orange) and day (white + blue)", () => {
    expect([...UI_THEMES]).toEqual(["BLACK", "WHITE"]);
    expect(THEME_TOKENS.BLACK.scheme).toBe("dark");
    expect(THEME_TOKENS.WHITE.scheme).toBe("light");
  });

  it("the day/night switch always lands on the other theme", () => {
    for (const t of ARENA_THEMES) {
      expect(otherTheme(t)).not.toBe(t);
      expect(otherTheme(otherTheme(t))).toBe(t);
    }
  });

  it("emits one complete CSS rule per theme, including the 3D lighting tokens", () => {
    const css = uiThemeCss();
    const rules = css.split("\n");
    expect(rules).toHaveLength(2);
    for (const [i, theme] of UI_THEMES.entries()) {
      const rule = rules[i]!;
      expect(rule).toContain(`html[data-ui-theme="${theme}"]`);
      for (const token of [
        "--arena-bg",
        "--arena-surface",
        "--arena-surface-2",
        "--arena-text",
        "--arena-muted",
        "--arena-border",
        "--arena-accent",
        "--arena-accent-soft",
        "--arena-shadow",
        "--arena-3d-light",
        "--arena-3d-shadow",
      ])
        expect(rule).toContain(`${token}:`);
      expect(rule).toContain(`color-scheme:${THEME_TOKENS[theme].scheme}`);
    }
  });

  it("boots into a known theme before first paint", () => {
    const run = (stored: string | null, prefersLight: boolean) => {
      const attrs: Record<string, string> = {};
      const fn = new Function("document", "localStorage", "matchMedia", uiThemeBootScript) as (
        ...a: unknown[]
      ) => void;
      fn(
        {
          documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
          querySelector: () => ({ setAttribute: (_: string, v: string) => (attrs.color = v) }),
        },
        { getItem: () => stored },
        () => ({ matches: prefersLight }),
      );
      return attrs["data-ui-theme"];
    };
    expect(run("WHITE", false)).toBe("WHITE");
    expect(run("BLACK", true)).toBe("BLACK");
    // First visit follows the system; the retired Blue theme falls back the same way.
    expect(run(null, true)).toBe("WHITE");
    expect(run(null, false)).toBe("BLACK");
    expect(run("BLUE", false)).toBe("BLACK");
  });

  it("points the browser toolbar colour at the chosen theme before first paint", () => {
    const attrs: Record<string, string> = {};
    new Function("document", "localStorage", "matchMedia", uiThemeBootScript)(
      {
        documentElement: { setAttribute: () => {} },
        querySelector: () => ({ setAttribute: (_: string, v: string) => (attrs.color = v) }),
      },
      { getItem: () => "WHITE" },
      () => ({ matches: false }),
    );
    expect(attrs.color).toBe(THEME_TOKENS.WHITE.bg);
  });
});
