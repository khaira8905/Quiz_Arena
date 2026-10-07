import { describe, expect, it } from "vitest";
import { tensionFor, urgencyFor } from "./use-countdown";

describe("countdown tension", () => {
  it("escalates through calm, 10s, 5s, 3s, 2s, 1s and zero", () => {
    expect([30, 11, 10, 6, 5, 4, 3, 2, 1, 0].map((s) => tensionFor(s, true))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 4, 5, 6,
    ]);
  });

  it("stays calm while the clock isn't running (paused, reading, locked)", () => {
    for (const s of [10, 3, 1, 0]) {
      expect(tensionFor(s, false)).toBe(0);
      expect(urgencyFor(s, false)).toBe(0);
    }
  });

  it("never runs ahead of the colour urgency", () => {
    // Motion may start earlier (at 10s) but every urgent colour step has motion to match.
    for (let s = 0; s <= 30; s++) {
      const u = urgencyFor(s, true);
      const t = tensionFor(s, true);
      if (u >= 1) expect(t).toBeGreaterThanOrEqual(2);
      if (u === 4) expect(t).toBe(6);
    }
  });
});
