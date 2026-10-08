import { CONCEPT_META, CONCEPT_ORDER, MODALITY_META, STATE_META, TUNING } from "./config";
import {
  BREAKS,
  CURIOSITY_PATHS,
  EXPLANATIONS,
  MISSIONS,
  REFLECTIONS,
} from "./content/experiences";
import { CHALLENGES, GUIDED, MICRO_WINS, QUESTIONS } from "./content/practice";
import type {
  Activity,
  ChallengeActivity,
  ChoiceActivity,
  ConceptId,
  ConnectivityMode,
  Constraints,
  InterventionKind,
  LearnerModel,
  Modality,
  StateReading,
} from "./types";
import { clamp, logit } from "./util";

/**
 * Activity Engine: turns "what kind of intervention" into "this exact activity, at this level".
 *
 * Difficulty is calibrated from the ability model: the target probability of success depends on
 * the learner's state (70% when focused, 90% when overwhelmed, 50% when under-challenged), then
 * the learner's controls clamp it. "Too easy" means strictly harder, always.
 */

export interface ActivityRequest {
  kind: InterventionKind;
  learner: LearnerModel;
  reading: StateReading;
  constraints: Constraints;
  focusConcept: ConceptId;
  /** Served earlier in this session: never repeated while anything else fits. */
  seen: ReadonlySet<string>;
  /** Served in earlier sessions: fine to revisit, but fresh content is preferred. */
  seenBefore: ReadonlySet<string>;
  /** Modalities already shown for the focus concept this session. */
  shownModalities: Modality[];
  lastDifficulty?: number;
  /** How the previous activity went: success holds the level instead of stepping down. */
  lastScore?: number;
  mode: ConnectivityMode;
  stopRecommended: boolean;
}

export interface ServedActivity {
  activity: Activity;
  difficulty?: number;
  modality?: Modality;
  frame?: string;
  /** Set when a constraint couldn't be fully honoured (e.g. already at the top level). */
  note?: string;
}

const MAX_LEVEL = 5;

/** The concept to work on: the goal, unless a prerequisite is too shaky, or the goal is mastered. */
export function focusConcept(learner: LearnerModel): ConceptId {
  let index = CONCEPT_ORDER.indexOf(learner.goalConcept);
  while (index > 0 && learner.ability[CONCEPT_ORDER[index - 1]!] < TUNING.prerequisiteFloor)
    index--;
  if (index === CONCEPT_ORDER.indexOf(learner.goalConcept)) {
    while (index < CONCEPT_ORDER.length - 1 && learner.ability[CONCEPT_ORDER[index]!] >= 4.3)
      index++;
  }
  return CONCEPT_ORDER[index]!;
}

export function targetDifficulty(
  learner: LearnerModel,
  concept: ConceptId,
  reading: StateReading,
): number {
  const p = TUNING.targetSuccess[STATE_META[reading.primary].family];
  const raw = learner.ability[concept] - logit(p) / TUNING.abilitySlope;
  return clamp(Math.round(raw), 1, MAX_LEVEL);
}

function applyBounds(d: number, c: Constraints): number {
  let level = d;
  if (c.minDifficulty !== undefined) level = Math.max(level, c.minDifficulty);
  if (c.maxDifficulty !== undefined) level = Math.min(level, c.maxDifficulty);
  return clamp(level, 1, MAX_LEVEL);
}

const conceptDistance = (a: ConceptId, b: ConceptId) =>
  Math.abs(CONCEPT_ORDER.indexOf(a) - CONCEPT_ORDER.indexOf(b));

/** Interest frames the learner mentioned, in the order they mentioned them. */
function preferredFrames(learner: LearnerModel): string[] {
  return learner.interests.map((i) => i.toLowerCase());
}

/** Fresh first, then things from earlier sessions; this session's items only as a last resort. */
function freshness(req: ActivityRequest, id: string): number {
  return req.seen.has(id) ? 2 : req.seenBefore.has(id) ? 1 : 0;
}

function pickQuestion(req: ActivityRequest, level: number, upward: boolean) {
  // Staying near the right level matters more than novelty: a repeat at the right level beats a
  // fresh question two levels off.
  const near = upward ? [0, 1, -1] : [0, -1, 1];
  const wide = upward ? [2, -2] : [-2, 2];
  const passes: [number[], number][] = [
    [near, 0],
    [near, 1],
    [wide, 0],
    [near, 2],
    [wide, 2],
  ];
  for (const [order, maxFreshness] of passes) {
    for (const offset of order) {
      const d = level + offset;
      if (d < 1 || d > MAX_LEVEL) continue;
      if (
        req.constraints.minDifficulty !== undefined &&
        d < Math.min(req.constraints.minDifficulty, MAX_LEVEL)
      )
        continue;
      if (req.constraints.maxDifficulty !== undefined && d > req.constraints.maxDifficulty)
        continue;
      const pool = QUESTIONS.filter(
        (q) => q.difficulty === d && freshness(req, q.id) <= maxFreshness,
      );
      if (pool.length === 0) continue;
      pool.sort(
        (a, b) =>
          freshness(req, a.id) - freshness(req, b.id) ||
          conceptDistance(a.conceptId, req.focusConcept) -
            conceptDistance(b.conceptId, req.focusConcept),
      );
      return pool[0]!;
    }
  }
  return undefined;
}

