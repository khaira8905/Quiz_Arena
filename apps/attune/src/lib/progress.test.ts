import { describe, expect, it } from "vitest";
import type { LearnerEvent } from "@attune/engine";
import { progressFromCloud, progressFromEvents } from "./progress";

const at = Date.UTC(2026, 9, 8);
const events: LearnerEvent[] = [
  { id: "s:0", at, type: "checkin", feeling: "okay", energy: 3, timeBudgetMin: 20, partial: false },
  { id: "s:1", at, type: "activity_started", activityId: "q-d3-b", kind: "CONTINUE" },
  {
    id: "s:2",
    at,
    type: "answer",
    activityId: "q-d3-b",
    conceptId: "logs",
    difficulty: 3,
    correct: false,
    latencyMs: 4000,
    usedHint: false,
    attempt: 1,
  },
  {
    id: "s:3",
    at,
    type: "answer",
    activityId: "q-d3-b",
    conceptId: "logs",
    difficulty: 3,
    correct: true,
    latencyMs: 6000,
    usedHint: true,
    attempt: 2,
  },
  { id: "s:4", at, type: "activity_completed", activityId: "q-d3-b", dwellMs: 120_000, score: 0.5 },
  { id: "s:5", at, type: "control", action: "TOO_EASY" },
  { id: "s:6", at, type: "checkin", feeling: "bored", energy: 3, timeBudgetMin: 20, partial: true },
  // Not in the catalogue (a generated id): ignored, exactly as the database ignores it.
  {
    id: "s:7",
    at,
    type: "answer",
    activityId: "not-a-real-activity",
    conceptId: "logs",
    difficulty: 3,
    correct: true,
    latencyMs: 1,
    usedHint: false,
  },
];

describe("progress from real events", () => {
  it("counts attempts, retries, completions, time and feedback", () => {
    const p = progressFromEvents([{ events, day: 1 }]);
    expect(p).toMatchObject({
      source: "device",
      sessions: 1,
      activeDays: 1,
      activitiesCompleted: 1,
      attempts: 2,
      firstTries: 1,
      firstTryRate: 0,
      retries: 1,
      retrySuccessRate: 1,
      hintsUsed: 1,
      minutesSpent: 2,
    });
    expect(p.feedback).toEqual([
      { kind: "control", value: "TOO_EASY", count: 1 },
      { kind: "mood", value: "bored", count: 1 },
    ]);
    expect(p.concepts.find((c) => c.conceptId === "logs")).toEqual({
      conceptId: "logs",
      attempts: 2,
      correct: 1,
      firstTryRate: 0,
    });
  });

  it("says nothing rather than inventing a rate when there's no data", () => {
    const p = progressFromEvents([]);
    expect(p.firstTryRate).toBeNull();
    expect(p.retrySuccessRate).toBeNull();
    expect(p.attempts).toBe(0);
  });

  it("agrees with the account's database-derived rows for the same history", () => {
    // These rows are what `derive_from_event` produces for `events` (see the pgTAP test).
    const cloud = progressFromCloud({
      sessions: [{ day: 1, startedAt: new Date(at).toISOString(), endedAt: null }],
      attempts: [
        {
          activityId: "q-d3-b",
          conceptId: "logs",
          correct: false,
          attempt: 1,
          usedHint: false,
          at: "",
        },
        {
          activityId: "q-d3-b",
          conceptId: "logs",
          correct: true,
          attempt: 2,
          usedHint: true,
          at: "",
        },
      ],
      activities: [
        {
          activityId: "q-d3-b",
          status: "completed",
          completions: 1,
          bestScore: 0.5,
          timeSpentMs: 120_000,
        },
      ],
      feedback: [
        { kind: "control", value: "TOO_EASY", at: "" },
        { kind: "mood", value: "bored", at: "" },
      ],
    });
    const local = progressFromEvents([{ events, day: 1 }]);
    expect({ ...cloud, source: "device" }).toEqual(local);
  });
});
