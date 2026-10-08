import { INTERVENTION_META, STATE_META } from "./config";
import type {
  ConnectivityMode,
  Constraints,
  EngagementState,
  InterventionKind,
  LearnedNote,
  LearnerModel,
  ScoredCandidate,
  StateReading,
  TimelineEntry,
} from "./types";
import { round } from "./util";

/**
 * Adaptive Intervention Engine.
 *
 *   score = prior(state, kind | learner) × learned(state, kind) × context × novelty
 *
 * The prior comes from a readable rule table. "Learned" is this learner's own recovery rate for
 * that state and intervention (Beta-smoothed, so one result never dominates). Context covers
 * energy, time and connectivity; novelty stops the engine repeating something that isn't working.
 * Learner controls arrive as hard constraints and always win.
 */

export interface Rule {
  kind: InterventionKind;
  prior: number;
  /** The human interpretation behind the rule, quoted by the Why layer. */
  insight: string;
}

export interface PolicyContext {
  reading: StateReading;
  learner: LearnerModel;
  constraints: Constraints;
  history: TimelineEntry[];
  mode: ConnectivityMode;
  elapsedMin: number;
  /** Whether the activity engine can serve this kind right now (content may be exhausted). */
  canServe: (kind: InterventionKind) => boolean;
}

export interface PolicyResult {
  chosen: ScoredCandidate;
  candidates: ScoredCandidate[];
  learned?: LearnedNote;
  patternRecognized: boolean;
}

