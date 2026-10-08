import { CONCEPT_ORDER, FEATURE_WEIGHTS, STATE_META, TUNING } from "./config";
import { extractSignals, type SignalContext } from "./signals";
import { ENGAGEMENT_STATES, type EngagementState, type Signal, type StateReading } from "./types";
import { round } from "./util";

/**
 * Engagement State Engine.
 *
 * Each state's score is a weighted sum of signals; a softmax turns scores into a distribution.
 * The output is never just a label: it carries the distribution, the evidence for the leading
 * state, and an engagement index used to judge whether an intervention helped.
 *
 * These are interaction states (how someone is engaging right now), not diagnoses.
 */

export function scoreStates(signals: Signal[]): Record<EngagementState, number> {
  const scores = Object.fromEntries(ENGAGEMENT_STATES.map((s) => [s, 0])) as Record<
    EngagementState,
    number
  >;
  for (const signal of signals) {
    const weights = FEATURE_WEIGHTS[signal.key];
    if (!weights) continue;
    for (const [state, weight] of Object.entries(weights) as [EngagementState, number][]) {
      scores[state] += signal.value * weight;
    }
  }
  return scores;
}

export function softmax(
  scores: Record<EngagementState, number>,
  temperature: number = TUNING.temperature,
) {
  const max = Math.max(...Object.values(scores));
  const exps = ENGAGEMENT_STATES.map((s) => Math.exp((scores[s] - max) / temperature));
  const total = exps.reduce((a, b) => a + b, 0);
  return ENGAGEMENT_STATES.map((state, i) => ({ state, p: exps[i]! / total }));
}

export function engagementIndex(distribution: { state: EngagementState; p: number }[]): number {
  return Math.round(
    distribution.reduce((sum, d) => sum + d.p * STATE_META[d.state].valence, 0) * 100,
  );
}

/** Signals that pushed the given state up, strongest first. */
export function evidenceFor(state: EngagementState, signals: Signal[]): Signal[] {
  return signals
    .filter((s) => s.key !== "baseline" && (FEATURE_WEIGHTS[s.key]?.[state] ?? 0) > 0)
    .sort(
      (a, b) =>
        b.value * (FEATURE_WEIGHTS[b.key]![state] ?? 0) -
        a.value * (FEATURE_WEIGHTS[a.key]![state] ?? 0),
    );
}

export function readState(ctx: SignalContext): StateReading {
  const signals = extractSignals(ctx);
  const distribution = softmax(scoreStates(signals)).sort((a, b) => b.p - a.p);
  const [first, second] = distribution as [
    (typeof distribution)[number],
    (typeof distribution)[number],
  ];

  const theta = ctx.learner.ability[ctx.focusConcept];
  const prerequisite = CONCEPT_ORDER[CONCEPT_ORDER.indexOf(ctx.focusConcept) - 1];
  const has = (key: string, min = 0.01) => (signals.find((s) => s.key === key)?.value ?? 0) >= min;
  // Capable learners: solid on this concept, or just mastered the one it builds on.
  const knowledgeHigh =
    theta >= TUNING.knowledgeHigh ||
    (prerequisite !== undefined && ctx.learner.ability[prerequisite] >= 4) ||
    has("self_confident", 0.3) ||
    has("easy_streak", 0.6) ||
    has("mastery_high");

  return {
    primary: first.state,
    secondary: second.state,
    confidence: round(first.p - second.p, 3),
    distribution: distribution.map((d) => ({ state: d.state, p: round(d.p, 4) })),
    evidence: evidenceFor(first.state, signals).slice(0, 4),
    signals,
    engagementIndex: engagementIndex(distribution),
    knowledgeHigh,
  };
}