function pickChallenge(req: ActivityRequest, level: number): ChallengeActivity | undefined {
  const frames = preferredFrames(req.learner);
  const excluded = new Set(req.constraints.excludeFrames ?? []);
  const min =
    req.constraints.minDifficulty !== undefined
      ? Math.min(req.constraints.minDifficulty, MAX_LEVEL)
      : 1;
  const max = req.constraints.maxDifficulty ?? MAX_LEVEL;
  const pool = CHALLENGES.filter(
    (c) =>
      !req.seen.has(c.id) && !excluded.has(c.frame) && c.difficulty >= min && c.difficulty <= max,
  );
  if (pool.length === 0) return undefined;
  const rank = (c: ChallengeActivity) => {
    const frameRank = frames.indexOf(c.frame);
    return (
      freshness(req, c.id) * 2 +
      Math.abs(c.difficulty - level) * 3 +
      (c.difficulty < level ? 1 : 0) +
      (frameRank === -1 ? 4 : frameRank * 0.5) +
      conceptDistance(c.conceptId, req.focusConcept) * 0.3
    );
  };
  return [...pool].sort((a, b) => rank(a) - rank(b))[0];
}

/** Tie-break when the learner model has no preference yet: show, then do, then tell. */
const DEFAULT_MODALITY_ORDER: Modality[] = ["visual", "worked", "analogy", "dialogue", "text"];

function modalityRank(
  learner: LearnerModel,
  modality: Modality,
  mode: ConnectivityMode = "full",
): number {
  const { a, b } = learner.modality[modality];
  const tieBreak =
    (DEFAULT_MODALITY_ORDER.length - DEFAULT_MODALITY_ORDER.indexOf(modality)) * 0.001;
  // Visuals still work in light mode (as text), but they lose their point, so rank them last.
  const lightPenalty = mode !== "full" && modality === "visual" ? 0.2 : 0;
  return a / (a + b) + tieBreak - lightPenalty;
}

function explanationFor(req: ActivityRequest) {
  const excluded = new Set([...(req.constraints.excludeModalities ?? []), ...req.shownModalities]);
  const forConcept = (concept: ConceptId) =>
    EXPLANATIONS.filter(
      (e) => e.conceptId === concept && !excluded.has(e.modality) && !req.seen.has(e.id),
    );
  let pool = forConcept(req.focusConcept);
  if (pool.length === 0) {
    // Fall back to the nearest concept that still has an unseen angle.
    const nearest = [...CONCEPT_ORDER].sort(
      (a, b) => conceptDistance(a, req.focusConcept) - conceptDistance(b, req.focusConcept),
    );
    for (const concept of nearest) {
      pool = forConcept(concept);
      if (pool.length > 0) break;
    }
  }
  if (pool.length === 0) return undefined;
  const prefer = req.constraints.preferModality;
  return [...pool].sort((x, y) => {
    if (prefer) {
      if (x.modality === prefer && y.modality !== prefer) return -1;
      if (y.modality === prefer && x.modality !== prefer) return 1;
    }
    return (
      freshness(req, x.id) - freshness(req, y.id) ||
      modalityRank(req.learner, y.modality, req.mode) -
        modalityRank(req.learner, x.modality, req.mode)
    );
  })[0];
}

function choiceFor(req: ActivityRequest): ChoiceActivity | undefined {
  const excluded = new Set(req.shownModalities);
  const available = [
    ...new Set(
      EXPLANATIONS.filter(
        (e) => e.conceptId === req.focusConcept && !excluded.has(e.modality) && !req.seen.has(e.id),
      ).map((e) => e.modality),
    ),
  ]
    .sort((a, b) => modalityRank(req.learner, b, req.mode) - modalityRank(req.learner, a, req.mode))
    .slice(0, 3);
  const describe: Record<Modality, string> = {
    text: "Short, plain explanation. Read it in a minute.",
    visual: "Something you can see and play with.",
    analogy: "An everyday comparison that makes it click.",
    worked: "Watch a real problem get solved, step by step.",
    dialogue: "A quick back-and-forth, like talking it through.",
  };
  const id = `choice-${req.focusConcept}-${[...req.seen].length}`;
  return {
    id,
    type: "choice",
    title: "Your call",
    conceptId: req.focusConcept,
    prompt: `How do you want to get into ${CONCEPT_META[req.focusConcept].short.toLowerCase()} next?`,
    options: [
      ...available.map((m) => ({
        choice: m,
        label: MODALITY_META[m].label,
        description: describe[m],
      })),
      {
        choice: "hands-on" as const,
        label: "Hands-on",
        description: "Skip the explaining: give me a real problem.",
      },
    ],
  };
}

