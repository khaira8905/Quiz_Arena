import { CONCEPTS, type ConceptId, type LearnerEvent } from "@attune/engine";
import { catalogEntry } from "./activity-catalog";
import type { CloudProgress } from "./cloud";

/**
 * Progress, computed only from what actually happened: events on this device, or the rows the
 * database derived from the same events. Both paths produce the same shape, and the tests check
 * that they agree on the same history. Nothing here is estimated or simulated.
 */

export interface ConceptProgress {
  conceptId: ConceptId;
  attempts: number;
  correct: number;
  /** Share of first tries that were right; null with no first tries yet. */
  firstTryRate: number | null;
}

export interface ProgressView {
  source: "account" | "device";
  sessions: number;
  activeDays: number;
  activitiesCompleted: number;
  attempts: number;
  firstTries: number;
  firstTryRate: number | null;
  retries: number;
  /** Of the retries, how many got it right. */
  retrySuccessRate: number | null;
  hintsUsed: number;
  minutesSpent: number;
  /** Exact time, for "under a minute" rather than a misleading zero. */
  timeSpentMs: number;
  feedback: { kind: string; value: string; count: number }[];
  concepts: ConceptProgress[];
}

interface Attempt {
  conceptId: string;
  correct: boolean;
  attempt: number;
  usedHint: boolean;
}

function summarise(
  source: ProgressView["source"],
  sessions: number,
  activeDays: number,
  attempts: Attempt[],
  completedActivities: Set<string>,
  timeMs: number,
  feedback: { kind: string; value: string }[],
): ProgressView {
  const first = attempts.filter((a) => a.attempt <= 1);
  const retries = attempts.filter((a) => a.attempt > 1);
  const rate = (n: number, d: number) => (d === 0 ? null : n / d);
  const counts = new Map<string, { kind: string; value: string; count: number }>();
  for (const f of feedback) {
    const key = `${f.kind}|${f.value}`;
    const c = counts.get(key);
    if (c) c.count += 1;
    else counts.set(key, { kind: f.kind, value: f.value, count: 1 });
  }
  return {
    source,
    sessions,
    activeDays,
    activitiesCompleted: completedActivities.size,
    attempts: attempts.length,
    firstTries: first.length,
    firstTryRate: rate(first.filter((a) => a.correct).length, first.length),
    retries: retries.length,
    retrySuccessRate: rate(retries.filter((a) => a.correct).length, retries.length),
    hintsUsed: attempts.filter((a) => a.usedHint).length,
    minutesSpent: Math.round(timeMs / 60_000),
    timeSpentMs: timeMs,
    feedback: [...counts.values()].sort((a, b) => b.count - a.count),
    concepts: CONCEPTS.map((conceptId) => {
      const mine = attempts.filter((a) => a.conceptId === conceptId);
      const firstMine = mine.filter((a) => a.attempt <= 1);
      return {
        conceptId,
        attempts: mine.length,
        correct: mine.filter((a) => a.correct).length,
        firstTryRate: rate(firstMine.filter((a) => a.correct).length, firstMine.length),
      };
    }),
  };
}

/** From this device's event log (one or more sessions). Mirrors the database's derivation. */
export function progressFromEvents(
  sessions: { events: LearnerEvent[]; day: number }[],
): ProgressView {
  const attempts: Attempt[] = [];
  const completed = new Set<string>();
  const feedback: { kind: string; value: string }[] = [];
  let timeMs = 0;
  for (const s of sessions) {
    for (const e of s.events) {
      const known = "activityId" in e && catalogEntry(e.activityId) !== undefined;
      if (e.type === "answer" && known) {
        attempts.push({
          conceptId: e.conceptId,
          correct: e.correct,
          attempt: Math.max(1, e.attempt ?? 1),
          usedHint: e.usedHint,
        });
      } else if (e.type === "activity_completed" && known) {
        completed.add(e.activityId);
        timeMs += Math.max(0, e.dwellMs);
      } else if (e.type === "activity_abandoned" && known) {
        timeMs += Math.max(0, e.dwellMs);
      } else if (e.type === "control") feedback.push({ kind: "control", value: e.action });
      else if (e.type === "reaction") feedback.push({ kind: "reaction", value: e.reaction });
      else if (e.type === "choice") feedback.push({ kind: "choice", value: e.choice });
      else if (e.type === "reflection") feedback.push({ kind: "reflection", value: "rating" });
      else if (e.type === "checkin" && e.partial) feedback.push({ kind: "mood", value: e.feeling });
    }
  }
  const days = new Set(sessions.filter((s) => s.events.length > 0).map((s) => s.day));
  return summarise("device", sessions.length, days.size, attempts, completed, timeMs, feedback);
}

/** From the account: rows the database derived from the same events. */
export function progressFromCloud(p: CloudProgress): ProgressView {
  const completed = new Set(p.activities.filter((a) => a.completions > 0).map((a) => a.activityId));
  const timeMs = p.activities.reduce((sum, a) => sum + a.timeSpentMs, 0);
  return summarise(
    "account",
    p.sessions.length,
    new Set(p.sessions.map((s) => s.day)).size,
    p.attempts,
    completed,
    timeMs,
    p.feedback,
  );
}
