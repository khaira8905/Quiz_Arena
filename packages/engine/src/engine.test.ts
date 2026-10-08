import { describe, expect, it } from "vitest";
import {
  createLearner,
  createRng,
  dispatch,
  endSession,
  growthMoments,
  learnerEventSchema,
  learnerPatterns,
  nextDay,
  readState,
  SCENARIOS,
  scenarioById,
  sessionMetrics,
  simulateActivity,
  simulateCohort,
  startSession,
  syncBatchSchema,
  type CheckinInput,
  type LearnerEventInput,
  type LearnerModel,
  type SessionState,
} from "./index";

const T0 = Date.UTC(2026, 9, 8, 17, 0);

function begin(learner: LearnerModel, checkin: Partial<CheckinInput> = {}): SessionState {
  return startSession({
    id: "test",
    learner,
    checkin: { feeling: "okay", energy: 3, timeBudgetMin: 20, partial: false, ...checkin },
    now: T0,
  });
}

function neutralLearner(overrides: Partial<Parameters<typeof createLearner>[0]> = {}) {
  return createLearner({
    id: "l",
    displayName: "Test",
    goal: "Logs",
    goalConcept: "logs",
    ...overrides,
  });
}

/** Answer every part of the current activity correctly and quickly, then complete it. */
function solveCurrent(state: SessionState, at: number, correct = true): SessionState {
  const d = state.current!;
  const a = d.activity;
  const answer = (difficulty: number): LearnerEventInput => ({
    type: "answer",
    activityId: a.id,
    conceptId: a.conceptId,
    difficulty,
    correct,
    latencyMs: correct ? 2500 : 30000,
    usedHint: false,
  });
  let s = state;
  const parts =
    a.type === "challenge"
      ? a.parts.length
      : a.type === "guided"
        ? a.steps.length
        : a.type === "question" || a.type === "micro" || a.type === "mission"
          ? 1
          : 0;
  const difficulty = d.difficulty ?? 2;
  for (let i = 0; i < parts; i++) s = dispatch(s, answer(difficulty), (at += 3000));
  return dispatch(
    s,
    { type: "activity_completed", activityId: a.id, dwellMs: 20000, score: correct ? 1 : 0 },
    (at += 1000),
  );
}

describe("Engagement State Engine", () => {
  it("reads a self-reported state when there's no behaviour yet", () => {
    const s = begin(neutralLearner(), { feeling: "bored" });
    expect(s.decisions[0]!.reading.primary).toBe("BORED");
  });

  it("returns a probability distribution with evidence", () => {
    const s = begin(neutralLearner(), { feeling: "overwhelmed", energy: 2 });
    const reading = s.decisions[0]!.reading;
    const total = reading.distribution.reduce((sum, d) => sum + d.p, 0);
    expect(total).toBeCloseTo(1, 3);
    expect(reading.evidence.length).toBeGreaterThan(0);
    expect(reading.engagementIndex).toBeLessThan(50);
  });

  it("detects under-challenge from fast correct answers well below ability", () => {
    const learner = neutralLearner({
      ability: { doubling: 5, percent: 5, doubling_time: 5, logs: 5, modelling: 5 },
    });
    let s = begin(learner);
    let t = T0;
    for (let i = 0; i < 3; i++) s = solveCurrent(s, (t += 10000));
    const reading = readState({
      events: s.events,
      learner: s.learner,
      focusConcept: "logs",
      sessionStartedAt: T0,
      now: t,
    });
    expect(["UNDERCHALLENGED", "FOCUSED"]).toContain(reading.primary);
    expect(reading.signals.some((sig) => sig.key === "easy_streak")).toBe(true);
  });

  it("reads repeated slow misses with hints as overloaded", () => {
    let s = begin(neutralLearner());
    let t = T0;
    for (let i = 0; i < 3; i++) {
      const a = s.current!.activity;
      s = dispatch(s, { type: "hint", activityId: a.id }, (t += 5000));
      s = solveCurrent(s, (t += 40000), false);
    }
    const family = s.decisions.at(-1)!.reading.primary;
    expect(["CONFUSED", "OVERWHELMED", "FRUSTRATED"]).toContain(family);
  });
});

