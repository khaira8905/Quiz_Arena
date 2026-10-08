import { INTERVENTION_META, STATE_META, TRAIT_META, TUNING } from "./config";
import {
  CONCEPTS,
  MODALITIES,
  TRAITS,
  type Activity,
  type AnswerEvent,
  type CheckinEvent,
  type ConceptId,
  type ControlAction,
  type DailySnapshot,
  type Decision,
  type LearnerEvent,
  type LearnerModel,
  type Modality,
  type ModelDelta,
  type Outcome,
  type OutcomeStatus,
  type StateReading,
  type TimelineEntry,
  type Trait,
} from "./types";
import { clamp, mean, round, sigmoid } from "./util";

/**
 * Learner model and Feedback Processor.
 *
 * The model is the learner's evolving "digital twin": ability per concept, traits, modality
 * affinities, and a table of which interventions have worked in which states. Every update is a
 * pure function returning a new model, so changes are easy to diff, explain and undo.
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface CreateLearnerInput {
  id: string;
  displayName: string;
  goal: string;
  goalConcept: ConceptId;
  interests?: string[];
  traits?: Partial<Record<Trait, number>>;
  ability?: Partial<Record<ConceptId, number>>;
  modality?: Partial<Record<Modality, { a: number; b: number }>>;
  energy?: number;
  timeBudgetMin?: number;
  sharedDevice?: boolean;
}

export function createLearner(input: CreateLearnerInput): LearnerModel {
  const traits = Object.fromEntries(TRAITS.map((t) => [t, input.traits?.[t] ?? 0.5])) as Record<
    Trait,
    number
  >;
  const ability = Object.fromEntries(CONCEPTS.map((c) => [c, input.ability?.[c] ?? 2.5])) as Record<
    ConceptId,
    number
  >;
  const modality = Object.fromEntries(
    MODALITIES.map((m) => [m, input.modality?.[m] ?? { a: 1, b: 1 }]),
  ) as LearnerModel["modality"];
  return {
    id: input.id,
    displayName: input.displayName,
    goal: input.goal,
    goalConcept: input.goalConcept,
    interests: input.interests ?? [],
    traits,
    ability,
    modality,
    effectiveness: {},
    context: {
      energy: input.energy ?? 3,
      timeBudgetMin: input.timeBudgetMin ?? 20,
      sharedDevice: input.sharedDevice ?? false,
    },
    snapshots: [],
    consent: { learnFromBehaviour: true, shareWithMentor: false, useAiGateway: true },
    seenActivities: [],
    sessions: 0,
    day: 1,
  };
}

export function probabilityCorrect(theta: number, difficulty: number): number {
  return sigmoid(TUNING.abilitySlope * (theta - difficulty));
}

/** Ability update from an answer: move θ toward the evidence, less when a hint was used. */
export function applyAnswer(model: LearnerModel, answer: AnswerEvent): LearnerModel {
  if (!model.consent.learnFromBehaviour) return model;
  const next = clone(model);
  const theta = next.ability[answer.conceptId];
  const expected = probabilityCorrect(theta, answer.difficulty);
  // Getting there with a hint or on a retry still counts, just for less.
  const gain = answer.correct && (answer.usedHint || (answer.attempt ?? 1) > 1) ? 0.5 : 1;
  next.ability[answer.conceptId] = clamp(
    theta + TUNING.abilityStep * gain * ((answer.correct ? 1 : 0) - expected),
    0.5,
    5.5,
  );
  return next;
}

/** Controls are explicit statements from the learner, so they update the model even without consent to learn from behaviour. */
export function applyControl(
  model: LearnerModel,
  action: ControlAction,
  concept: ConceptId,
): LearnerModel {
  const next = clone(model);
  const nudge = (trait: Trait, by: number) => {
    next.traits[trait] = clamp(next.traits[trait] + by);
  };
  switch (action) {
    case "TOO_EASY":
      next.ability[concept] = clamp(next.ability[concept] + 0.5, 0.5, 5.5);
      nudge("challengePreference", 0.05);
      break;
    case "TOO_HARD":
      next.ability[concept] = clamp(next.ability[concept] - 0.4, 0.5, 5.5);
      nudge("difficultyTolerance", -0.03);
      break;
    case "CHALLENGE_ME":
      nudge("challengePreference", 0.08);
      break;
    case "EXPLORE":
      nudge("curiosity", 0.05);
      break;
    default:
      break;
  }
  return next;
}

