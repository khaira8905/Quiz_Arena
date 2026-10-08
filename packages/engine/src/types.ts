/**
 * Attune's core vocabulary. Every module in the engine speaks in these types, so any one module
 * (the state engine, the policy, the content library) can be replaced without touching the others.
 */

/* ------------------------------------------------------------------------------------------------
 * Engagement states — interaction states, never psychological or medical diagnoses.
 * ---------------------------------------------------------------------------------------------- */

export const ENGAGEMENT_STATES = [
  "FOCUSED",
  "CURIOUS",
  "EXPLORATORY",
  "UNDERCHALLENGED",
  "BORED",
  "UNMOTIVATED",
  "CONFUSED",
  "OVERWHELMED",
  "FRUSTRATED",
  "LOW_ENERGY",
  "DISCONNECTED",
] as const;
export type EngagementState = (typeof ENGAGEMENT_STATES)[number];

export type StateFamily = "engaged" | "understimulated" | "overloaded" | "depleted" | "social";

/* ------------------------------------------------------------------------------------------------
 * Interventions — what the system can choose to do next. Most are not "more content".
 * ---------------------------------------------------------------------------------------------- */

export const INTERVENTIONS = [
  "CONTINUE",
  "RAISE_CHALLENGE",
  "STRETCH_CHALLENGE",
  "REAL_WORLD_HOOK",
  "GUIDED_STEPS",
  "SWITCH_MODALITY",
  "MODALITY_CHOICE",
  "MICRO_WIN",
  "CURIOSITY_PATH",
  "PEER_MISSION",
  "REFLECTION",
  "BREAK",
] as const;
export type InterventionKind = (typeof INTERVENTIONS)[number];

export const MODALITIES = ["text", "visual", "analogy", "worked", "dialogue"] as const;
export type Modality = (typeof MODALITIES)[number];

/** Learner controls. Each one is both evidence for the state engine and a hard constraint. */
export const CONTROLS = [
  "TOO_EASY",
  "TOO_HARD",
  "EXPLAIN_DIFFERENTLY",
  "CHALLENGE_ME",
  "EXPLORE",
  "NOT_INTERESTED",
  "CHANGE_ACTIVITY",
  "BREAK",
] as const;
export type ControlAction = (typeof CONTROLS)[number];

export const FEELINGS = [
  "bored",
  "confused",
  "overwhelmed",
  "tired",
  "curious",
  "meh",
  "alone",
  "okay",
  "motivated",
] as const;
export type Feeling = (typeof FEELINGS)[number];