describe("Adaptive Intervention Engine", () => {
  it("bored + high knowledge → raise the challenge (a real problem, not a lecture)", () => {
    const a = scenarioById("A");
    const s = startSession({ id: "a", learner: a.learner(), checkin: a.checkin, now: T0 });
    expect(s.current!.kind).toBe("STRETCH_CHALLENGE");
    expect(s.current!.activity.type).toBe("challenge");
    expect(s.current!.rationale.summary).toMatch(/instead of another explanation/);
  });

  it("bored + low knowledge + low curiosity → real-world relevance", () => {
    const learner = neutralLearner({
      ability: { logs: 1.5, doubling_time: 2.8 },
      traits: { curiosity: 0.3 },
    });
    const s = begin(learner, { feeling: "bored" });
    expect(s.current!.kind).toBe("REAL_WORLD_HOOK");
  });

  it.each([
    ["overwhelmed", "GUIDED_STEPS"],
    ["confused", "SWITCH_MODALITY"],
    ["curious", "CURIOSITY_PATH"],
    ["alone", "PEER_MISSION"],
  ] as const)("%s → %s", (feeling, kind) => {
    const s = begin(neutralLearner({ traits: { socialAffinity: 0.7, curiosity: 0.6 } }), {
      feeling,
    });
    expect(s.current!.kind).toBe(kind);
  });

  it("low energy gets something light, never a stretch", () => {
    const s = begin(neutralLearner(), { feeling: "tired", energy: 1 });
    expect(["MICRO_WIN", "BREAK", "REFLECTION"]).toContain(s.current!.kind);
  });

  it("starts below the goal when a prerequisite is shaky, and says why", () => {
    const b = scenarioById("B");
    const s = startSession({ id: "b", learner: b.learner(), checkin: b.checkin, now: T0 });
    expect(s.current!.kind).toBe("GUIDED_STEPS");
    expect(s.current!.focusConcept).toBe("doubling");
    expect(s.current!.rationale.because.join(" ")).toMatch(/built on doubling/);
  });

  it("explains every decision and lists what it considered", () => {
    for (const sc of SCENARIOS) {
      const s = startSession({ id: sc.id, learner: sc.learner(), checkin: sc.checkin, now: T0 });
      const r = s.current!.rationale;
      expect(r.summary.length).toBeGreaterThan(20);
      expect(r.headline.length).toBeGreaterThan(5);
      expect(r.watching.length).toBeGreaterThan(5);
      expect(r.alternatives.length).toBeGreaterThan(0);
    }
  });
});

