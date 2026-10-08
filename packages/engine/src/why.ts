import {
  CONCEPT_META,
  CONCEPT_ORDER,
  CONTROL_META,
  INTERVENTION_META,
  MODALITY_META,
} from "./config";
import type { ServedActivity } from "./activity-engine";
import type {
  ConceptId,
  Constraints,
  InterventionKind,
  LearnedNote,
  Rationale,
  ScoredCandidate,
  StateReading,
} from "./types";

/**
 * The Why layer. Every decision gets a one-sentence explanation (evidence, then action), the
 * reasons behind it, what the engine will watch for next, and what it considered but didn't pick.
 * If a decision can't be explained in one sentence, it shouldn't be made.
 */

const FRAME_LABEL: Record<string, string> = {
  cricket: "cricket",
  startups: "a startup",
  music: "music",
  gaming: "gaming",
  space: "space",
  everyday: "everyday life",
};

export interface ExplainInput {
  reading: StateReading;
  chosen: ScoredCandidate;
  candidates: ScoredCandidate[];
  constraints: Constraints;
  learned?: LearnedNote;
  served: ServedActivity;
  focusConcept: ConceptId;
  goalConcept: ConceptId;
}

function action(kind: InterventionKind, served: ServedActivity): string {
  const frame = served.frame ? (FRAME_LABEL[served.frame] ?? served.frame) : "the real world";
  const activity = served.activity;
  switch (kind) {
    case "CONTINUE":
      return `keep going at level ${served.difficulty ?? ""}`.trim();
    case "RAISE_CHALLENGE":
      return `here's a harder one: level ${served.difficulty}`;
    case "STRETCH_CHALLENGE":
      return `instead of another explanation, here's a harder real problem about ${frame}`;
    case "REAL_WORLD_HOOK":
      return `instead of more explaining, here's a real problem about ${frame}`;
    case "GUIDED_STEPS":
      return "let's take one problem in small, checked steps";
    case "SWITCH_MODALITY":
      return `here's the same idea ${served.modality ? MODALITY_META[served.modality].phrase : "a different way"}`;
    case "MODALITY_CHOICE":
      return "you choose how to look at it next";
    case "MICRO_WIN":
      return "let's start with something small and quick";
    case "CURIOSITY_PATH":
      return "let's follow a tangent that loops back to your assignment";
    case "PEER_MISSION":
      return "here's a short mission with two others, where your part matters";
    case "REFLECTION":
      return "take one line to lock in what clicked";
    case "BREAK":
      return activity.type === "break" && activity.stopHere
        ? "this is a good place to stop"
        : "let's pause for two minutes";
  }
}

function headline(kind: InterventionKind, served: ServedActivity): string {
  switch (kind) {
    case "CONTINUE":
      return "You're in a good rhythm. Keep going.";
    case "RAISE_CHALLENGE":
      return `Stepping up to level ${served.difficulty}.`;
    case "STRETCH_CHALLENGE":
      return "A harder, real problem. No lecture.";
    case "REAL_WORLD_HOOK":
      return `A real problem about ${served.frame ? (FRAME_LABEL[served.frame] ?? served.frame) : "the real world"}.`;
    case "GUIDED_STEPS":
      return "One problem, small steps.";
    case "SWITCH_MODALITY":
      return `Same idea, ${served.modality ? MODALITY_META[served.modality].phrase : "different angle"}.`;
    case "MODALITY_CHOICE":
      return "Your call: how do you want to see it?";
    case "MICRO_WIN":
      return "Something small to get moving.";
    case "CURIOSITY_PATH":
      return "Let's follow the curiosity for a bit.";
    case "PEER_MISSION":
      return "A short mission with two others.";
    case "REFLECTION":
      return "One line before moving on.";
    case "BREAK":
      return served.activity.type === "break" && served.activity.stopHere
        ? "This is a good place to stop."
        : "Pause here.";
  }
}

