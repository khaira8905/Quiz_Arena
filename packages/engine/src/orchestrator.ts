import { serveActivity, focusConcept, type ActivityRequest } from "./activity-engine";
import { INTERVENTION_META } from "./config";
import {
  abilityDeltas,
  applyAnswer,
  applyCheckin,
  applyChoice,
  applyControl,
  applyOutcome,
  evaluateOutcome,
  rememberSeen,
  takeSnapshot,
} from "./learner-model";
import { selectIntervention } from "./policy";
import { readState } from "./state-engine";
import type {
  CheckinEvent,
  ConceptId,
  ConnectivityMode,
  Constraints,
  ControlAction,
  Decision,
  DecisionTrigger,
  InterventionKind,
  LearnerEvent,
  LearnerEventInput,
  LearnerModel,
  Modality,
  OutcomeStatus,
  StateReading,
  TimelineEntry,
} from "./types";
import { explainDecision } from "./why";

/**
 * Session Orchestrator: the Detect → Understand → Intervene → Observe → Adapt loop as a pure
 * reducer. The app calls `dispatch` with each learner event; when an activity ends (or the learner
 * takes control), the orchestrator evaluates the outcome, updates the learner model, reads the
 * state again and chooses the next intervention.
 */

export interface SessionState {
  id: string;
  startedAt: number;
  now: number;
  mode: ConnectivityMode;
  learner: LearnerModel;
  /** The model when the session began: the baseline for "how did today change things". */
  learnerAtStart: { traits: LearnerModel["traits"]; ability: LearnerModel["ability"] };
  events: LearnerEvent[];
  decisions: Decision[];
  timeline: TimelineEntry[];
  current?: Decision;
  /** Ability at the moment the current decision was made, for Observe-step deltas. */
  abilityAtDecision?: LearnerModel["ability"];
  /** Index into `events` where the current activity began. */
  currentEventStart: number;
  seq: number;
  /** The engine thinks this is a good place to stop. */
  suggestEnd: boolean;
  endedAt?: number;
}

export type CheckinInput = Omit<CheckinEvent, "id" | "at" | "type">;

export interface StartOptions {
  id: string;
  learner: LearnerModel;
  checkin: CheckinInput;
  now: number;
  mode?: ConnectivityMode;
}

export function startSession(opts: StartOptions): SessionState {
  let state: SessionState = {
    id: opts.id,
    startedAt: opts.now,
    now: opts.now,
    mode: opts.mode ?? "full",
    learner: opts.learner,
    learnerAtStart: { traits: { ...opts.learner.traits }, ability: { ...opts.learner.ability } },
    events: [],
    decisions: [],
    timeline: [],
    currentEventStart: 0,
    seq: 0,
    suggestEnd: false,
  };
  state = append(state, { type: "checkin", ...opts.checkin } as LearnerEventInput, opts.now);
  state = { ...state, learner: applyCheckin(state.learner, state.events[0] as CheckinEvent) };
  return decide(state, "start", {});
}

function append(state: SessionState, input: LearnerEventInput, now: number): SessionState {
  const event = { ...input, id: `${state.id}:${state.seq}`, at: now } as LearnerEvent;
  return { ...state, now, seq: state.seq + 1, events: [...state.events, event] };
}

export function setMode(state: SessionState, mode: ConnectivityMode): SessionState {
  return { ...state, mode };
}

/** Elapsed minutes in the session. */
export function elapsedMinutes(state: SessionState, now = state.now): number {
  return (now - state.startedAt) / 60000;
}

export function dispatch(state: SessionState, input: LearnerEventInput, now: number): SessionState {
  if (state.endedAt) return state;
  let next = append(state, input, now);
  const event = next.events[next.events.length - 1]!;
  const current = next.current;
  const concept = (current?.activity.conceptId ?? focusConcept(next.learner)) as ConceptId;

  switch (event.type) {
    case "answer":
      next = { ...next, learner: applyAnswer(next.learner, event) };
      return next;
    case "hint":
    case "reaction":
    case "assist":
    case "activity_started":
      return next;
    case "activity_completed":
    case "activity_abandoned": {
      if (!current || event.activityId !== current.activity.id) return next;
      const status: OutcomeStatus = event.type === "activity_completed" ? "completed" : "abandoned";
      const score = event.type === "activity_completed" ? event.score : undefined;
      next = closeCurrent(next, status, score);
      if (
        current.activity.type === "break" &&
        current.activity.stopHere &&
        status === "completed"
      ) {
        return { ...next, suggestEnd: true, current: undefined };
      }
      return decide(next, status === "completed" ? "completed" : "abandoned", {});
    }
    case "control": {
      next = { ...next, learner: applyControl(next.learner, event.action, concept) };
      next = closeCurrent(next, "interrupted");
      return decide(next, `control:${event.action}`, constraintsForControl(event.action, current));
    }
    case "checkin": {
      next = { ...next, learner: applyCheckin(next.learner, event) };
      next = closeCurrent(next, "interrupted");
      const constraints: Constraints = { cause: "mood" };
      if ((event.feeling === "bored" || event.feeling === "meh") && current)
        constraints.excludeKinds = [current.kind];
      if (event.feeling === "confused" && current?.modality)
        constraints.excludeModalities = [current.modality];
      return decide(next, "mood", constraints);
    }
    case "choice": {
      next = { ...next, learner: applyChoice(next.learner, event.choice) };
      next = closeCurrent(next, "completed");
      const constraints: Constraints =
        event.choice === "hands-on"
          ? { cause: "choice", forceKind: "REAL_WORLD_HOOK" }
          : { cause: "choice", forceKind: "SWITCH_MODALITY", preferModality: event.choice };
      return decide(next, "choice", constraints);
    }
    case "reflection": {
      next = closeCurrent(next, "completed");
      return decide(next, "reflection", {});
    }
  }
}

