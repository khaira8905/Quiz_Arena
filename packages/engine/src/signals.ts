import { CONCEPT_META, FEELING_META, TUNING } from "./config";
import type {
  AnswerEvent,
  ConceptId,
  ControlAction,
  InterventionKind,
  LearnerEvent,
  LearnerModel,
  Reaction,
  Signal,
} from "./types";
import { clamp, mean, plural, seconds } from "./util";

/**
 * Signal extraction: turns the raw event log into named features, each with a plain-language
 * description of the evidence. Recent evidence counts more: self-reports, controls and reactions
 * decay with every activity that ends after them.
 */

export interface SignalContext {
  events: LearnerEvent[];
  learner: LearnerModel;
  focusConcept: ConceptId;
  sessionStartedAt: number;
  now: number;
}

const CONTROL_FEATURE: Record<ControlAction, string> = {
  TOO_EASY: "ctrl_too_easy",
  TOO_HARD: "ctrl_too_hard",
  EXPLAIN_DIFFERENTLY: "ctrl_explain",
  CHALLENGE_ME: "ctrl_challenge",
  EXPLORE: "ctrl_explore",
  NOT_INTERESTED: "ctrl_not_interested",
  CHANGE_ACTIVITY: "ctrl_change",
  BREAK: "ctrl_break",
};

const CONTROL_DETAIL: Record<ControlAction, string> = {
  TOO_EASY: "You said it was too easy",
  TOO_HARD: "You said it was too hard",
  EXPLAIN_DIFFERENTLY: "You asked for a different explanation",
  CHALLENGE_ME: "You asked for a challenge",
  EXPLORE: "You asked to explore",
  NOT_INTERESTED: "You said it didn't interest you",
  CHANGE_ACTIVITY: "You asked for something else",
  BREAK: "You asked for a break",
};

const REACTION_DETAIL: Record<Reaction, string> = {
  aha: "You marked an 'aha' moment",
  fun: "You said that was fun",
  meh: "You reacted 'meh'",
  lost: "You said you felt lost",
};

/** An activity "ends" on completion, abandonment, or a control or mood check-in that interrupts it. */
const isBoundary = (e: LearnerEvent) =>
  e.type === "activity_completed" ||
  e.type === "activity_abandoned" ||
  e.type === "control" ||
  (e.type === "checkin" && e.partial);

export function expectedLatencyMs(difficulty: number): number {
  return TUNING.latency.baseMs + TUNING.latency.perLevelMs * (difficulty - 1);
}

export function activityKinds(events: LearnerEvent[]): Map<string, InterventionKind> {
  const kinds = new Map<string, InterventionKind>();
  for (const e of events) if (e.type === "activity_started") kinds.set(e.activityId, e.kind);
  return kinds;
}

