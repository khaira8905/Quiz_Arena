import { describe, expect, it } from "vitest";
import type { LearnerEvent } from "@attune/engine";
import {
  acknowledge,
  chunk,
  deriveSyncStatus,
  enqueue,
  forSync,
  groupBySession,
  retryDelayMs,
  toEventRow,
  type OutboxItem,
} from "./sync";

const base = {
  browserOnline: true,
  probeFailed: false,
  phase: "idle",
  pending: 0,
  everSynced: false,
} as const;

const item = (sessionId: string, n: number): OutboxItem => ({
  sessionId,
  day: 1,
  sessionStartedAt: 0,
  event: { id: `${sessionId}:${n}`, at: n, type: "hint", activityId: "q-d1-a" },
});

describe("sync status machine", () => {
  it("prefers what the network says over what the loop is doing", () => {
    expect(deriveSyncStatus({ ...base, browserOnline: false, phase: "syncing" })).toBe("offline");
    expect(deriveSyncStatus({ ...base, probeFailed: true, pending: 3 })).toBe("reconnecting");
  });

  it("walks online → syncing → synced, and shows failures", () => {
    expect(deriveSyncStatus(base)).toBe("online");
    expect(deriveSyncStatus({ ...base, pending: 2 })).toBe("syncing");
    expect(deriveSyncStatus({ ...base, phase: "syncing", pending: 2 })).toBe("syncing");
    expect(deriveSyncStatus({ ...base, everSynced: true })).toBe("synced");
    expect(deriveSyncStatus({ ...base, phase: "failed", pending: 2 })).toBe("failed");
  });

  it("backs off exponentially and caps", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([
      0, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
});

describe("outbox", () => {
  it("never queues an event twice and acknowledges by id", () => {
    let box = enqueue([], [item("a", 1), item("a", 2)]);
    box = enqueue(box, [item("a", 2), item("a", 3), item("a", 3)]);
    expect(box.map((i) => i.event.id)).toEqual(["a:1", "a:2", "a:3"]);
    expect(acknowledge(box, ["a:1", "a:3", "zzz"]).map((i) => i.event.id)).toEqual(["a:2"]);
  });

  it("groups by session in order and chunks batches", () => {
    const groups = groupBySession([item("a", 1), item("b", 1), item("a", 2)]);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")!.map((i) => i.event.id)).toEqual(["a:1", "a:2"]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("strips reflection notes before anything leaves the device", () => {
    const e: LearnerEvent = { id: "s:1", at: 0, type: "reflection", usefulness: 3, note: "secret" };
    expect(forSync(e)).toEqual({ id: "s:1", at: 0, type: "reflection", usefulness: 3 });
    const row = toEventRow(e);
    expect(row.payload).toEqual({ usefulness: 3 });
    expect(JSON.stringify(row)).not.toContain("secret");
  });

  it("maps an answer to the row the database derives attempts from", () => {
    const row = toEventRow({
      id: "s:4",
      at: Date.UTC(2026, 9, 8),
      type: "answer",
      activityId: "q-d3-b",
      conceptId: "logs",
      difficulty: 3,
      correct: true,
      latencyMs: 4000,
      usedHint: false,
      attempt: 2,
    });
    expect(row).toEqual({
      client_event_id: "s:4",
      type: "answer",
      occurred_at: "2026-10-08T00:00:00.000Z",
      payload: {
        activityId: "q-d3-b",
        conceptId: "logs",
        difficulty: 3,
        correct: true,
        latencyMs: 4000,
        usedHint: false,
        attempt: 2,
      },
    });
  });
});
