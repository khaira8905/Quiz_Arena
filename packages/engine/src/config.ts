import type {
  ConceptId,
  ControlAction,
  EngagementState,
  Feeling,
  InterventionKind,
  Modality,
  StateFamily,
  Trait,
} from "./types";

/**
 * Every tunable number in the engine lives here. Weights are hand-set priors: readable, testable,
 * and meant to be replaced by fitted values once real outcome data exists.
 */

/* --------------------------------------------------------------------------------------------- */
/* States                                                                                        */
/* --------------------------------------------------------------------------------------------- */

export interface StateMeta {
  label: string;
  family: StateFamily;
  /** How engaged this state is, 0–1. Drives the engagement index. */
  valence: number;
  /** Plain description, written as an interaction pattern, never a diagnosis. */
  describe: string;
}

export const STATE_META: Record<EngagementState, StateMeta> = {
  FOCUSED: {
    label: "Focused",
    family: "engaged",
    valence: 0.92,
    describe: "Working steadily at a level that fits.",
  },
  CURIOUS: {
    label: "Curious",
    family: "engaged",
    valence: 0.9,
    describe: "Asking why, following threads.",
  },
  EXPLORATORY: {
    label: "Exploring",
    family: "engaged",
    valence: 0.85,
    describe: "Wandering productively beyond the task.",
  },
  UNDERCHALLENGED: {
    label: "Under-challenged",
    family: "understimulated",
    valence: 0.5,
    describe: "Getting things right without having to think.",
  },
  BORED: {
    label: "Bored",
    family: "understimulated",
    valence: 0.25,
    describe: "The task isn't holding attention.",
  },
  UNMOTIVATED: {
    label: "Unmotivated",
    family: "understimulated",
    valence: 0.2,
    describe: "Not seeing why this matters right now.",
  },
  CONFUSED: {
    label: "Confused",
    family: "overloaded",
    valence: 0.45,
    describe: "The explanation isn't landing yet.",
  },
  OVERWHELMED: {
    label: "Overwhelmed",
    family: "overloaded",
    valence: 0.25,
    describe: "Too much at once; steps feel too big.",
  },
  FRUSTRATED: {
    label: "Frustrated",
    family: "overloaded",
    valence: 0.15,
    describe: "Repeated misses; starting to guess.",
  },
  LOW_ENERGY: {
    label: "Low energy",
    family: "depleted",
    valence: 0.3,
    describe: "Running low; effort is expensive right now.",
  },
  DISCONNECTED: {
    label: "On your own",
    family: "social",
    valence: 0.35,
    describe: "Working alone with it, and it shows.",
  },
};

export const FAMILY_META: Record<StateFamily, { label: string }> = {
  engaged: { label: "Engaged" },
  understimulated: { label: "Under-stimulated" },
  overloaded: { label: "Overloaded" },
  depleted: { label: "Depleted" },
  social: { label: "Disconnected" },
};

/* --------------------------------------------------------------------------------------------- */
/* Interventions                                                                                 */
/* --------------------------------------------------------------------------------------------- */

export interface InterventionMeta {
  label: string;
  /** Interactive interventions ask the learner to do something; passive ones present. */
  interactive: boolean;
  /** Academic interventions advance the syllabus directly. */
  academic: boolean;
  describe: string;
}

export const INTERVENTION_META: Record<InterventionKind, InterventionMeta> = {
  CONTINUE: {
    label: "Keep going",
    interactive: true,
    academic: true,
    describe: "Practice at the current, well-fitted level.",
  },
  RAISE_CHALLENGE: {
    label: "Raise the challenge",
    interactive: true,
    academic: true,
    describe: "A harder question; difficulty strictly increases.",
  },
  STRETCH_CHALLENGE: {
    label: "Stretch challenge",
    interactive: true,
    academic: true,
    describe: "A timed, multi-part real problem.",
  },
  REAL_WORLD_HOOK: {
    label: "Real-world problem",
    interactive: true,
    academic: true,
    describe: "The same idea, in something you care about.",
  },
  GUIDED_STEPS: {
    label: "Guided steps",
    interactive: true,
    academic: true,
    describe: "One problem, broken into checked steps.",
  },
  SWITCH_MODALITY: {
    label: "Explain differently",
    interactive: false,
    academic: true,
    describe: "A different way of showing the same idea.",
  },
  MODALITY_CHOICE: {
    label: "Your choice",
    interactive: true,
    academic: true,
    describe: "You pick how to look at it next.",
  },
  MICRO_WIN: {
    label: "Small win",
    interactive: true,
    academic: true,
    describe: "Something tiny and doable to restart momentum.",
  },
  CURIOSITY_PATH: {
    label: "Curiosity path",
    interactive: true,
    academic: false,
    describe: "Follow a tangent that loops back to the syllabus.",
  },
  PEER_MISSION: {
    label: "Peer mission",
    interactive: true,
    academic: false,
    describe: "A short mission with two others, where your part matters.",
  },
  REFLECTION: {
    label: "Reflect",
    interactive: true,
    academic: false,
    describe: "One line to lock in what clicked.",
  },
  BREAK: {
    label: "Break",
    interactive: false,
    academic: false,
    describe: "Step away. Sometimes the best next step is to stop.",
  },
};