export function applyCheckin(model: LearnerModel, checkin: CheckinEvent): LearnerModel {
  const next = clone(model);
  if (!checkin.partial) {
    next.context.energy = checkin.energy;
    next.context.timeBudgetMin = checkin.timeBudgetMin;
    next.context.selfAssessment = checkin.selfAssessment;
    if (checkin.selfAssessment === "confident") {
      next.ability[next.goalConcept] = clamp(next.ability[next.goalConcept] + 0.4, 0.5, 5.5);
    } else if (checkin.selfAssessment === "lost") {
      next.ability[next.goalConcept] = clamp(next.ability[next.goalConcept] - 0.4, 0.5, 5.5);
    }
  } else if (checkin.feeling === "tired") {
    next.context.energy = Math.min(next.context.energy, 2);
  }
  if (checkin.feeling === "curious") next.traits.curiosity = clamp(next.traits.curiosity + 0.04);
  return next;
}

/** A stated preference counts as half a success for that modality. */
export function applyChoice(model: LearnerModel, choice: Modality | "hands-on"): LearnerModel {
  const next = clone(model);
  if (choice === "hands-on")
    next.traits.challengePreference = clamp(next.traits.challengePreference + 0.04);
  else next.modality[choice].a += 0.5;
  return next;
}

/* --------------------------------------------------------------------------------------------- */
/* Feedback Processor                                                                            */
/* --------------------------------------------------------------------------------------------- */

const NEGATIVE_REACTIONS = new Set(["meh", "lost"]);

/** Did the intervention restore engagement? Compares the index before the decision with after. */
export function evaluateOutcome(args: {
  decision: Decision;
  status: OutcomeStatus;
  after: StateReading;
  eventsDuring: LearnerEvent[];
  score?: number;
}): Outcome {
  const { decision, status, after, eventsDuring } = args;
  const before = decision.reading.engagementIndex;
  const delta = after.engagementIndex - before;
  const negative = eventsDuring.some(
    (e) => e.type === "reaction" && NEGATIVE_REACTIONS.has(e.reaction),
  );
  const familyBefore = STATE_META[decision.reading.primary].family;

  let recovered = false;
  if (status === "completed") {
    if (decision.kind === "BREAK") {
      recovered = familyBefore === "depleted" || familyBefore === "overloaded" || !negative;
    } else if (familyBefore === "engaged") {
      recovered = !negative && after.engagementIndex >= before - 5;
    } else {
      recovered =
        !negative &&
        (delta >= TUNING.recovery.minDelta ||
          after.engagementIndex >= TUNING.recovery.engagedIndex);
    }
  }
  return {
    status,
    recovered,
    indexAfter: after.engagementIndex,
    delta,
    score: args.score,
    stateAfter: after.primary,
  };
}

export function applyOutcome(
  model: LearnerModel,
  decision: Decision,
  outcome: Outcome,
): { model: LearnerModel; deltas: ModelDelta[] } {
  const next = clone(model);
  const deltas: ModelDelta[] = [];
  const t = next.traits;
  const before = { ...t };
  const nudge = (trait: Trait, by: number) => {
    t[trait] = clamp(t[trait] + by);
  };

  if (next.consent.learnFromBehaviour) {
    const key = `${decision.reading.primary}|${decision.kind}`;
    const rec = next.effectiveness[key] ?? { tries: 0, recoveries: 0 };
    const rateBefore = rec.tries > 0 ? rec.recoveries / rec.tries : undefined;
    next.effectiveness[key] = {
      tries: rec.tries + 1,
      recoveries: rec.recoveries + (outcome.recovered ? 1 : 0),
    };
    const updated = next.effectiveness[key]!;
    deltas.push({
      label: `${INTERVENTION_META[decision.kind].label} when ${STATE_META[decision.reading.primary].label.toLowerCase()}`,
      from: rateBefore === undefined ? -1 : round(rateBefore, 2),
      to: round(updated.recoveries / updated.tries, 2),
    });

    const completed = outcome.status === "completed";
    t.momentum = clamp(0.75 * t.momentum + 0.25 * (completed ? 1 : 0));

    switch (decision.kind) {
      case "STRETCH_CHALLENGE":
      case "RAISE_CHALLENGE":
      case "REAL_WORLD_HOOK":
        if (completed && (decision.difficulty ?? 0) >= 4) nudge("challengePreference", 0.06);
        if (completed && outcome.recovered) nudge("challengePreference", 0.03);
        if (!completed) nudge("challengePreference", -0.03);
        if (completed && (outcome.score ?? 1) < 1) nudge("difficultyTolerance", 0.04);
        break;
      case "CURIOSITY_PATH":
        if (completed) nudge("curiosity", 0.08);
        break;
      case "PEER_MISSION":
        if (completed) nudge("socialAffinity", outcome.recovered ? 0.06 : -0.03);
        break;
      case "GUIDED_STEPS":
        if (completed && outcome.recovered) nudge("difficultyTolerance", 0.02);
        break;
      default:
        break;
    }

    if (decision.modality) {
      const counts = next.modality[decision.modality];
      if (outcome.recovered) counts.a += 1;
      else counts.b += 1;
    }
  }

  for (const trait of TRAITS) {
    if (Math.abs(t[trait] - before[trait]) >= 0.005) {
      deltas.push({
        label: TRAIT_META[trait].label,
        from: round(before[trait], 2),
        to: round(t[trait], 2),
      });
    }
  }
  return { model: next, deltas };
}

