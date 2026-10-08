import { INTERVENTION_META, MODALITY_META, STATE_META, TUNING } from "./config";
import type { SessionState } from "./orchestrator";
import type { InterventionKind, LearnerModel, Modality } from "./types";
import { mean } from "./util";

/**
 * Analytics layer. Deliberately no "time spent": the measures are about whether engagement
 * recovered, whether difficulty fit, and whether the learner came back to the work.
 */

export interface Rate {
  n: number;
  of: number;
  rate: number | null;
}

const rate = (n: number, of: number): Rate => ({ n, of, rate: of === 0 ? null : n / of });

export interface SessionMetrics {
  durationMin: number;
  taskCompletion: Rate;
  /** Of decisions made while not engaged, how many led back to engagement. */
  recovery: Rate;
  interventionSuccess: Rate;
  calibration: { observed: number; target: number; answers: number; onTarget: boolean } | null;
  persistence: Rate;
  returnToLearning: Rate;
  curiosityPaths: number;
  usefulness: number | null;
  arc: { at: number; index: number; kind: InterventionKind; label: string; recovered?: boolean }[];
  startIndex: number;
  endIndex: number;
}

export function sessionMetrics(state: SessionState): SessionMetrics {
  const { timeline, decisions, events } = state;
  const closed = timeline.filter((t) => t.outcome);
  const completed = closed.filter((t) => t.outcome!.status === "completed");
  const disengaged = closed.filter((t) => STATE_META[t.state].family !== "engaged");

  // Calibration: observed accuracy vs the target success rate the engine aimed for.
  const decisionByActivity = new Map(decisions.map((d) => [d.activity.id, d]));
  const answers = events.filter((e) => e.type === "answer");
  const targets = answers.map((a) => {
    const d = decisionByActivity.get(a.activityId);
    return d ? TUNING.targetSuccess[STATE_META[d.reading.primary].family] : 0.7;
  });
  const observed = answers.length ? answers.filter((a) => a.correct).length / answers.length : 0;
  const target = mean(targets);

  // Persistence: after a miss, did the learner keep going in that activity?
  let misses = 0;
  let persisted = 0;
  events.forEach((e, i) => {
    if (e.type !== "answer" || e.correct) return;
    misses++;
    const nextRelevant = events
      .slice(i + 1)
      .find((n) => n.type !== "hint" && n.type !== "reaction");
    if (
      nextRelevant &&
      (nextRelevant.type === "answer" || nextRelevant.type === "activity_completed")
    )
      persisted++;
  });

  // Return to learning: after a non-academic intervention, was the next academic one completed?
  let nonAcademic = 0;
  let returned = 0;
  timeline.forEach((t, i) => {
    if (INTERVENTION_META[t.kind].academic || i === timeline.length - 1) return;
    nonAcademic++;
    const nextAcademic = timeline.slice(i + 1).find((n) => INTERVENTION_META[n.kind].academic);
    if (nextAcademic?.outcome?.status === "completed") returned++;
  });

  const reflections = events.filter((e) => e.type === "reflection");
  const indices = timeline.map((t) => t.indexBefore);
  const last = timeline[timeline.length - 1];

  return {
    durationMin: Math.max(0, Math.round(((state.endedAt ?? state.now) - state.startedAt) / 60000)),
    taskCompletion: rate(completed.length, closed.length),
    recovery: rate(disengaged.filter((t) => t.outcome!.recovered).length, disengaged.length),
    interventionSuccess: rate(closed.filter((t) => t.outcome!.recovered).length, closed.length),
    calibration: answers.length
      ? { observed, target, answers: answers.length, onTarget: Math.abs(observed - target) <= 0.2 }
      : null,
    persistence: rate(persisted, misses),
    returnToLearning: rate(returned, nonAcademic),
    curiosityPaths: completed.filter((t) => t.kind === "CURIOSITY_PATH").length,
    usefulness: reflections.length ? mean(reflections.map((r) => r.usefulness)) : null,
    arc: timeline.map((t) => ({
      at: t.at,
      index: t.indexBefore,
      kind: t.kind,
      label: INTERVENTION_META[t.kind].label,
      recovered: t.outcome?.recovered,
    })),
    startIndex: indices[0] ?? 0,
    endIndex: last?.outcome?.indexAfter ?? last?.indexBefore ?? 0,
  };
}

/* --------------------------------------------------------------------------------------------- */
/* Growth moments: recognition for the behaviours that matter, never points or streaks.         */
/* --------------------------------------------------------------------------------------------- */

export interface GrowthMoment {
  key: string;
  label: string;
  detail: string;
}

