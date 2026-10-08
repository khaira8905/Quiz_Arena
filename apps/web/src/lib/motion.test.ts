import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DUR, EASE, stagger } from "./motion";

const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
const cssVar = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();

describe("motion tokens", () => {
  it("JS durations match the CSS motion variables", () => {
    for (const [name, seconds] of Object.entries(DUR)) {
      expect(cssVar(`motion-${name}`), name).toBe(`${Math.round(seconds * 1000)}ms`);
    }
  });

  it("JS curves match the CSS easing variables", () => {
    const pairs = {
      out: "ease-out",
      emphasis: "ease-emphasis",
      inOut: "ease-in-out",
      snap: "ease-snap",
    };
    for (const [name, variable] of Object.entries(pairs)) {
      expect(cssVar(variable), name).toBe(
        `cubic-bezier(${EASE[name as keyof typeof EASE].join(", ")})`,
      );
    }
  });

  it("caps staggers so long lists don't take forever", () => {
    expect(stagger(0)).toBe(0);
    expect(stagger(3)).toBeCloseTo(0.15);
    expect(stagger(50)).toBe(stagger(10));
    expect(stagger(50, 0.1, 4)).toBeCloseTo(0.4);
  });
});
