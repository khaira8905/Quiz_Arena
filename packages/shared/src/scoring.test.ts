import { describe, expect, it } from "vitest";
import { computePoints } from "./scoring";

const base = { correct: true, responseMs: 0, durationMs: 20_000, basePoints: 1000, streak: 1 };

describe("computePoints", () => {
  it("awards nothing for a wrong answer", () => {
    expect(computePoints({ ...base, correct: false }, { mode: "SPEED", streakBonus: true })).toBe(
      0,
    );
  });

  it("awards nothing on a zero-point question", () => {
    expect(computePoints({ ...base, basePoints: 0 }, { mode: "SPEED", streakBonus: true })).toBe(0);
  });

  it("gives full points for an instant correct answer in speed mode", () => {
    expect(computePoints(base, { mode: "SPEED", streakBonus: false })).toBe(1000);
  });

  it("decays linearly to the floor at the buzzer", () => {
    const cfg = { mode: "SPEED" as const, streakBonus: false };
    expect(computePoints({ ...base, responseMs: 10_000 }, cfg)).toBe(750);
    expect(computePoints({ ...base, responseMs: 20_000 }, cfg)).toBe(500);
  });

  it("clamps response times outside the window", () => {
    const cfg = { mode: "SPEED" as const, streakBonus: false };
    expect(computePoints({ ...base, responseMs: 99_000 }, cfg)).toBe(500);
    expect(computePoints({ ...base, responseMs: -50 }, cfg)).toBe(1000);
  });

  it("ignores speed in accuracy mode", () => {
    expect(
      computePoints({ ...base, responseMs: 19_000 }, { mode: "ACCURACY", streakBonus: false }),
    ).toBe(1000);
  });

  it("adds a capped streak bonus", () => {
    const cfg = { mode: "ACCURACY" as const, streakBonus: true };
    expect(computePoints({ ...base, streak: 1 }, cfg)).toBe(1000);
    expect(computePoints({ ...base, streak: 3 }, cfg)).toBe(1100);
    expect(computePoints({ ...base, streak: 50 }, cfg)).toBe(1250);
  });
});