/** Which evidence best explains each kind of intervention, most telling first. */
const LEAD_SIGNALS: Partial<Record<InterventionKind, string[]>> = {
  RAISE_CHALLENGE: ["ctrl_too_easy", "easy_streak", "mastery_high", "self_confident"],
  STRETCH_CHALLENGE: [
    "ctrl_challenge",
    "easy_streak",
    "self_bored",
    "self_confident",
    "mastery_high",
  ],
  REAL_WORLD_HOOK: ["ctrl_not_interested", "self_meh", "self_bored", "abandons", "react_meh"],
  GUIDED_STEPS: ["ctrl_too_hard", "self_overwhelmed", "low_accuracy", "hints", "slow", "self_lost"],
  MICRO_WIN: ["guessing", "self_tired", "energy_low", "low_accuracy", "ctrl_too_hard"],
  SWITCH_MODALITY: ["ctrl_explain", "react_lost", "self_confused", "concept_struggle"],
  CURIOSITY_PATH: ["ctrl_explore", "self_curious", "curiosity_trail"],
  PEER_MISSION: ["self_alone", "social_need"],
  BREAK: ["ctrl_break", "over_budget", "self_tired", "energy_low"],
};

const WATCHING: Record<InterventionKind, string> = {
  CONTINUE: "If you miss two in a row I'll step back down. If it's easy, it gets harder.",
  RAISE_CHALLENGE:
    "If you miss two in a row I'll step back down. If it's easy, it gets harder again.",
  STRETCH_CHALLENGE:
    "If you get stuck I'll break it into steps. If you fly through it, it gets harder.",
  REAL_WORLD_HOOK:
    "Whether a real reason changes how this feels. If you get stuck, I'll break it into steps.",
  GUIDED_STEPS: "When the steps feel easy, I'll take the training wheels off.",
  SWITCH_MODALITY: "If this angle doesn't work either, I'll try another or let you choose.",
  MODALITY_CHOICE: "Your pick changes which formats I suggest first.",
  MICRO_WIN: "One small win, then something a little bigger.",
  CURIOSITY_PATH: "Where you go tells me what interests you. It all leads back to the assignment.",
  PEER_MISSION: "Whether working with others helps you. That's worth knowing.",
  REFLECTION: "Whether today felt useful to you.",
  BREAK: "Nothing. Breaks don't need tracking.",
};

export function explainDecision(input: ExplainInput): Rationale {
  const { reading, chosen, constraints, learned, served } = input;
  const preferred = (LEAD_SIGNALS[chosen.kind] ?? [])
    .flatMap((key) => (key.startsWith("self_") ? [`now_${key.slice(5)}`, key] : [key]))
    .map((key) => reading.signals.find((s) => s.key === key && s.value >= 0.3))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);
  const evidence = [
    ...preferred,
    ...reading.evidence.filter((e) => e.key !== "baseline" && !preferred.includes(e)),
  ];
  const control =
    constraints.cause && constraints.cause !== "mood" && constraints.cause !== "choice"
      ? constraints.cause
      : undefined;

  let lead: string;
  if (control) lead = CONTROL_META[control].said.replace(/\.$/, "");
  else if (constraints.cause === "choice") lead = "You picked this";
  else if (evidence[0]) lead = evidence[0].detail;
  else lead = "Based on your check-in";

  const summary = `${lead}, so ${action(chosen.kind, served)}.`;

  const because: string[] = [];
  if (chosen.ruleInsight) because.push(chosen.ruleInsight);
  for (const e of evidence.slice(control ? 0 : 1, control ? 2 : 3)) because.push(`${e.detail}.`);
  if (input.focusConcept !== input.goalConcept) {
    const goal = CONCEPT_META[input.goalConcept].short;
    const focus = CONCEPT_META[input.focusConcept].short.toLowerCase();
    because.push(
      CONCEPT_ORDER.indexOf(input.focusConcept) < CONCEPT_ORDER.indexOf(input.goalConcept)
        ? `${goal} is built on ${focus}, so a few minutes there first makes ${goal.toLowerCase()} much easier.`
        : `${goal} looks solid, so we're moving on to ${focus}.`,
    );
  }
  if (served.note) because.push(served.note);

  const alternatives = input.candidates
    .filter((c) => c.kind !== chosen.kind)
    .slice(0, 3)
    .map((c) => ({ kind: c.kind, label: INTERVENTION_META[c.kind].label, why: c.note }));

  return {
    summary: summary[0]!.toUpperCase() + summary.slice(1),
    headline: headline(chosen.kind, served),
    because: because.map((b) => b[0]!.toUpperCase() + b.slice(1)),
    watching: WATCHING[chosen.kind],
    learned: learned?.text,
    alternatives,
  };
}