export function rulesFor(
  state: EngagementState,
  reading: StateReading,
  learner: LearnerModel,
): Rule[] {
  const t = learner.traits;
  switch (state) {
    case "FOCUSED": {
      const streak = reading.signals.find((s) => s.key === "easy_streak")?.value ?? 0;
      return [
        {
          kind: "CONTINUE",
          prior: 1.0,
          insight: "You're in a good rhythm, and the best move is not to interrupt it.",
        },
        {
          kind: "RAISE_CHALLENGE",
          prior: 0.55 + 0.6 * streak,
          insight: "You're getting these right quickly, so a harder one keeps it worth your time.",
        },
        {
          kind: "REFLECTION",
          prior: 0.35,
          insight: "This is a good moment to lock in what's working.",
        },
        { kind: "BREAK", prior: 0.15, insight: "Even good sessions need an end." },
      ];
    }
    case "CURIOUS":
      return [
        {
          kind: "CURIOSITY_PATH",
          prior: 1.0,
          insight: "Curiosity is the best fuel there is. Follow it, then loop back.",
        },
        { kind: "REAL_WORLD_HOOK", prior: 0.65, insight: "Curious minds like real stakes." },
        {
          kind: "MODALITY_CHOICE",
          prior: 0.5,
          insight: "You're in the mood to explore, so you choose the angle.",
        },
        { kind: "CONTINUE", prior: 0.3, insight: "Keep the momentum going." },
      ];
    case "EXPLORATORY":
      return [
        {
          kind: "CURIOSITY_PATH",
          prior: 1.0,
          insight: "You want to wander, so let's wander somewhere that leads back.",
        },
        { kind: "MODALITY_CHOICE", prior: 0.6, insight: "You choose the direction." },
        { kind: "PEER_MISSION", prior: 0.35, insight: "Exploring is better with company." },
      ];
    case "UNDERCHALLENGED":
      return [
        { kind: "RAISE_CHALLENGE", prior: 1.0, insight: "This isn't asking enough of you." },
        {
          kind: "STRETCH_CHALLENGE",
          prior: 0.8,
          insight: "You can handle a real problem, not more drills.",
        },
        { kind: "REAL_WORLD_HOOK", prior: 0.4, insight: "If it's easy, at least make it matter." },
      ];
    case "BORED":
      if (reading.knowledgeHigh) {
        return [
          {
            kind: "STRETCH_CHALLENGE",
            prior: 1.0,
            insight: "It's not that this is hard. It's that it isn't asking enough of you.",
          },
          {
            kind: "RAISE_CHALLENGE",
            prior: 0.8,
            insight: "You know this well enough to go harder.",
          },
          {
            kind: "REAL_WORLD_HOOK",
            prior: 0.6,
            insight: "Real stakes make easy things interesting.",
          },
          {
            kind: "PEER_MISSION",
            prior: 0.3 * t.socialAffinity,
            insight: "Sometimes it's the being alone that's boring.",
          },
        ];
      }
      if (t.curiosity >= 0.6) {
        return [
          {
            kind: "CURIOSITY_PATH",
            prior: 1.0,
            insight: "You're bored with the task, not the subject. A tangent might bring it alive.",
          },
          { kind: "REAL_WORLD_HOOK", prior: 0.8, insight: "Give it a reason to exist." },
          { kind: "MODALITY_CHOICE", prior: 0.5, insight: "You pick the angle." },
        ];
      }
      return [
        {
          kind: "REAL_WORLD_HOOK",
          prior: 1.0,
          insight: "When something feels pointless, the fix is a reason, not more explanation.",
        },
        {
          kind: "MODALITY_CHOICE",
          prior: 0.6,
          insight: "Change the format and hand you the controls.",
        },
        {
          kind: "MICRO_WIN",
          prior: 0.4,
          insight: "Something small and quick to break the inertia.",
        },
        {
          kind: "PEER_MISSION",
          prior: 0.3 * t.socialAffinity,
          insight: "Other people make dull things less dull.",
        },
      ];
    case "UNMOTIVATED":
      return [
        {
          kind: "REAL_WORLD_HOOK",
          prior: 1.0,
          insight:
            "It's hard to care about something that doesn't seem to matter. Let's make it matter.",
        },
        { kind: "CURIOSITY_PATH", prior: 0.6, insight: "A surprising fact can restart interest." },
        { kind: "PEER_MISSION", prior: 0.5, insight: "Other people make dull things less dull." },
        { kind: "MICRO_WIN", prior: 0.5, insight: "Something small and quick to get moving." },
      ];
    case "CONFUSED":
      return [
        {
          kind: "SWITCH_MODALITY",
          prior: 1.0,
          insight: "The explanation isn't landing. Same idea, different angle.",
        },
        {
          kind: "GUIDED_STEPS",
          prior: 0.7,
          insight: "Break it into smaller pieces and check each one.",
        },
        {
          kind: "MODALITY_CHOICE",
          prior: 0.4,
          insight: "You may know best which way it'll make sense.",
        },
      ];
    case "OVERWHELMED":
      return [
        {
          kind: "GUIDED_STEPS",
          prior: 1.0,
          insight: "Too much at once. Smaller steps, each one checked.",
        },
        {
          kind: "MICRO_WIN",
          prior: 0.8,
          insight: "A quick win first, so the next step feels possible.",
        },
        { kind: "BREAK", prior: 0.3, insight: "Sometimes stepping away is the step." },
      ];
    case "FRUSTRATED":
      return [
        {
          kind: "MICRO_WIN",
          prior: 0.9,
          insight: "After a run of misses, a quick win matters more than another hard question.",
        },
        {
          kind: "GUIDED_STEPS",
          prior: 0.8,
          insight: "Walk through it together instead of guessing.",
        },
        { kind: "BREAK", prior: 0.6, insight: "A short break resets more than you'd think." },
        { kind: "PEER_MISSION", prior: 0.3, insight: "Someone else's angle can unstick you." },
      ];
    case "LOW_ENERGY":
      return [
        {
          kind: "MICRO_WIN",
          prior: 0.9,
          insight: "Effort is expensive right now. Something small, or a real break.",
        },
        { kind: "BREAK", prior: 0.8, insight: "Rest is part of learning, not a failure of it." },
        {
          kind: "REFLECTION",
          prior: 0.5,
          insight: "Low effort, high value: lock in what you've already done.",
        },
      ];
    case "DISCONNECTED":
      return [
        { kind: "PEER_MISSION", prior: 1.0, insight: "Maths is easier when it's not just you." },
        { kind: "REAL_WORLD_HOOK", prior: 0.4, insight: "Connect it to something you care about." },
        { kind: "CURIOSITY_PATH", prior: 0.3, insight: "Something worth sharing with others." },
      ];
  }
}