function constraintsForControl(action: ControlAction, current?: Decision): Constraints {
  const d = current?.difficulty;
  switch (action) {
    case "TOO_EASY":
      return {
        cause: action,
        allowedKinds: ["RAISE_CHALLENGE", "STRETCH_CHALLENGE"],
        minDifficulty: d !== undefined ? d + 1 : undefined,
      };
    case "TOO_HARD":
      return {
        cause: action,
        allowedKinds: ["GUIDED_STEPS", "MICRO_WIN", "SWITCH_MODALITY", "CONTINUE"],
        maxDifficulty: Math.max(1, (d ?? 2) - 1),
      };
    case "EXPLAIN_DIFFERENTLY":
      return {
        cause: action,
        forceKind: "SWITCH_MODALITY",
        excludeModalities: current?.modality ? [current.modality] : undefined,
      };
    case "CHALLENGE_ME":
      return {
        cause: action,
        forceKind: "STRETCH_CHALLENGE",
        minDifficulty: d !== undefined ? d + 1 : undefined,
      };
    case "EXPLORE":
      return { cause: action, forceKind: "CURIOSITY_PATH" };
    case "NOT_INTERESTED":
      return {
        cause: action,
        excludeKinds: current ? [current.kind] : undefined,
        excludeFrames: current?.frame ? [current.frame] : undefined,
      };
    case "CHANGE_ACTIVITY":
      return { cause: action, excludeKinds: current ? [current.kind] : undefined };
    case "BREAK":
      return { cause: action, forceKind: "BREAK" };
  }
}

function readNow(state: SessionState, concept?: ConceptId): StateReading {
  return readState({
    events: state.events,
    learner: state.learner,
    focusConcept: concept ?? focusConcept(state.learner),
    sessionStartedAt: state.startedAt,
    now: state.now,
  });
}

/** Observe + Adapt: evaluate how the current activity went and update the learner model. */
function closeCurrent(state: SessionState, status: OutcomeStatus, score?: number): SessionState {
  const current = state.current;
  if (!current) return state;
  const after = readNow(state);
  const eventsDuring = state.events.slice(state.currentEventStart);
  const outcome = evaluateOutcome({ decision: current, status, after, eventsDuring, score });
  const { model, deltas } = applyOutcome(state.learner, current, outcome);
  const modelDelta = [
    ...abilityDeltas(state.abilityAtDecision ?? model.ability, model.ability),
    ...deltas,
  ];
  const timeline = state.timeline.map((t) =>
    t.decisionId === current.id ? { ...t, outcome, modelDelta } : t,
  );
  return { ...state, learner: model, timeline, current: undefined };
}