export function serveActivity(req: ActivityRequest): ServedActivity | undefined {
  const { kind, learner, reading, constraints } = req;
  const base = targetDifficulty(learner, req.focusConcept, reading);
  const atTop = constraints.minDifficulty !== undefined && constraints.minDifficulty > MAX_LEVEL;
  const topNote = atTop
    ? "You're at the top level of this set, so this is the hardest I have."
    : undefined;

  switch (kind) {
    case "CONTINUE":
    case "RAISE_CHALLENGE": {
      let level = applyBounds(base, constraints);
      if (kind === "CONTINUE" && req.lastDifficulty !== undefined && (req.lastScore ?? 0) >= 0.5) {
        // A success holds the level; calibration only steps down after misses.
        level = applyBounds(Math.max(level, Math.min(req.lastDifficulty, base + 1)), constraints);
      }
      if (kind === "RAISE_CHALLENGE") {
        const floor = Math.max((req.lastDifficulty ?? base - 1) + 1, base);
        level = applyBounds(Math.max(level, floor), constraints);
      }
      const q = pickQuestion(req, level, kind === "RAISE_CHALLENGE");
      return q && { activity: q, difficulty: q.difficulty, note: topNote };
    }
    case "STRETCH_CHALLENGE":
    case "REAL_WORLD_HOOK": {
      const level =
        kind === "STRETCH_CHALLENGE"
          ? applyBounds(
              Math.max(Math.round(learner.ability[req.focusConcept]), 3, req.lastDifficulty ?? 0),
              constraints,
            )
          : applyBounds(base, constraints);
      const c = pickChallenge(req, level);
      if (!c) return undefined;
      const activity: ChallengeActivity =
        kind === "STRETCH_CHALLENGE"
          ? { ...c, timeLimitSec: TUNING.stretchTimeLimitSec }
          : { ...c };
      return { activity, difficulty: c.difficulty, frame: c.frame, note: topNote };
    }
    case "GUIDED_STEPS": {
      const pool = GUIDED.filter(
        (g) =>
          !req.seen.has(g.id) &&
          (constraints.maxDifficulty === undefined || g.difficulty <= constraints.maxDifficulty),
      ).sort(
        (a, b) =>
          conceptDistance(a.conceptId, req.focusConcept) -
            conceptDistance(b.conceptId, req.focusConcept) ||
          freshness(req, a.id) - freshness(req, b.id),
      );
      const g = pool[0];
      return g && { activity: g, difficulty: g.difficulty };
    }
    case "SWITCH_MODALITY": {
      const e = explanationFor(req);
      return e && { activity: e, modality: e.modality };
    }
    case "MODALITY_CHOICE": {
      const c = choiceFor(req);
      return c && { activity: c };
    }
    case "MICRO_WIN": {
      const m = [...MICRO_WINS]
        .filter((x) => !req.seen.has(x.id))
        .sort((a, b) => freshness(req, a.id) - freshness(req, b.id))[0];
      return m && { activity: m, difficulty: 1 };
    }
    case "CURIOSITY_PATH": {
      const frames = preferredFrames(learner);
      const excluded = new Set(constraints.excludeFrames ?? []);
      const pool = CURIOSITY_PATHS.filter(
        (p) => !req.seen.has(p.id) && !excluded.has(p.frame),
      ).sort((a, b) => {
        const ra = frames.indexOf(a.frame);
        const rb = frames.indexOf(b.frame);
        return (
          freshness(req, a.id) - freshness(req, b.id) ||
          (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
        );
      });
      const p = pool[0];
      return p && { activity: p, frame: p.frame };
    }
    case "PEER_MISSION": {
      const pool = MISSIONS.filter((m) => !req.seen.has(m.id)).sort(
        (a, b) =>
          freshness(req, a.id) - freshness(req, b.id) ||
          Math.abs(a.difficulty - base) - Math.abs(b.difficulty - base),
      );
      const m = pool[0];
      return m && { activity: m, difficulty: m.difficulty };
    }
    case "REFLECTION": {
      const r =
        REFLECTIONS.find((x) => x.conceptId === req.focusConcept && !req.seen.has(x.id)) ??
        REFLECTIONS.find((x) => !req.seen.has(x.id));
      return r && { activity: r };
    }
    case "BREAK": {
      const b = BREAKS.find((x) => x.stopHere === req.stopRecommended) ?? BREAKS[0]!;
      return { activity: b };
    }
  }
}
