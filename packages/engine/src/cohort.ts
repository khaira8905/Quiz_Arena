import { CONCEPT_META, FAMILY_META, STATE_META } from "./config";
import {
  dispatch,
  endSession,
  startSession,
  type CheckinInput,
  type SessionState,
} from "./orchestrator";
import { createRng, pick, type Rng } from "./rng";
import { SCENARIOS } from "./scenarios";
import { simulateActivity, type SimPersona } from "./simulator";
import {
  CONCEPTS,
  type ConceptId,
  type Feeling,
  type InterventionKind,
  type StateFamily,
} from "./types";
import { clamp } from "./util";

/**
 * Educator analytics, computed by running the real engine against a simulated class.
 *
 * Nothing here is invented: every number is the engine's own output on simulated learners, and the
 * UI labels it as such. Aggregates only. Individual names appear only for learners who opted in.
 */

export interface CohortOptions {
  learners: number;
  days: number;
  seed: number;
}

export interface CohortReport {
  learners: number;
  days: number;
  seed: number;
  decisions: number;
  daily: {
    day: number;
    families: Record<StateFamily, number>;
    recoveryRate: number;
    avgIndex: number;
  }[];
  effectiveness: {
    kind: InterventionKind;
    family: StateFamily;
    tries: number;
    recoveries: number;
  }[];
  concepts: { concept: ConceptId; label: string; answers: number; missRate: number }[];
  needsSupport: {
    total: number;
    sharedNames: string[];
    reasons: { label: string; count: number }[];
  };
  disengagementPatterns: { label: string; share: number }[];
}

const FIRST_NAMES = [
  "Anaya",
  "Vihaan",
  "Diya",
  "Reyansh",
  "Saanvi",
  "Arjun",
  "Myra",
  "Kiaan",
  "Aadhya",
  "Ishaan",
  "Pari",
  "Rohan",
  "Zara",
  "Advik",
  "Kavya",
  "Dhruv",
  "Tara",
  "Yash",
  "Nisha",
  "Aryan",
  "Riya",
  "Kabir",
  "Sara",
  "Veer",
  "Anika",
  "Laksh",
  "Mira",
  "Shaurya",
  "Ira",
  "Neel",
  "Siya",
  "Om",
];

function jitterPersona(base: SimPersona, rng: Rng): SimPersona {
  const trueAbility = Object.fromEntries(
    CONCEPTS.map((c) => [c, clamp(base.trueAbility[c] + (rng() - 0.5) * 1.2, 0.5, 5.5)]),
  ) as Record<ConceptId, number>;
  return { ...base, trueAbility, speed: base.speed * (0.8 + rng() * 0.4) };
}

