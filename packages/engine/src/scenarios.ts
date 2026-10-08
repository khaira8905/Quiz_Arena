import { createLearner } from "./learner-model";
import type { CheckinInput } from "./orchestrator";
import type { SimPersona } from "./simulator";
import type { ConnectivityMode, LearnerModel } from "./types";

/**
 * Demo scenarios. Same topic, four learners, four different reasons for disengaging, so the
 * judge can watch the same content produce four different strategies. All personas are fictional.
 */

export type ScenarioId = "A" | "B" | "C" | "D";

export interface OnboardingAnswers {
  onMind: string;
  supposedTo: string;
  feelingNote: string;
  worthwhile: string;
}

export interface DemoScenario {
  id: ScenarioId;
  label: string;
  name: string;
  tagline: string;
  context: string;
  /** What the engine should figure out; shown after the fact, never fed to the engine. */
  hiddenCause: string;
  learner: () => LearnerModel;
  checkin: CheckinInput;
  dayTwoCheckin: CheckinInput;
  onboarding: OnboardingAnswers;
  mode: ConnectivityMode;
  persona: SimPersona;
  /** Director's notes: what to try in this scenario. */
  tryThis: string[];
}

export const SCENARIOS: DemoScenario[] = [
  {
    id: "A",
    label: "Bored but capable",
    name: "Aarav",
    tagline: "Strong at maths. Avoiding a logs assignment.",
    context:
      "Class 11. Into cricket and startups. Opened Attune while avoiding a logs worksheet due Friday.",
    hiddenCause: "Not a lack of ability: a mismatch between difficulty and motivation.",
    learner: () =>
      createLearner({
        id: "lrn-aarav",
        displayName: "Aarav",
        goal: "Logs assignment, due Friday",
        goalConcept: "logs",
        interests: ["cricket", "startups"],
        traits: {
          curiosity: 0.45,
          challengePreference: 0.7,
          momentum: 0.4,
          consistency: 0.5,
          socialAffinity: 0.35,
          difficultyTolerance: 0.7,
        },
        ability: { doubling: 4.4, percent: 3.9, doubling_time: 3.4, logs: 2.6, modelling: 2.3 },
        energy: 4,
        timeBudgetMin: 20,
      }),
    checkin: {
      feeling: "bored",
      energy: 4,
      timeBudgetMin: 20,
      partial: false,
      selfAssessment: "confident",
      intent: "interesting",
    },
    dayTwoCheckin: {
      feeling: "bored",
      energy: 3,
      timeBudgetMin: 20,
      partial: false,
      intent: "finish",
    },
    onboarding: {
      onMind: "The auction drama in the cricket league honestly",
      supposedTo: "Logs worksheet, due Friday",
      feelingNote: "I could do it. It's just so boring",
      worthwhile: "Something that actually makes me think",
    },
    mode: "full",
    persona: {
      trueAbility: { doubling: 5, percent: 4.7, doubling_time: 4.5, logs: 4.3, modelling: 4 },
      speed: 0.45,
      affinity: {
        STRETCH_CHALLENGE: 0.95,
        RAISE_CHALLENGE: 0.9,
        REAL_WORLD_HOOK: 0.9,
        CONTINUE: 0.55,
        SWITCH_MODALITY: 0.25,
        GUIDED_STEPS: 0.3,
        MICRO_WIN: 0.4,
        CURIOSITY_PATH: 0.6,
        PEER_MISSION: 0.5,
      },
      modalityAffinity: { worked: 0.6, visual: 0.5, text: 0.2, analogy: 0.3, dialogue: 0.3 },
      saysTooEasy: true,
    },
    tryThis: [
      "Answer the first problem quickly, then press Too easy and watch the level climb.",
      "Press Explain differently: the whole presentation changes.",
      'Tell it "I\'m bored" mid-explanation: it switches to something interactive.',
      "Open the engine trace to see signals, state probabilities and scored options.",
      "Fast-forward to tomorrow: it starts where the evidence says, and tells you why.",
    ],
  },
  {
    id: "B",
    label: "Overwhelmed and struggling",
    name: "Ishita",
    tagline: "Fell behind after being ill. On a shared family phone.",
    context:
      "Missed two weeks of class. Uses her mother's phone on a 3G connection, in the evenings.",
    hiddenCause:
      "Not laziness: the steps are too big, and a missing foundation makes everything look hard.",
    learner: () =>
      createLearner({
        id: "lrn-ishita",
        displayName: "Ishita",
        goal: "Catch up on exponents & logs",
        goalConcept: "logs",
        interests: ["music"],
        traits: {
          curiosity: 0.5,
          challengePreference: 0.3,
          momentum: 0.25,
          consistency: 0.35,
          socialAffinity: 0.5,
          difficultyTolerance: 0.25,
        },
        ability: { doubling: 2.0, percent: 1.6, doubling_time: 1.2, logs: 0.9, modelling: 0.6 },
        energy: 2,
        timeBudgetMin: 15,
        sharedDevice: true,
      }),
    checkin: {
      feeling: "overwhelmed",
      energy: 2,
      timeBudgetMin: 15,
      partial: false,
      selfAssessment: "lost",
      intent: "start",
    },
    dayTwoCheckin: {
      feeling: "okay",
      energy: 3,
      timeBudgetMin: 15,
      partial: false,
      intent: "understand",
    },
    onboarding: {
      onMind: "I missed so much, I don't know where to start",
      supposedTo: "Catch up on exponents and logs",
      feelingNote: "Honestly a bit panicky about it",
      worthwhile: "Just understand one thing properly",
    },
    mode: "light",
    persona: {
      trueAbility: { doubling: 2.8, percent: 2.2, doubling_time: 1.6, logs: 1.3, modelling: 0.8 },
      speed: 1.6,
      hintProne: 0.6,
      affinity: {
        GUIDED_STEPS: 0.9,
        MICRO_WIN: 0.95,
        CONTINUE: 0.6,
        SWITCH_MODALITY: 0.65,
        STRETCH_CHALLENGE: 0.1,
        RAISE_CHALLENGE: 0.3,
        REAL_WORLD_HOOK: 0.4,
        BREAK: 0.9,
      },
      modalityAffinity: { worked: 0.85, visual: 0.7, analogy: 0.6, text: 0.3, dialogue: 0.6 },
    },
    tryThis: [
      "Notice it starts below logs, with doubling, and says why.",
      "Press Too difficult: the next step gets smaller, never bigger.",
      "Switch to Offline, keep working, then reconnect and watch the outbox sync.",
      "Light mode is on: same activities, text-first, with the payload size shown.",
    ],
  },
  {
    id: "C",
    label: "Curious and exploring",
    name: "Meera",
    tagline: "Keeps opening tabs about space. Can't settle on the worksheet.",
    context:
      "Loves astronomy and music. Has watched three videos about folding paper to the Moon today.",
    hiddenCause: "Not distraction: curiosity pointed somewhere adjacent. Use it, don't fight it.",
    learner: () =>
      createLearner({
        id: "lrn-meera",
        displayName: "Meera",
        goal: "Understand logarithms",
        goalConcept: "logs",
        interests: ["space", "music"],
        traits: {
          curiosity: 0.85,
          challengePreference: 0.5,
          momentum: 0.45,
          consistency: 0.55,
          socialAffinity: 0.45,
          difficultyTolerance: 0.55,
        },
        ability: { doubling: 3.8, percent: 3.2, doubling_time: 2.9, logs: 2.7, modelling: 2.2 },
        energy: 4,
        timeBudgetMin: 25,
      }),
    checkin: {
      feeling: "curious",
      energy: 4,
      timeBudgetMin: 25,
      partial: false,
      selfAssessment: "unsure",
      intent: "interesting",
    },
    dayTwoCheckin: {
      feeling: "curious",
      energy: 4,
      timeBudgetMin: 25,
      partial: false,
      intent: "understand",
    },
    onboarding: {
      onMind: "Why you can't fold paper more than 7 times??",
      supposedTo: "Logs chapter for class",
      feelingNote: "Curious, just not about the worksheet",
      worthwhile: "Learn something that's actually interesting",
    },
    mode: "full",
    persona: {
      trueAbility: { doubling: 4.2, percent: 3.6, doubling_time: 3.3, logs: 3.2, modelling: 2.6 },
      speed: 0.9,
      affinity: {
        CURIOSITY_PATH: 0.95,
        REAL_WORLD_HOOK: 0.8,
        MODALITY_CHOICE: 0.85,
        SWITCH_MODALITY: 0.7,
        CONTINUE: 0.55,
        RAISE_CHALLENGE: 0.6,
        PEER_MISSION: 0.6,
      },
      modalityAffinity: { visual: 0.9, analogy: 0.8, dialogue: 0.6, worked: 0.5, text: 0.4 },
    },
    tryThis: [
      "It opens a curiosity path, not the worksheet, and the path ends at logarithms.",
      "Pick a branch: where you go updates the curiosity trait in the Twin.",
      "Press Let me explore at any time to wander again.",
    ],
  },
  {
    id: "D",
    label: "Socially disconnected",
    name: "Kabir",
    tagline: "Moved schools mid-year. Works alone every evening.",
    context: "Capable, quiet, new in class. Doesn't know anyone to ask. Likes gaming and cricket.",
    hiddenCause: "Not difficulty or boredom: isolation. The work feels heavier alone.",
    learner: () =>
      createLearner({
        id: "lrn-kabir",
        displayName: "Kabir",
        goal: "Exponents homework",
        goalConcept: "logs",
        interests: ["gaming", "cricket"],
        traits: {
          curiosity: 0.45,
          challengePreference: 0.5,
          momentum: 0.3,
          consistency: 0.4,
          socialAffinity: 0.8,
          difficultyTolerance: 0.5,
        },
        ability: { doubling: 3.6, percent: 3.2, doubling_time: 2.9, logs: 2.8, modelling: 2.3 },
        energy: 3,
        timeBudgetMin: 20,
      }),
    checkin: {
      feeling: "alone",
      energy: 3,
      timeBudgetMin: 20,
      partial: false,
      selfAssessment: "unsure",
      intent: "company",
    },
    dayTwoCheckin: {
      feeling: "alone",
      energy: 3,
      timeBudgetMin: 20,
      partial: false,
      intent: "company",
    },
    onboarding: {
      onMind: "Nothing really. New school is weird",
      supposedTo: "Exponents homework",
      feelingNote: "Fine I guess. Bit alone with it",
      worthwhile: "Not doing it all by myself",
    },
    mode: "full",
    persona: {
      trueAbility: { doubling: 4, percent: 3.6, doubling_time: 3.3, logs: 3.2, modelling: 2.7 },
      speed: 0.9,
      affinity: {
        PEER_MISSION: 0.95,
        REAL_WORLD_HOOK: 0.6,
        CONTINUE: 0.45,
        RAISE_CHALLENGE: 0.5,
        SWITCH_MODALITY: 0.45,
        CURIOSITY_PATH: 0.5,
      },
      modalityAffinity: { dialogue: 0.8, worked: 0.6, visual: 0.6, text: 0.4, analogy: 0.5 },
    },
    tryThis: [
      "It starts with a peer mission where Kabir's part matters, not a worksheet.",
      "Helping a peer counts as a growth moment; points don't exist here.",
      "See Community for interest-matched peers and shared discoveries.",
    ],
  },
];

export function scenarioById(id: ScenarioId): DemoScenario {
  return SCENARIOS.find((s) => s.id === id)!;
}