/** Beta(1,1)-smoothed recovery rate for a state × intervention, falling back to its family. */
export function effectivenessFor(
  learner: LearnerModel,
  state: EngagementState,
  kind: InterventionKind,
) {
  const exact = learner.effectiveness[`${state}|${kind}`];
  if (exact && exact.tries > 0) return { ...exact, scope: "state" as const };
  const family = STATE_META[state].family;
  let tries = 0;
  let recoveries = 0;
  for (const [key, rec] of Object.entries(learner.effectiveness)) {
    const [s, k] = key.split("|") as [EngagementState, InterventionKind];
    if (k === kind && STATE_META[s]?.family === family) {
      tries += rec.tries;
      recoveries += rec.recoveries;
    }
  }
  return { tries, recoveries, scope: "family" as const };
}

const posterior = (tries: number, recoveries: number) => (recoveries + 1) / (tries + 2);

function contextFactor(
  kind: InterventionKind,
  ctx: PolicyContext,
): { factor: number; note?: string } {
  const { learner, mode, elapsedMin, history } = ctx;
  const t = learner.traits;
  let factor = 1;
  let note: string | undefined;
  const lowEnergy = learner.context.energy <= 2;
  const overBudget = elapsedMin > learner.context.timeBudgetMin;

  switch (kind) {
    case "STRETCH_CHALLENGE":
    case "RAISE_CHALLENGE":
      factor *= 0.7 + 0.6 * t.challengePreference;
      if (lowEnergy) {
        factor *= kind === "STRETCH_CHALLENGE" ? 0.6 : 0.8;
        note = "Your energy's low for a big push";
      }
      break;
    case "PEER_MISSION":
      factor *= 0.6 + 0.8 * t.socialAffinity;
      if (mode === "offline") {
        factor *= 0.75;
        note = "You're offline, so peers would only see your part later";
      }
      break;
    case "CURIOSITY_PATH":
      factor *= 0.6 + 0.8 * t.curiosity;
      break;
    case "GUIDED_STEPS":
      factor *= 1.3 - 0.6 * t.difficultyTolerance;
      break;
    case "MICRO_WIN":
      if (lowEnergy) factor *= 1.2;
      break;
    case "BREAK":
      if (overBudget) {
        factor *= 2.4;
        note = "You're past the time you planned";
      } else if (lowEnergy) {
        factor *= 1.25;
      } else if (elapsedMin < 4) {
        factor *= 0.4;
        note = "We've only just started";
      }
      break;
    case "REFLECTION": {
      const lastReflection = history.map((h) => h.kind).lastIndexOf("REFLECTION");
      const academicSince = history
        .slice(lastReflection + 1)
        .filter((h) => INTERVENTION_META[h.kind].academic).length;
      if (academicSince < 3) {
        factor *= 0.2;
        note = "Not enough done yet to reflect on";
      }
      break;
    }
    default:
      break;
  }
  if (overBudget && kind !== "BREAK" && kind !== "REFLECTION") factor *= 0.85;
  return { factor, note };
}

const ONE_PER_SESSION: InterventionKind[] = [
  "PEER_MISSION",
  "CURIOSITY_PATH",
  "BREAK",
  "MODALITY_CHOICE",
  "REFLECTION",
];

function noveltyFactor(
  kind: InterventionKind,
  history: TimelineEntry[],
): { factor: number; note?: string } {
  const last = history[history.length - 1];
  let factor = 1;
  let note: string | undefined;
  if (last && last.kind === kind && kind !== "CONTINUE" && kind !== "RAISE_CHALLENGE") {
    if (last.outcome && !last.outcome.recovered) {
      factor *= 0.45;
      note = "Just tried that and it didn't help";
    } else {
      factor *= 0.8;
      note = "Just did that";
    }
  }
  const recent = history.slice(-3).filter((h) => h.kind === kind).length;
  if (recent >= 2 && kind !== "CONTINUE" && kind !== "RAISE_CHALLENGE") factor *= 0.7;
  const usedCount = history.filter((h) => h.kind === kind).length;
  if (ONE_PER_SESSION.includes(kind) && usedCount > 0) {
    factor *= 0.35 ** usedCount;
    note ??= "Already did one this session";
  }
  return { factor, note };
}