export function simulateCohort(opts: CohortOptions): CohortReport {
  const rng = createRng(opts.seed);
  const sessions: SessionState[][] = [];
  const shared: boolean[] = [];

  for (let i = 0; i < opts.learners; i++) {
    const scenario = SCENARIOS[i % SCENARIOS.length]!;
    const persona = jitterPersona(scenario.persona, rng);
    let learner = {
      ...scenario.learner(),
      id: `sim-${i}`,
      displayName: FIRST_NAMES[i % FIRST_NAMES.length]!,
    };
    learner = {
      ...learner,
      ability: Object.fromEntries(
        CONCEPTS.map((c) => [c, clamp(learner.ability[c] + (rng() - 0.5), 0.5, 5.5)]),
      ) as typeof learner.ability,
    };
    shared.push(rng() < 0.3);
    const history: SessionState[] = [];
    let clock = Date.UTC(2026, 8, 1, 16, 0) + i * 60000;

    for (let day = 1; day <= opts.days; day++) {
      const feeling: Feeling =
        rng() < 0.6
          ? scenario.checkin.feeling
          : pick(rng, ["okay", "meh", "tired", "bored", "curious"] as const);
      const checkin: CheckinInput = {
        ...scenario.checkin,
        feeling,
        energy: clamp(Math.round(scenario.checkin.energy + (rng() - 0.5) * 2), 1, 5),
      };
      let state = startSession({
        id: `sim-${i}-d${day}`,
        learner: { ...learner, day },
        checkin,
        now: clock,
      });
      for (let step = 0; step < 8 && !state.suggestEnd && state.current; step++) {
        for (const s of simulateActivity(state, persona, rng)) {
          clock += s.dt;
          state = dispatch(state, s.input, clock);
        }
      }
      state = endSession(state, clock);
      history.push(state);
      learner = state.learner;
      clock += 24 * 3600 * 1000;
    }
    sessions.push(history);
  }

  /* Daily state-family mix and recovery. */
  const families: StateFamily[] = [
    "engaged",
    "understimulated",
    "overloaded",
    "depleted",
    "social",
  ];
  const daily = Array.from({ length: opts.days }, (_, d) => {
    const entries = sessions.flatMap((h) => h[d]?.timeline ?? []);
    const counts = Object.fromEntries(families.map((f) => [f, 0])) as Record<StateFamily, number>;
    for (const e of entries) counts[STATE_META[e.state].family]++;
    const total = Math.max(entries.length, 1);
    const disengaged = entries.filter((e) => STATE_META[e.state].family !== "engaged" && e.outcome);
    return {
      day: d + 1,
      families: Object.fromEntries(families.map((f) => [f, counts[f] / total])) as Record<
        StateFamily,
        number
      >,
      recoveryRate: disengaged.length
        ? disengaged.filter((e) => e.outcome!.recovered).length / disengaged.length
        : 0,
      avgIndex: Math.round(
        entries.reduce((s, e) => s + (e.outcome?.indexAfter ?? e.indexBefore), 0) / total,
      ),
    };
  });

  /* Intervention effectiveness by state family. */
  const effMap = new Map<
    string,
    { kind: InterventionKind; family: StateFamily; tries: number; recoveries: number }
  >();
  for (const e of sessions.flat().flatMap((s) => s.timeline)) {
    if (!e.outcome) continue;
    const family = STATE_META[e.state].family;
    const key = `${e.kind}|${family}`;
    const prev = effMap.get(key) ?? { kind: e.kind, family, tries: 0, recoveries: 0 };
    prev.tries++;
    if (e.outcome.recovered) prev.recoveries++;
    effMap.set(key, prev);
  }

  /* Concepts causing difficulty. */
  const conceptStats = new Map<ConceptId, { answers: number; misses: number }>();
  for (const e of sessions.flat().flatMap((s) => s.events)) {
    if (e.type !== "answer") continue;
    const prev = conceptStats.get(e.conceptId) ?? { answers: 0, misses: 0 };
    prev.answers++;
    if (!e.correct) prev.misses++;
    conceptStats.set(e.conceptId, prev);
  }

  /* Learners who may need support: mostly overloaded or depleted in their last two sessions. */
  const reasons = new Map<string, number>();
  const sharedNames: string[] = [];
  let total = 0;
  sessions.forEach((history, i) => {
    const recent = history.slice(-2).flatMap((s) => s.timeline);
    if (recent.length === 0) return;
    const struggling = recent.filter((e) =>
      ["overloaded", "depleted"].includes(STATE_META[e.state].family),
    ).length;
    const isolated = recent.filter((e) => STATE_META[e.state].family === "social").length;
    const flagged = struggling / recent.length >= 0.4 || isolated / recent.length >= 0.3;
    if (!flagged) return;
    total++;
    const reason =
      struggling >= isolated
        ? "Often overloaded, even after support"
        : "Frequently working in isolation";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    if (shared[i]) sharedNames.push(history[0]!.learner.displayName);
  });

  /* Most common starting states (the "why" behind disengagement). */
  const starts = sessions
    .flat()
    .map((s) => s.timeline[0]?.state)
    .filter(Boolean);
  const startCounts = new Map<string, number>();
  for (const s of starts) startCounts.set(s!, (startCounts.get(s!) ?? 0) + 1);

  return {
    learners: opts.learners,
    days: opts.days,
    seed: opts.seed,
    decisions: sessions.flat().reduce((n, s) => n + s.timeline.length, 0),
    daily,
    effectiveness: [...effMap.values()].sort((a, b) => b.tries - a.tries),
    concepts: CONCEPTS.map((c) => {
      const s = conceptStats.get(c) ?? { answers: 0, misses: 0 };
      return {
        concept: c,
        label: CONCEPT_META[c].label,
        answers: s.answers,
        missRate: s.answers ? s.misses / s.answers : 0,
      };
    }),
    needsSupport: {
      total,
      sharedNames,
      reasons: [...reasons].map(([label, count]) => ({ label, count })),
    },
    disengagementPatterns: [...startCounts]
      .filter(([s]) => STATE_META[s as keyof typeof STATE_META].family !== "engaged")
      .map(([s, n]) => ({
        label: `${STATE_META[s as keyof typeof STATE_META].label} (${FAMILY_META[STATE_META[s as keyof typeof STATE_META].family].label.toLowerCase()})`,
        share: n / Math.max(starts.length, 1),
      }))
      .sort((a, b) => b.share - a.share),
  };
}