export function abilityDeltas(
  before: Record<ConceptId, number>,
  after: Record<ConceptId, number>,
): ModelDelta[] {
  return CONCEPTS.filter((c) => Math.abs(after[c] - before[c]) >= 0.05).map((c) => ({
    label: `Ability · ${c.replace("_", " ")}`,
    from: round(before[c], 2),
    to: round(after[c], 2),
  }));
}

export function rememberSeen(model: LearnerModel, activity: Activity): LearnerModel {
  if (model.seenActivities.includes(activity.id)) return model;
  return { ...model, seenActivities: [...model.seenActivities, activity.id].slice(-60) };
}

export function takeSnapshot(model: LearnerModel, timeline: TimelineEntry[]): DailySnapshot {
  const indices = timeline.map((t) => t.outcome?.indexAfter ?? t.indexBefore);
  return {
    day: model.day,
    label: `Day ${model.day}`,
    traits: { ...model.traits },
    ability: { ...model.ability },
    engagementAvg: Math.round(mean(indices)),
    decisions: timeline.length,
    recoveries: timeline.filter((t) => t.outcome?.recovered).length,
  };
}

/** Total interventions the model has learned from: a rough measure of how much history it holds. */
export function experienceOf(model: LearnerModel): number {
  return Object.values(model.effectiveness).reduce((n, r) => n + r.tries, 0);
}

/**
 * Merge two versions of the same learner's model, e.g. a device that worked offline and the copy
 * in the cloud. Deterministic and loss-averse:
 *   - effectiveness records keep whichever side has seen more of that state × intervention;
 *   - daily snapshots and seen activities are unioned;
 *   - ability, traits and modality come from the side with more overall experience
 *     (ties go to `local`, the device the learner is using right now);
 *   - consent always comes from `local`, because it reflects the learner's latest explicit choice
 *     on this device; account settings are synced separately.
 */
export function mergeLearnerModels(local: LearnerModel, remote: LearnerModel): LearnerModel {
  const primary = experienceOf(remote) > experienceOf(local) ? remote : local;
  const effectiveness: LearnerModel["effectiveness"] = { ...remote.effectiveness };
  for (const [key, rec] of Object.entries(local.effectiveness)) {
    const other = effectiveness[key];
    if (!other || rec.tries >= other.tries) effectiveness[key] = rec;
  }
  const snapshots = new Map(remote.snapshots.map((s) => [s.day, s]));
  for (const s of local.snapshots) {
    const other = snapshots.get(s.day);
    if (!other || s.decisions >= other.decisions) snapshots.set(s.day, s);
  }
  return {
    ...clone(primary),
    id: local.id,
    consent: { ...local.consent },
    interests: [...new Set([...local.interests, ...remote.interests])].slice(0, 10),
    effectiveness,
    snapshots: [...snapshots.values()].sort((a, b) => a.day - b.day),
    seenActivities: [...new Set([...remote.seenActivities, ...local.seenActivities])].slice(-60),
    sessions: Math.max(local.sessions, remote.sessions),
    day: Math.max(local.day, remote.day),
  };
}