export const MODALITY_META: Record<Modality, { label: string; phrase: string }> = {
  text: { label: "Plain text", phrase: "in plain words" },
  visual: { label: "Visual", phrase: "as a picture you can play with" },
  analogy: { label: "Analogy", phrase: "as an everyday analogy" },
  worked: { label: "Worked example", phrase: "as a worked example, step by step" },
  dialogue: { label: "Conversation", phrase: "as a back-and-forth conversation" },
};

export const CONTROL_META: Record<ControlAction, { label: string; said: string }> = {
  TOO_EASY: { label: "Too easy", said: "You said this was too easy." },
  TOO_HARD: { label: "Too difficult", said: "You said this was too difficult." },
  EXPLAIN_DIFFERENTLY: {
    label: "Explain differently",
    said: "You asked for a different explanation.",
  },
  CHALLENGE_ME: { label: "Give me a challenge", said: "You asked for a challenge." },
  EXPLORE: { label: "Let me explore", said: "You asked to explore." },
  NOT_INTERESTED: { label: "Not interested", said: "You said this didn't interest you." },
  CHANGE_ACTIVITY: { label: "Something else", said: "You asked for something different." },
  BREAK: { label: "Take a break", said: "You asked for a break." },
};

export const FEELING_META: Record<Feeling, { label: string }> = {
  bored: { label: "Bored" },
  confused: { label: "Confused" },
  overwhelmed: { label: "Overwhelmed" },
  tired: { label: "Tired" },
  curious: { label: "Curious" },
  meh: { label: "Meh" },
  alone: { label: "On my own with it" },
  okay: { label: "Okay" },
  motivated: { label: "Up for it" },
};

export const CONCEPT_META: Record<ConceptId, { label: string; short: string }> = {
  doubling: { label: "Doubling & repeated multiplication", short: "Doubling" },
  percent: { label: "Percentage growth & compounding", short: "Compounding" },
  doubling_time: { label: "Doubling time", short: "Doubling time" },
  logs: { label: "Logarithms", short: "Logs" },
  modelling: { label: "Modelling with exponentials", short: "Modelling" },
};

/** Each concept builds on the one before it. */
export const CONCEPT_ORDER: ConceptId[] = [
  "doubling",
  "percent",
  "doubling_time",
  "logs",
  "modelling",
];

export const TRAIT_META: Record<Trait, { label: string; low: string; high: string }> = {
  curiosity: { label: "Curiosity", low: "Sticks to the task", high: "Follows tangents" },
  challengePreference: {
    label: "Challenge appetite",
    low: "Prefers safe practice",
    high: "Wants hard problems",
  },
  momentum: { label: "Learning momentum", low: "Stalling", high: "Rolling" },
  consistency: { label: "Consistency", low: "Irregular", high: "Shows up regularly" },
  socialAffinity: { label: "Social energy", low: "Prefers solo", high: "Energised by others" },
  difficultyTolerance: {
    label: "Difficulty tolerance",
    low: "Needs small steps",
    high: "Comfortable struggling",
  },
};

/* --------------------------------------------------------------------------------------------- */
/* State engine weights                                                                          */
/* --------------------------------------------------------------------------------------------- */