export const REACTIONS = ["aha", "fun", "meh", "lost"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const CONCEPTS = ["doubling", "percent", "doubling_time", "logs", "modelling"] as const;
export type ConceptId = (typeof CONCEPTS)[number];

/** Interest frames the content library can speak in. Learners may mention others; they're kept. */
export const FRAMES = ["cricket", "startups", "music", "gaming", "space"] as const;
export type Frame = (typeof FRAMES)[number];

export type ConnectivityMode = "full" | "light" | "offline";

/* ------------------------------------------------------------------------------------------------
 * Events — the append-only, syncable record of what happened. Each carries an id for idempotency.
 * ---------------------------------------------------------------------------------------------- */

interface EventBase {
  id: string;
  at: number;
}

export type SelfAssessment = "confident" | "unsure" | "lost";

export interface CheckinEvent extends EventBase {
  type: "checkin";
  feeling: Feeling;
  /** 1 (empty) to 5 (sharp). */
  energy: number;
  timeBudgetMin: number;
  /** A full check-in comes from onboarding; a partial one is "I'm feeling…" mid-session. */
  partial: boolean;
  selfAssessment?: SelfAssessment;
  intent?: Intent;
}

export type Intent = "finish" | "understand" | "interesting" | "company" | "start";

export interface ActivityStartedEvent extends EventBase {
  type: "activity_started";
  activityId: string;
  kind: InterventionKind;
}

export interface AnswerEvent extends EventBase {
  type: "answer";
  activityId: string;
  conceptId: ConceptId;
  difficulty: number;
  correct: boolean;
  latencyMs: number;
  usedHint: boolean;
  /** 1 for the first try at this question; 2+ when the learner retries after a miss. */
  attempt?: number;
}

export interface HintEvent extends EventBase {
  type: "hint";
  activityId: string;
}

export interface ControlEvent extends EventBase {
  type: "control";
  action: ControlAction;
}

export interface ReactionEvent extends EventBase {
  type: "reaction";
  reaction: Reaction;
}

export interface ActivityCompletedEvent extends EventBase {
  type: "activity_completed";
  activityId: string;
  dwellMs: number;
  /** 0–1, for activities with answers. */
  score?: number;
}

export interface ActivityAbandonedEvent extends EventBase {
  type: "activity_abandoned";
  activityId: string;
  dwellMs: number;
}

export interface ChoiceEvent extends EventBase {
  type: "choice";
  choice: Modality | "hands-on";
}

export interface ReflectionEvent extends EventBase {
  type: "reflection";
  /** 1 = not useful, 2 = somewhat, 3 = useful. */
  usefulness: number;
  /** Reduced to its length on sync; the text itself never leaves the device. */
  note?: string;
}

/** The learner helped a peer (explained a step in a mission). */
export interface AssistEvent extends EventBase {
  type: "assist";
  activityId: string;
}

export type LearnerEvent =
  | CheckinEvent
  | ActivityStartedEvent
  | AnswerEvent
  | HintEvent
  | ControlEvent
  | ReactionEvent
  | ActivityCompletedEvent
  | ActivityAbandonedEvent
  | ChoiceEvent
  | ReflectionEvent
  | AssistEvent;

export type LearnerEventType = LearnerEvent["type"];

/** An event as submitted by a client, before the orchestrator stamps id/time. */
export type LearnerEventInput = LearnerEvent extends infer E
  ? E extends LearnerEvent
    ? Omit<E, "id" | "at">
    : never
  : never;

/* ------------------------------------------------------------------------------------------------
 * Learner model — the evolving "digital twin".
 * ---------------------------------------------------------------------------------------------- */

export const TRAITS = [
  "curiosity",
  "challengePreference",
  "momentum",
  "consistency",
  "socialAffinity",
  "difficultyTolerance",
] as const;
export type Trait = (typeof TRAITS)[number];

/** Beta-distribution counts: successes (a) and failures (b), including the prior. */
export interface BetaCounts {
  a: number;
  b: number;
}

export interface EffectivenessRecord {
  tries: number;
  recoveries: number;
}

export interface DailySnapshot {
  day: number;
  label: string;
  /** The model as it was when the day began, so "yesterday" can show movement. */
  start?: { traits: Record<Trait, number>; ability: Record<ConceptId, number> };
  traits: Record<Trait, number>;
  ability: Record<ConceptId, number>;
  engagementAvg: number;
  decisions: number;
  recoveries: number;
}

export interface Consent {
  /** Update the model from behaviour (answers, latency). Off = self-report only. */
  learnFromBehaviour: boolean;
  /** Share an aggregate summary (never raw events) with a mentor. */
  shareWithMentor: boolean;
  /** Allow the AI gateway to rewrite explanations. Off = library content only. */
  useAiGateway: boolean;
}

export interface LearnerModel {
  id: string;
  displayName: string;
  goal: string;
  goalConcept: ConceptId;
  interests: string[];
  traits: Record<Trait, number>;
  /** Ability θ per concept on the 1–5 difficulty scale. */
  ability: Record<ConceptId, number>;
  modality: Record<Modality, BetaCounts>;
  /** Keyed by `${EngagementState}|${InterventionKind}`. */
  effectiveness: Record<string, EffectivenessRecord>;
  context: {
    energy: number;
    timeBudgetMin: number;
    sharedDevice: boolean;
    selfAssessment?: SelfAssessment;
  };
  snapshots: DailySnapshot[];
  consent: Consent;
  /** Activity ids already served, so later sessions bring something new. Capped. */
  seenActivities: string[];
  sessions: number;
  day: number;
}

/* ------------------------------------------------------------------------------------------------
 * Activities — what the learner actually sees.
 * ---------------------------------------------------------------------------------------------- */

export interface Choice {
  prompt: string;
  options: string[];
  answerIndex: number;
  hint?: string;
  /** Shown after answering. */
  explanation?: string;
}

interface ActivityBase {
  id: string;
  title: string;
  conceptId: ConceptId;
}

export interface QuestionActivity extends ActivityBase, Choice {
  type: "question";
  difficulty: number;
}

export type VisualKind = "growth-compare" | "doubling-ladder" | "compound-bars";

export type ExplanationBody =
  | { modality: "text"; paragraphs: string[] }
  | { modality: "analogy"; paragraphs: string[] }
  | { modality: "visual"; visual: VisualKind; caption: string; paragraphs: string[] }
  | { modality: "worked"; problem: string; steps: { label: string; work: string }[] }
  | { modality: "dialogue"; lines: { speaker: "you" | "guide"; text: string }[] };

export interface ExplanationActivity extends ActivityBase {
  type: "explanation";
  modality: Modality;
  body: ExplanationBody;
  /** Text-only rendering for LIGHT mode and screen readers. */
  textFallback: string;
  takeaway: string;
}

export interface GuidedActivity extends ActivityBase {
  type: "guided";
  difficulty: number;
  intro: string;
  steps: (Choice & { reveal: string })[];
}

export interface ChallengeActivity extends ActivityBase {
  type: "challenge";
  difficulty: number;
  frame: Frame;
  scenario: string;
  parts: Choice[];
  /** Set by the activity engine for stretch challenges; optional pressure, never a penalty. */
  timeLimitSec?: number;
}

export interface MicroActivity extends ActivityBase, Choice {
  type: "micro";
  cheer: string;
}

export interface CuriosityNode {
  id: string;
  title: string;
  body: string;
  check?: Choice;
  next: { nodeId: string; label: string }[];
  /** This node connects the tangent back to the syllabus. */
  returnsToSyllabus?: boolean;
}

export interface CuriosityActivity extends ActivityBase {
  type: "curiosity";
  hook: string;
  frame: Frame | "everyday";
  startNodeId: string;
  nodes: CuriosityNode[];
}

export interface Peer {
  name: string;
  interest: string;
  role: string;
  contribution: string;
}

export interface MissionActivity extends ActivityBase {
  type: "mission";
  difficulty: number;
  brief: string;
  peers: Peer[];
  yourPart: Choice;
  teachBack: Choice;
  verdict: string;
}

export interface ChoiceActivity extends ActivityBase {
  type: "choice";
  prompt: string;
  options: { choice: Modality | "hands-on"; label: string; description: string }[];
}

export interface ReflectionActivity extends ActivityBase {
  type: "reflection";
  prompt: string;
  placeholder: string;
}

export interface BreakActivity extends ActivityBase {
  type: "break";
  minutes: number;
  body: string;
  suggestions: string[];
  /** "This is a good place to stop" rather than "rest and come back". */
  stopHere: boolean;
}

export type Activity =
  | QuestionActivity
  | ExplanationActivity
  | GuidedActivity
  | ChallengeActivity
  | MicroActivity
  | CuriosityActivity
  | MissionActivity
  | ChoiceActivity
  | ReflectionActivity
  | BreakActivity;

export type ActivityType = Activity["type"];

/* ------------------------------------------------------------------------------------------------
 * Engine outputs.
 * ---------------------------------------------------------------------------------------------- */

/** One piece of evidence, in plain language. */
export interface Signal {
  key: string;
  value: number;
  /** "You answered 3 in a row correctly, about 5s each" — used verbatim by the Why layer. */
  detail: string;
  source: "self-report" | "behaviour" | "control" | "history";
}

export interface StateReading {
  primary: EngagementState;
  secondary: EngagementState;
  confidence: number;
  distribution: { state: EngagementState; p: number }[];
  /** Evidence for the primary state, strongest first. */
  evidence: Signal[];
  signals: Signal[];
  engagementIndex: number;
  knowledgeHigh: boolean;
}

export interface Constraints {
  forceKind?: InterventionKind;
  allowedKinds?: InterventionKind[];
  excludeKinds?: InterventionKind[];
  minDifficulty?: number;
  maxDifficulty?: number;
  excludeModalities?: Modality[];
  preferModality?: Modality;
  excludeFrames?: string[];
  /** The learner action that produced these constraints. */
  cause?: ControlAction | "mood" | "choice";
}

export interface ScoredCandidate {
  kind: InterventionKind;
  prior: number;
  learned: number;
  context: number;
  novelty: number;
  score: number;
  /** Why this candidate was ranked where it was; shown for the alternatives. */
  note: string;
  ruleInsight?: string;
}

export interface LearnedNote {
  state: EngagementState;
  kind: InterventionKind;
  tries: number;
  recoveries: number;
  text: string;
}

export interface Rationale {
  /** One sentence: evidence, then action. */
  summary: string;
  headline: string;
  because: string[];
  watching: string;
  learned?: string;
  alternatives: { kind: InterventionKind; label: string; why: string }[];
}

export type DecisionTrigger =
  | "start"
  | "completed"
  | "abandoned"
  | "mood"
  | "choice"
  | "reflection"
  | `control:${ControlAction}`;

export interface Decision {
  id: string;
  at: number;
  trigger: DecisionTrigger;
  reading: StateReading;
  kind: InterventionKind;
  activity: Activity;
  difficulty?: number;
  modality?: Modality;
  frame?: string;
  focusConcept: ConceptId;
  candidates: ScoredCandidate[];
  constraints: Constraints;
  rationale: Rationale;
  learned?: LearnedNote;
  /** True when a learned pattern (not just the rule table) decided this. */
  patternRecognized: boolean;
}

export type OutcomeStatus = "completed" | "abandoned" | "interrupted";

export interface Outcome {
  status: OutcomeStatus;
  recovered: boolean;
  indexAfter: number;
  delta: number;
  score?: number;
  stateAfter: EngagementState;
}

export interface ModelDelta {
  label: string;
  from: number;
  to: number;
}

export interface TimelineEntry {
  decisionId: string;
  at: number;
  kind: InterventionKind;
  state: EngagementState;
  indexBefore: number;
  title: string;
  difficulty?: number;
  modality?: Modality;
  outcome?: Outcome;
  modelDelta?: ModelDelta[];
}