export function selectIntervention(ctx: PolicyContext): PolicyResult {
  const { reading, learner, constraints } = ctx;
  const state = reading.primary;
  let rules = rulesFor(state, reading, learner);

  // Constraints shape the candidate set before scoring.
  if (constraints.allowedKinds) {
    const allowed = constraints.allowedKinds;
    const kept = rules.filter((r) => allowed.includes(r.kind));
    for (const kind of allowed) {
      if (!kept.some((r) => r.kind === kind)) {
        kept.push({ kind, prior: 0.8, insight: INTERVENTION_META[kind].describe });
      }
    }
    rules = kept;
  }
  if (constraints.forceKind && !rules.some((r) => r.kind === constraints.forceKind)) {
    rules = [
      {
        kind: constraints.forceKind,
        prior: 1,
        insight: INTERVENTION_META[constraints.forceKind].describe,
      },
      ...rules,
    ];
  }

  const candidates: ScoredCandidate[] = rules.map((rule) => {
    const eff = effectivenessFor(learner, state, rule.kind);
    const learned = eff.tries > 0 ? 0.6 + 0.8 * posterior(eff.tries, eff.recoveries) : 1;
    const context = contextFactor(rule.kind, ctx);
    const novelty = noveltyFactor(rule.kind, ctx.history);
    const excluded =
      (constraints.excludeKinds?.includes(rule.kind) ?? false) ||
      (constraints.forceKind !== undefined && constraints.forceKind !== rule.kind);
    const servable = ctx.canServe(rule.kind);
    const score =
      excluded || !servable ? 0 : rule.prior * learned * context.factor * novelty.factor;

    let note: string;
    if (excluded)
      note = constraints.forceKind
        ? "You asked for something specific"
        : "You asked for something different";
    else if (!servable) note = "Nothing suitable left in the library for this right now";
    else if (eff.tries > 0 && learned < 0.85)
      note = `Hasn't worked well for you (${eff.recoveries} of ${eff.tries})`;
    else if (novelty.note && novelty.factor < 0.7) note = novelty.note;
    else if (context.note && context.factor < 0.8) note = context.note;
    else note = `Less likely to help when you're ${STATE_META[state].label.toLowerCase()}`;

    return {
      kind: rule.kind,
      prior: round(rule.prior, 2),
      learned: round(learned, 2),
      context: round(context.factor, 2),
      novelty: round(novelty.factor, 2),
      score: round(score, 3),
      note,
      ruleInsight: rule.insight,
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  let chosen = candidates[0];
  if (!chosen || chosen.score <= 0) {
    // Nothing servable: fall back to calibrated practice, which never runs out.
    chosen = {
      kind: "CONTINUE",
      prior: 1,
      learned: 1,
      context: 1,
      novelty: 1,
      score: 1,
      note: "Fallback",
      ruleInsight: "Keep practising at a level that fits.",
    };
    candidates.unshift(chosen);
  }

  // Only cite history when it supports the choice and is about recovering from disengagement;
  // "keep going worked while focused" is noise, and negative history shows up in the alternatives.
  const eff = effectivenessFor(learner, state, chosen.kind);
  const worked = eff.tries > 0 && eff.recoveries / eff.tries >= 0.5;
  const meaningful = STATE_META[state].family !== "engaged" && chosen.kind !== "CONTINUE";
  let learnedNote: LearnedNote | undefined;
  if (worked && meaningful) {
    const kindLabel = INTERVENTION_META[chosen.kind].label.toLowerCase();
    const when =
      eff.scope === "state"
        ? `you were ${STATE_META[state].label.toLowerCase()}`
        : "you were in a similar place";
    learnedNote = {
      state,
      kind: chosen.kind,
      tries: eff.tries,
      recoveries: eff.recoveries,
      text: `Last time ${when}, ${kindLabel} brought you back ${eff.recoveries} of ${eff.tries} time${eff.tries === 1 ? "" : "s"}.`,
    };
  }
  const patternRecognized = learnedNote !== undefined && eff.recoveries / eff.tries >= 0.66;

  return { chosen, candidates, learned: learnedNote, patternRecognized };
}