describe("Learner controls are constraints, not suggestions", () => {
  it("Too easy makes the next activity strictly harder, all the way to the top", () => {
    let s = begin(neutralLearner(), { feeling: "okay" });
    let t = T0;
    let previous = s.current!.difficulty ?? 1;
    for (let i = 0; i < 4 && previous < 5; i++) {
      s = dispatch(s, { type: "control", action: "TOO_EASY" }, (t += 5000));
      expect(s.current!.difficulty).toBeGreaterThan(previous);
      previous = s.current!.difficulty!;
    }
    expect(previous).toBe(5);
  });

  it("Too hard never makes it harder", () => {
    const a = scenarioById("A");
    let s = startSession({ id: "a", learner: a.learner(), checkin: a.checkin, now: T0 });
    const before = s.current!.difficulty ?? 3;
    s = dispatch(s, { type: "control", action: "TOO_HARD" }, T0 + 5000);
    expect(s.current!.difficulty ?? 0).toBeLessThan(before);
  });

  it("Explain differently changes the modality every time", () => {
    let s = begin(neutralLearner(), { feeling: "confused" });
    let t = T0;
    const seen = [s.current!.modality];
    for (let i = 0; i < 3; i++) {
      s = dispatch(s, { type: "control", action: "EXPLAIN_DIFFERENTLY" }, (t += 5000));
      expect(s.current!.activity.type).toBe("explanation");
      seen.push(s.current!.modality);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("Saying 'I'm bored' during an explanation switches to something interactive", () => {
    let s = begin(neutralLearner({ ability: { logs: 3.4 } }), { feeling: "confused" });
    expect(s.current!.activity.type).toBe("explanation");
    s = dispatch(
      s,
      { type: "checkin", feeling: "bored", energy: 4, timeBudgetMin: 20, partial: true },
      T0 + 5000,
    );
    expect(s.current!.reading.primary).toBe("BORED");
    expect(s.current!.activity.type).not.toBe("explanation");
  });

  it("a live 'I'm bored' outweighs confusion inferred from earlier misses", () => {
    const a = scenarioById("A");
    let s = startSession({ id: "a", learner: a.learner(), checkin: a.checkin, now: T0 });
    s = solveCurrent(s, T0 + 5000, false);
    s = dispatch(
      s,
      { type: "checkin", feeling: "bored", energy: 4, timeBudgetMin: 20, partial: true },
      T0 + 90_000,
    );
    expect(s.current!.reading.primary).toBe("BORED");
    expect(s.current!.rationale.summary).toMatch(/bored/);
  });

  it.each([
    ["CHALLENGE_ME", "STRETCH_CHALLENGE"],
    ["EXPLORE", "CURIOSITY_PATH"],
    ["BREAK", "BREAK"],
  ] as const)("%s → %s", (action, kind) => {
    const s = dispatch(begin(neutralLearner()), { type: "control", action }, T0 + 5000);
    expect(s.current!.kind).toBe(kind);
  });

  it("Not interested changes both the kind and the interest frame", () => {
    const a = scenarioById("A");
    let s = startSession({ id: "a", learner: a.learner(), checkin: a.checkin, now: T0 });
    const before = s.current!;
    s = dispatch(s, { type: "control", action: "NOT_INTERESTED" }, T0 + 5000);
    expect(s.current!.kind).not.toBe(before.kind);
    expect(s.current!.frame).not.toBe(before.frame);
  });
});

describe("Observe → Adapt", () => {
  it("records a recovery and cites it the next time the same state appears", () => {
    const a = scenarioById("A");
    let s = startSession({ id: "a", learner: a.learner(), checkin: a.checkin, now: T0 });
    s = solveCurrent(s, T0 + 10000);
    const first = s.timeline[0]!;
    expect(first.outcome?.recovered).toBe(true);
    expect(first.outcome!.indexAfter).toBeGreaterThan(first.indexBefore);
    expect(s.learner.effectiveness["BORED|STRETCH_CHALLENGE"]).toEqual({ tries: 1, recoveries: 1 });

    const tomorrow = nextDay(s, a.dayTwoCheckin, T0 + 86_400_000, "a2");
    expect(tomorrow.current!.reading.primary).toBe("BORED");
    expect(tomorrow.current!.kind).toBe("STRETCH_CHALLENGE");
    expect(tomorrow.current!.rationale.learned).toMatch(/brought you back 1 of 1/);
    expect(tomorrow.current!.patternRecognized).toBe(true);
    expect(tomorrow.learner.snapshots.map((x) => x.label)).toEqual(["Day 1"]);
    // Yesterday's snapshot keeps where the day began, so the twin can show what changed.
    expect(tomorrow.learner.snapshots[0]!.start?.ability.logs).toBe(a.learner().ability.logs);
    expect(tomorrow.learnerAtStart.ability.logs).toBe(s.learner.ability.logs);
  });

  it("an abandoned activity is not a recovery, and lowers that option next time", () => {
    const a = scenarioById("A");
    let s = startSession({ id: "a", learner: a.learner(), checkin: a.checkin, now: T0 });
    const id = s.current!.activity.id;
    s = dispatch(s, { type: "activity_abandoned", activityId: id, dwellMs: 3000 }, T0 + 3000);
    expect(s.timeline[0]!.outcome?.recovered).toBe(false);
    expect(s.learner.effectiveness["BORED|STRETCH_CHALLENGE"]).toEqual({ tries: 1, recoveries: 0 });
  });

  it("respects consent: no behavioural learning when it's switched off", () => {
    const learner = neutralLearner();
    learner.consent.learnFromBehaviour = false;
    let s = begin(learner);
    const before = { ...s.learner.ability };
    s = solveCurrent(s, T0 + 5000);
    expect(s.learner.ability).toEqual(before);
    expect(s.learner.effectiveness).toEqual({});
  });
});

describe("simulated sessions", () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    "scenario %s runs end to end with sensible metrics",
    (_id, sc) => {
      const rng = createRng(42);
      let t = T0;
      let s = startSession({
        id: sc.id,
        learner: sc.learner(),
        checkin: sc.checkin,
        now: t,
        mode: sc.mode,
      });
      for (let i = 0; i < 8 && s.current; i++) {
        for (const step of simulateActivity(s, sc.persona, rng))
          s = dispatch(s, step.input, (t += step.dt));
      }
      s = endSession(s, t);
      const m = sessionMetrics(s);
      expect(s.timeline.length).toBeGreaterThanOrEqual(5);
      expect(m.taskCompletion.rate).not.toBeNull();
      expect(m.arc.length).toBe(s.timeline.length);
      expect(growthMoments(s).every((g) => g.label.length > 0)).toBe(true);
      expect(learnerPatterns(s.learner).patterns).toBeInstanceOf(Array);
      // No activity repeats within a session.
      const ids = s.decisions.map((d) => d.activity.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it("produces a deterministic cohort report from a seed", () => {
    const a = simulateCohort({ learners: 8, days: 2, seed: 3 });
    const b = simulateCohort({ learners: 8, days: 2, seed: 3 });
    expect(a).toEqual(b);
    for (const day of a.daily) {
      const total = Object.values(day.families).reduce((x, y) => x + y, 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });
});

describe("boundary schemas", () => {
  it("accepts engine events and rejects free text in reflections", () => {
    const s = begin(neutralLearner());
    for (const e of s.events) expect(learnerEventSchema.safeParse(e).success).toBe(true);
    const reflection = {
      id: "x",
      at: 1,
      type: "reflection",
      usefulness: 3,
      note: "private thoughts",
    };
    expect(learnerEventSchema.safeParse(reflection).success).toBe(false);
  });

  it("caps sync batches", () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      id: `e${i}`,
      at: i,
      type: "reaction",
      reaction: "aha",
    }));
    expect(
      syncBatchSchema.safeParse({ learnerId: "l", deviceId: "d", cursor: 0, events }).success,
    ).toBe(false);
  });
});