export function extractSignals(ctx: SignalContext): Signal[] {
  const { events, learner } = ctx;
  const signals = new Map<string, Signal>();
  const add = (key: string, value: number, detail: string, source: Signal["source"]) => {
    if (value <= 0.01) return;
    const prev = signals.get(key);
    if (prev) {
      prev.value = clamp(prev.value + value);
    } else {
      signals.set(key, { key, value: clamp(value), detail, source });
    }
  };

  // How many activities have ended after index i — the unit of decay.
  const boundariesAfter: number[] = new Array(events.length).fill(0);
  let running = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    boundariesAfter[i] = running;
    if (isBoundary(events[i]!)) running++;
  }
  const since = (i: number) => boundariesAfter[i] ?? 0;
  const kinds = activityKinds(events);

  add("baseline", 1, "Starting assumption: steady work", "history");

  /* Self-report: the latest check-in, full or partial. */
  let lastCheckin = -1;
  let lastFullCheckin = -1;
  events.forEach((e, i) => {
    if (e.type === "checkin") {
      lastCheckin = i;
      if (!e.partial) lastFullCheckin = i;
    }
  });
  if (lastCheckin >= 0) {
    const e = events[lastCheckin] as Extract<LearnerEvent, { type: "checkin" }>;
    const decay = TUNING.decay.selfReport ** since(lastCheckin);
    const label = FEELING_META[e.feeling].label.toLowerCase();
    add(
      `${e.partial && since(lastCheckin) === 0 ? "now" : "self"}_${e.feeling}`,
      decay,
      since(lastCheckin) === 0
        ? `You said you're feeling ${label}`
        : `Earlier you said you felt ${label}`,
      "self-report",
    );
  }
  if (lastFullCheckin >= 0) {
    const e = events[lastFullCheckin] as Extract<LearnerEvent, { type: "checkin" }>;
    // Energy is context and fades slowly; self-assessment is a self-report and fades like one.
    const energyDecay = 0.85 ** since(lastFullCheckin);
    const reportDecay = TUNING.decay.selfReport ** since(lastFullCheckin);
    add(
      "energy_low",
      clamp((3 - e.energy) / 2) * energyDecay,
      `Energy check-in: ${e.energy} of 5`,
      "self-report",
    );
    if (e.selfAssessment === "confident") {
      add(
        "self_confident",
        0.8 * reportDecay,
        "You said you could do this if you wanted to",
        "self-report",
      );
    } else if (e.selfAssessment === "lost") {
      add("self_lost", 0.8 * reportDecay, "You said you're not sure where to start", "self-report");
    }
  }

  /* Controls and reactions: strong now, fade fast. */
  events.forEach((e, i) => {
    if (e.type === "control") {
      add(
        CONTROL_FEATURE[e.action],
        TUNING.decay.control ** since(i),
        CONTROL_DETAIL[e.action],
        "control",
      );
    } else if (e.type === "reaction") {
      add(
        `react_${e.reaction}`,
        TUNING.decay.reaction ** since(i),
        REACTION_DETAIL[e.reaction],
        "self-report",
      );
    }
  });

  /* Answer behaviour over a short window. */
  const answers = events
    .filter((e): e is AnswerEvent => e.type === "answer")
    .slice(-TUNING.answerWindow);
  if (answers.length > 0) {
    const ability = (c: ConceptId) => learner.ability[c];

    // Streak of fast, correct answers at a level comfortably below estimated ability.
    let streak = 0;
    const streakTimes: number[] = [];
    for (let i = answers.length - 1; i >= 0; i--) {
      const a = answers[i]!;
      const fast = a.latencyMs < TUNING.latency.fastRatio * expectedLatencyMs(a.difficulty);
      const easy = a.difficulty <= ability(a.conceptId) - 0.5;
      if (a.correct && !a.usedHint && (fast || easy) && (fast || a.difficulty <= 2)) {
        streak++;
        streakTimes.push(a.latencyMs);
      } else break;
    }
    if (streak >= 2) {
      add(
        "easy_streak",
        Math.min(streak, 3) / 3,
        `${plural(streak, "answer")} right in a row, about ${seconds(mean(streakTimes))} each`,
        "behaviour",
      );
    }

    // Working near your level only counts as "in the zone" when it's mostly going right.
    const inZone = answers.filter((a) => Math.abs(a.difficulty - ability(a.conceptId)) <= 1.1);
    if (inZone.length > 0) {
      const level = inZone[inZone.length - 1]!.difficulty;
      const zoneAccuracy = inZone.filter((a) => a.correct).length / inZone.length;
      add(
        "in_zone",
        (inZone.length / answers.length) * (Math.min(inZone.length, 3) / 3) * zoneAccuracy,
        `Working at level ${level}, close to your current level`,
        "behaviour",
      );
    }

    if (answers.length >= 2) {
      const correct = answers.filter((a) => a.correct).length;
      const acc = correct / answers.length;
      add(
        "low_accuracy",
        clamp((0.6 - acc) / 0.6),
        `${answers.length - correct} of the last ${answers.length} answers missed`,
        "behaviour",
      );
    }

    const ratios = answers.map((a) => a.latencyMs / expectedLatencyMs(a.difficulty));
    const avgRatio = mean(ratios);
    add(
      "slow",
      clamp(avgRatio - TUNING.latency.slowRatio),
      `Answers taking about ${seconds(mean(answers.map((a) => a.latencyMs)))}, slower than usual at this level`,
      "behaviour",
    );

    const guesses = answers.filter(
      (a) => !a.correct && a.latencyMs < TUNING.latency.guessMs,
    ).length;
    add(
      "guessing",
      clamp(guesses / 2),
      `${plural(guesses, "quick miss", "quick misses")}: that can mean guessing`,
      "behaviour",
    );

    const missesByConcept = new Map<ConceptId, number>();
    for (const a of answers) {
      if (!a.correct) missesByConcept.set(a.conceptId, (missesByConcept.get(a.conceptId) ?? 0) + 1);
    }
    for (const [concept, misses] of missesByConcept) {
      if (misses >= 2) {
        add(
          "concept_struggle",
          clamp((misses - 1) / 2),
          `${plural(misses, "miss", "misses")} on ${CONCEPT_META[concept].short.toLowerCase()}`,
          "behaviour",
        );
      }
    }
  }

  const theta = learner.ability[ctx.focusConcept];
  if (theta >= 4 && !signals.has("low_accuracy")) {
    add(
      "mastery_high",
      clamp((theta - 3.5) / 1.5),
      `${CONCEPT_META[ctx.focusConcept].short} looks solid for you already`,
      "history",
    );
  }

  /* Hints and abandonment. */
  const recentHints = events.filter((e, i) => e.type === "hint" && since(i) <= 1).length;
  add(
    "hints",
    clamp(recentHints / 2),
    `Asked for ${plural(recentHints, "hint")} recently`,
    "behaviour",
  );

  let abandonValue = 0;
  let abandonCount = 0;
  events.forEach((e, i) => {
    if (e.type === "activity_abandoned") {
      abandonValue += 0.6 ** since(i);
      abandonCount++;
    }
  });
  add(
    "abandons",
    clamp(abandonValue / 1.5),
    `Left ${plural(abandonCount, "activity", "activities")} unfinished`,
    "behaviour",
  );

  /* Momentum: activities finished in a row, where finishing wasn't just clicking through misses. */
  let finished = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "activity_completed" && (e.score ?? 1) >= 0.5) finished++;
    else if (e.type === "activity_completed") break;
    else if (e.type === "activity_abandoned" || e.type === "control") break;
  }
  if (finished >= 1) {
    add(
      "momentum",
      clamp(finished / 3),
      `${plural(finished, "activity", "activities")} finished in a row`,
      "behaviour",
    );
  }

  /* Curiosity and social context. */
  let curiosity = 0;
  let missionDone = -1;
  events.forEach((e, i) => {
    if (e.type === "activity_completed") {
      const kind = kinds.get(e.activityId);
      if (kind === "CURIOSITY_PATH") curiosity += 0.7 ** since(i);
      if (kind === "PEER_MISSION") missionDone = i;
    }
  });
  add("curiosity_trail", clamp(curiosity), "You followed a curiosity path to the end", "behaviour");

  if (missionDone >= 0) {
    add(
      "peer_connected",
      0.7 ** since(missionDone),
      "You just worked through a mission with others",
      "behaviour",
    );
  } else if (learner.traits.socialAffinity >= 0.6) {
    add(
      "social_need",
      clamp((learner.traits.socialAffinity - 0.5) * 2),
      "You've tended to do better with others involved",
      "history",
    );
  }

  /* Time budget. */
  const elapsedMin = (ctx.now - ctx.sessionStartedAt) / 60000;
  const budget = learner.context.timeBudgetMin;
  if (elapsedMin > budget) {
    add(
      "over_budget",
      clamp(0.5 + (elapsedMin - budget) / 20),
      `You planned ${budget} minutes; it's been ${Math.round(elapsedMin)}`,
      "behaviour",
    );
  }

  return [...signals.values()];
}