/** Detect → Understand → Intervene. */
function decide(
  state: SessionState,
  trigger: DecisionTrigger,
  constraints: Constraints,
): SessionState {
  const previous = state.decisions[state.decisions.length - 1];
  // "Explain differently" is about the thing on screen, not the next concept in the plan.
  const concept =
    constraints.cause === "EXPLAIN_DIFFERENTLY" && previous
      ? previous.activity.conceptId
      : focusConcept(state.learner);
  const reading = readNow(state, concept);
  const elapsedMin = elapsedMinutes(state);
  const seen = new Set(state.decisions.map((d) => d.activity.id));
  const seenBefore = new Set(state.learner.seenActivities);
  const shownModalities = state.decisions
    .filter((d) => d.modality && d.activity.conceptId === concept)
    .map((d) => d.modality as Modality);
  const lastDifficulty = [...state.decisions]
    .reverse()
    .find((d) => d.difficulty !== undefined)?.difficulty;
  const lastOutcome = [...state.timeline].reverse().find((t) => t.outcome)?.outcome;
  const lastScore = lastOutcome?.status === "completed" ? (lastOutcome.score ?? 1) : 0;
  const stopRecommended =
    elapsedMin > state.learner.context.timeBudgetMin ||
    (state.learner.context.energy <= 2 && elapsedMin > 12) ||
    (reading.primary === "LOW_ENERGY" && elapsedMin > 8);

  const request = (kind: InterventionKind, c: Constraints): ActivityRequest => ({
    kind,
    learner: state.learner,
    reading,
    constraints: c,
    focusConcept: concept,
    seen,
    seenBefore,
    shownModalities,
    lastDifficulty,
    lastScore,
    mode: state.mode,
    stopRecommended,
  });

  // A forced kind with nothing left to serve falls back to the policy, honestly noted.
  let effective = constraints;
  let fallbackNote: string | undefined;
  if (constraints.forceKind && !serveActivity(request(constraints.forceKind, constraints))) {
    fallbackNote = `There's nothing new of that kind (${INTERVENTION_META[constraints.forceKind].label.toLowerCase()}) left, so here's the closest thing.`;
    effective = { ...constraints, forceKind: undefined };
  }

  const policy = selectIntervention({
    reading,
    learner: state.learner,
    constraints: effective,
    history: state.timeline,
    mode: state.mode,
    elapsedMin,
    canServe: (kind) => serveActivity(request(kind, effective)) !== undefined,
  });
  const served =
    serveActivity(request(policy.chosen.kind, effective)) ??
    serveActivity(request("CONTINUE", {}))!;
  if (fallbackNote) served.note = fallbackNote;

  const rationale = explainDecision({
    reading,
    chosen: policy.chosen,
    candidates: policy.candidates,
    constraints: effective,
    learned: policy.learned,
    served,
    focusConcept: concept,
    goalConcept: state.learner.goalConcept,
  });

  const decision: Decision = {
    id: `${state.id}:d${state.decisions.length}`,
    at: state.now,
    trigger,
    reading,
    kind: policy.chosen.kind,
    activity: served.activity,
    difficulty: served.difficulty,
    modality: served.modality,
    frame: served.frame,
    focusConcept: concept,
    candidates: policy.candidates,
    constraints: effective,
    rationale,
    learned: policy.learned,
    patternRecognized: policy.patternRecognized,
  };
  const entry: TimelineEntry = {
    decisionId: decision.id,
    at: state.now,
    kind: decision.kind,
    state: reading.primary,
    indexBefore: reading.engagementIndex,
    title: served.activity.title,
    difficulty: served.difficulty,
    modality: served.modality,
  };

  let next: SessionState = {
    ...state,
    decisions: [...state.decisions, decision],
    timeline: [...state.timeline, entry],
    current: decision,
    abilityAtDecision: { ...state.learner.ability },
    learner: rememberSeen(state.learner, served.activity),
    suggestEnd: served.activity.type === "break" && served.activity.stopHere,
  };
  next = append(
    next,
    { type: "activity_started", activityId: served.activity.id, kind: decision.kind },
    state.now,
  );
  return { ...next, currentEventStart: next.events.length - 1 };
}

/** End the session: close what's open and take a snapshot of the twin for "yesterday vs today". */
export function endSession(state: SessionState, now: number): SessionState {
  if (state.endedAt) return state;
  let next: SessionState = { ...state, now };
  next = closeCurrent(next, "abandoned");
  const snapshot = { ...takeSnapshot(next.learner, next.timeline), start: next.learnerAtStart };
  const snapshots = [...next.learner.snapshots.filter((s) => s.day !== snapshot.day), snapshot];
  return {
    ...next,
    learner: { ...next.learner, snapshots, sessions: next.learner.sessions + 1 },
    endedAt: now,
  };
}

/** Close today and open tomorrow's session with a fresh check-in. The learner model carries over. */
export function nextDay(
  state: SessionState,
  checkin: CheckinInput,
  now: number,
  id: string,
): SessionState {
  const ended = endSession(state, state.now);
  const learner = { ...ended.learner, day: ended.learner.day + 1 };
  return startSession({ id, learner, checkin, now, mode: state.mode });
}

/** The learner chose to keep going after the engine suggested stopping. */
export function resumeSession(state: SessionState, now: number): SessionState {
  if (state.endedAt) return state;
  const next = closeCurrent({ ...state, now, suggestEnd: false }, "completed");
  return decide(next, "completed", { excludeKinds: ["BREAK"] });
}

/** Start a specific kind of experience on request (e.g. joining a mission from Community). */
export function requestIntervention(
  state: SessionState,
  kind: InterventionKind,
  now: number,
): SessionState {
  if (state.endedAt) return state;
  const next = closeCurrent({ ...state, now }, "interrupted");
  return decide(next, "choice", { cause: "choice", forceKind: kind });
}