export function growthMoments(state: SessionState): GrowthMoment[] {
  const moments: GrowthMoment[] = [];
  const { events, timeline, decisions } = state;

  const hard = decisions.filter(
    (d) => (d.difficulty ?? 0) >= 4 && timeline.find((t) => t.decisionId === d.id)?.outcome,
  );
  if (hard.length) {
    moments.push({
      key: "hard",
      label: "Tried something hard",
      detail: `Took on ${hard.length} level 4–5 problem${hard.length > 1 ? "s" : ""}.`,
    });
  }

  const byActivity = new Map<string, boolean[]>();
  for (const e of events) {
    if (e.type === "answer")
      byActivity.set(e.activityId, [...(byActivity.get(e.activityId) ?? []), e.correct]);
  }
  const comeback = [...byActivity.values()].some((r) =>
    r.some((c, i) => !c && r.slice(i + 1).some(Boolean)),
  );
  if (comeback)
    moments.push({
      key: "persist",
      label: "Stuck with it",
      detail: "Got one wrong and kept going to get it right.",
    });

  if (timeline.some((t) => t.kind === "CURIOSITY_PATH" && t.outcome?.status === "completed")) {
    moments.push({
      key: "curious",
      label: "Followed curiosity",
      detail: "Took a tangent all the way back to the syllabus.",
    });
  }
  if (events.some((e) => e.type === "assist")) {
    moments.push({
      key: "helped",
      label: "Helped a peer",
      detail: "Explained a step so someone else got it.",
    });
  }
  if (events.some((e) => e.type === "reflection")) {
    moments.push({
      key: "reflected",
      label: "Reflected",
      detail: "Put what you learned into your own words.",
    });
  }
  if (timeline.some((t) => t.kind === "BREAK" && t.outcome?.status === "completed")) {
    moments.push({
      key: "rest",
      label: "Knew when to stop",
      detail: "Took a real break instead of pushing on empty.",
    });
  }
  return moments;
}

/* --------------------------------------------------------------------------------------------- */
/* Patterns: what the twin has learned, stated with its evidence.                                */
/* --------------------------------------------------------------------------------------------- */

const CATEGORIES: { key: string; label: string; kinds: InterventionKind[] }[] = [
  {
    key: "challenge",
    label: "Challenge-based activities",
    kinds: ["RAISE_CHALLENGE", "STRETCH_CHALLENGE", "REAL_WORLD_HOOK"],
  },
  { key: "explanation", label: "Passive explanations", kinds: ["SWITCH_MODALITY", "CONTINUE"] },
  { key: "scaffold", label: "Small steps", kinds: ["GUIDED_STEPS", "MICRO_WIN"] },
  { key: "social", label: "Peer missions", kinds: ["PEER_MISSION"] },
  { key: "explore", label: "Curiosity paths", kinds: ["CURIOSITY_PATH", "MODALITY_CHOICE"] },
];

export interface CategoryStat {
  key: string;
  label: string;
  tries: number;
  recoveries: number;
  rate: number | null;
}

export function categoryStats(learner: LearnerModel): CategoryStat[] {
  return CATEGORIES.map((c) => {
    let tries = 0;
    let recoveries = 0;
    for (const [key, rec] of Object.entries(learner.effectiveness)) {
      if (c.kinds.includes(key.split("|")[1] as InterventionKind)) {
        tries += rec.tries;
        recoveries += rec.recoveries;
      }
    }
    return {
      key: c.key,
      label: c.label,
      tries,
      recoveries,
      rate: tries ? recoveries / tries : null,
    };
  });
}

export interface Pattern {
  text: string;
  evidence: string;
  strength: "emerging" | "clear";
}

export function learnerPatterns(learner: LearnerModel): {
  patterns: Pattern[];
  engageTriggers: string[];
  disengageTriggers: string[];
  preferredModality?: { modality: Modality; label: string; rate: number };
} {
  const stats = categoryStats(learner).filter((s) => s.tries > 0);
  const patterns: Pattern[] = [];
  const sorted = [...stats].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best && worst && best !== worst && best.tries >= 2 && worst.tries >= 1) {
    const ratio = (best.rate ?? 0) / Math.max(worst.rate ?? 0, 0.2);
    if (ratio >= 1.4) {
      patterns.push({
        text: `${best.label} are bringing you back ${ratio.toFixed(1)}× as often as ${worst.label.toLowerCase()}.`,
        evidence: `${best.recoveries} of ${best.tries} vs ${worst.recoveries} of ${worst.tries}`,
        strength: best.tries + worst.tries >= 6 ? "clear" : "emerging",
      });
    }
  }
  for (const s of stats) {
    if (s.tries >= 2 && s !== best && (s.rate ?? 0) >= 0.66) {
      patterns.push({
        text: `${s.label} tend to work for you.`,
        evidence: `${s.recoveries} of ${s.tries}`,
        strength: "emerging",
      });
    }
  }

  const kindStats = new Map<InterventionKind, { tries: number; recoveries: number }>();
  for (const [key, rec] of Object.entries(learner.effectiveness)) {
    const kind = key.split("|")[1] as InterventionKind;
    const prev = kindStats.get(kind) ?? { tries: 0, recoveries: 0 };
    kindStats.set(kind, {
      tries: prev.tries + rec.tries,
      recoveries: prev.recoveries + rec.recoveries,
    });
  }
  const engageTriggers = [...kindStats]
    .filter(([, s]) => s.tries >= 1 && s.recoveries / s.tries >= 0.66)
    .sort((a, b) => b[1].recoveries - a[1].recoveries)
    .slice(0, 3)
    .map(([k]) => INTERVENTION_META[k].label);
  const disengageTriggers = [...kindStats]
    .filter(([, s]) => s.tries >= 1 && s.recoveries / s.tries <= 0.34)
    .slice(0, 3)
    .map(([k]) => INTERVENTION_META[k].label);

  let preferredModality: { modality: Modality; label: string; rate: number } | undefined;
  for (const [m, c] of Object.entries(learner.modality) as [Modality, { a: number; b: number }][]) {
    const observations = c.a + c.b - 2;
    if (observations < 1) continue;
    const r = c.a / (c.a + c.b);
    // Only call something a preference when it works more often than not.
    if (r > 0.5 && (!preferredModality || r > preferredModality.rate))
      preferredModality = { modality: m, label: MODALITY_META[m].label, rate: r };
  }

  return { patterns, engageTriggers, disengageTriggers, preferredModality };
}
