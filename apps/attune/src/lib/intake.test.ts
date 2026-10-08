import { describe, expect, it } from "vitest";
import { readGoal, readIntake } from "./intake";

describe("readIntake", () => {
  it("picks up interests from casual text", () => {
    const r = readIntake("The auction drama in the cricket league honestly", "and some music");
    expect(r.interests).toEqual(["cricket", "music"]);
    expect(r.heard[0]).toBe("cricket");
  });

  it("matches whole words only", () => {
    expect(readIntake("I hate the gamey taste").interests).toEqual([]);
  });

  it("reports the word it heard when it isn't the frame name", () => {
    expect(readIntake("why can't you fold paper to the moon").heard[0]).toMatch(/space/);
  });
});

describe("readGoal", () => {
  it.each([
    ["I missed two weeks of class", "catch-up"],
    ["Revising for Friday's test", "test"],
    ["Logs worksheet, due Friday", "assignment"],
    ["nothing much", "open"],
  ] as const)("%s → %s", (text, kind) => {
    expect(readGoal(text).kind).toBe(kind);
  });
});