/** feature → (state → weight). A state's score is Σ feature value × weight. */
export const FEATURE_WEIGHTS: Record<string, Partial<Record<EngagementState, number>>> = {
  baseline: { FOCUSED: 0.5 },

  self_bored: { BORED: 2.6, UNDERCHALLENGED: 0.6 },
  self_confused: { CONFUSED: 2.6 },
  self_overwhelmed: { OVERWHELMED: 2.6, CONFUSED: 0.4 },
  self_tired: { LOW_ENERGY: 2.6 },
  self_curious: { CURIOUS: 2.4, EXPLORATORY: 1.0 },
  self_meh: { UNMOTIVATED: 2.4, BORED: 0.6 },
  self_alone: { DISCONNECTED: 2.6 },
  self_okay: { FOCUSED: 1.0 },
  self_motivated: { FOCUSED: 1.6 },
  self_confident: { UNDERCHALLENGED: 0.6 },
  self_lost: { OVERWHELMED: 0.6, CONFUSED: 0.6 },
  energy_low: { LOW_ENERGY: 1.6, UNMOTIVATED: 0.3 },

  easy_streak: { UNDERCHALLENGED: 2.4, BORED: 0.6, FOCUSED: -0.4 },
  in_zone: { FOCUSED: 1.8 },
  low_accuracy: { CONFUSED: 1.4, OVERWHELMED: 0.8, FOCUSED: -0.6 },
  slow: { OVERWHELMED: 1.2, LOW_ENERGY: 0.4 },
  guessing: { FRUSTRATED: 1.8, UNMOTIVATED: 0.6 },
  hints: { OVERWHELMED: 1.0, CONFUSED: 0.6 },
  abandons: { BORED: 1.2, UNMOTIVATED: 1.0 },
  concept_struggle: { CONFUSED: 1.2, FRUSTRATED: 1.0 },
  retrying: { CONFUSED: 1.6, FRUSTRATED: 0.5, OVERWHELMED: 0.3 },
  mastery_high: { UNDERCHALLENGED: 0.8 },

  ctrl_too_easy: { UNDERCHALLENGED: 3.0 },
  ctrl_too_hard: { OVERWHELMED: 2.6, CONFUSED: 0.6 },
  ctrl_explain: { CONFUSED: 2.8 },
  ctrl_challenge: { UNDERCHALLENGED: 2.6 },
  ctrl_explore: { EXPLORATORY: 2.8, CURIOUS: 0.8 },
  ctrl_not_interested: { UNMOTIVATED: 2.6, BORED: 0.6 },
  ctrl_change: { BORED: 1.6, UNMOTIVATED: 0.8 },
  ctrl_break: { LOW_ENERGY: 2.8 },

  react_aha: { CURIOUS: 1.0, FOCUSED: 1.0 },
  react_fun: { FOCUSED: 1.2, CURIOUS: 0.5 },
  react_meh: { UNMOTIVATED: 1.2, BORED: 1.0 },
  react_lost: { CONFUSED: 2.0 },

  curiosity_trail: { EXPLORATORY: 1.4, CURIOUS: 0.8 },
  momentum: { FOCUSED: 1.6 },
  over_budget: { LOW_ENERGY: 1.4 },
  social_need: { DISCONNECTED: 0.8 },
  peer_connected: { DISCONNECTED: -1.5, FOCUSED: 0.6 },
};

/**
 * Mid-session mood check-ins ("I'm feeling…") are the learner telling us something right now, so
 * they carry more weight than inference from behaviour: `now_*` = `self_*` × 1.6.
 */
for (const [key, weights] of Object.entries(FEATURE_WEIGHTS)) {
  if (!key.startsWith("self_")) continue;
  FEATURE_WEIGHTS[`now_${key.slice(5)}`] = Object.fromEntries(
    Object.entries(weights).map(([state, w]) => [state, (w as number) * 1.6]),
  );
}

export const TUNING = {
  /** Softmax temperature over state scores. Lower = more decisive. */
  temperature: 0.55,
  /** Per-activity decay of self-reports, controls and reactions. */
  decay: { selfReport: 0.55, control: 0.3, reaction: 0.5 },
  /** Answers considered by the behaviour features. */
  answerWindow: 6,
  /** Logistic slope of P(correct) = σ(slope·(θ − d)). */
  abilitySlope: 1.4,
  /** Ability update step size. */
  abilityStep: 0.6,
  /** Target probability of success by state family when calibrating difficulty. */
  targetSuccess: {
    engaged: 0.7,
    understimulated: 0.5,
    overloaded: 0.9,
    depleted: 0.85,
    social: 0.75,
  } satisfies Record<StateFamily, number>,
  /** A concept below this ability sends the learner back to its prerequisite first. */
  prerequisiteFloor: 2.6,
  /** Ability at which a concept counts as solid enough to know. */
  knowledgeHigh: 3.0,
  /** Expected answer time at difficulty d: base + perLevel·(d − 1). */
  latency: { baseMs: 6000, perLevelMs: 5000, fastRatio: 0.6, slowRatio: 1.6, guessMs: 3500 },
  /** Outcome: an activity counts as a recovery if the index rises by this, or ends above `engagedIndex`. */
  recovery: { minDelta: 6, engagedIndex: 62 },
  stretchTimeLimitSec: 90,
} as const;
