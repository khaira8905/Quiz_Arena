import { probabilityCorrect } from "./learner-model";
import type { SessionState } from "./orchestrator";
import { between, type Rng } from "./rng";
import { expectedLatencyMs } from "./signals";
import type { Choice, ConceptId, InterventionKind, LearnerEventInput, Modality } from "./types";

/**
 * Persona simulator: a stand-in learner with hidden "true" ability and preferences. It drives demo
 * autoplay, end-to-end tests, and the simulated cohort behind the educator view. It is a model of a
 * learner, not a learner; everything it produces is labelled as simulated in the UI.
 */

export interface SimPersona {
  trueAbility: Record<ConceptId, number>;
  /** Latency multiplier: 0.5 = twice as fast as typical. */
  speed: number;
  /** Probability of finishing (and enjoying) each kind of intervention. */
  affinity: Partial<Record<InterventionKind, number>>;
  modalityAffinity?: Partial<Record<Modality, number>>;
  hintProne?: number;
  /** Presses "Too easy" when a question is far below their level. */
  saysTooEasy?: boolean;
}

export interface SimStep {
  input: LearnerEventInput;
  /** Time after the previous step, in ms. */
  dt: number;
  /** Human-readable narration for autoplay. */
  narration: string;
}

function answerChoice(
  persona: SimPersona,
  rng: Rng,
  activityId: string,
  conceptId: ConceptId,
  difficulty: number,
  choice: Choice,
): { steps: SimStep[]; correct: boolean } {
  const steps: SimStep[] = [];
  const p = probabilityCorrect(persona.trueAbility[conceptId], difficulty);
  let usedHint = false;
  if (p < 0.55 && rng() < (persona.hintProne ?? 0.2)) {
    usedHint = true;
    steps.push({ input: { type: "hint", activityId }, dt: 2500, narration: "Asked for a hint" });
  }
  const correct = rng() < Math.min(0.97, p + (usedHint ? 0.2 : 0));
  const latencyMs = Math.round(
    expectedLatencyMs(difficulty) * persona.speed * between(rng, 0.7, 1.3),
  );
  steps.push({
    input: { type: "answer", activityId, conceptId, difficulty, correct, latencyMs, usedHint },
    dt: latencyMs,
    narration: `${correct ? "Answered correctly" : "Missed"} in ${Math.round(latencyMs / 1000)}s: "${choice.options[correct ? choice.answerIndex : (choice.answerIndex + 1) % choice.options.length]}"`,
  });
  return { steps, correct };
}

/** What the simulated learner does with the current activity. */
export function simulateActivity(state: SessionState, persona: SimPersona, rng: Rng): SimStep[] {
  const decision = state.current;
  if (!decision) return [];
  const a = decision.activity;
  const affinity = persona.affinity[decision.kind] ?? 0.6;
  const steps: SimStep[] = [];
  let correct = 0;
  let total = 0;
  const finish = (willComplete: boolean, dwell: number) => {
    if (willComplete) {
      steps.push({
        input: {
          type: "activity_completed",
          activityId: a.id,
          dwellMs: dwell,
          score: total ? correct / total : undefined,
        },
        dt: 800,
        narration: "Finished",
      });
      if (rng() < 0.6) {
        const reaction =
          affinity >= 0.7 ? (rng() < 0.5 ? "aha" : "fun") : affinity < 0.45 ? "meh" : undefined;
        if (reaction)
          steps.splice(steps.length - 1, 0, {
            input: { type: "reaction", reaction },
            dt: 600,
            narration: `Reacted "${reaction}"`,
          });
      }
    } else {
      steps.push({
        input: { type: "activity_abandoned", activityId: a.id, dwellMs: dwell },
        dt: 800,
        narration: "Lost interest and moved on",
      });
    }
  };

  switch (a.type) {
    case "question":
    case "micro": {
      const d = a.type === "question" ? a.difficulty : 1;
      if (persona.saysTooEasy && d <= persona.trueAbility[a.conceptId] - 1.8 && rng() < 0.7) {
        return [
          {
            input: { type: "control", action: "TOO_EASY" },
            dt: 2500,
            narration: 'Pressed "Too easy"',
          },
        ];
      }
      const r = answerChoice(persona, rng, a.id, a.conceptId, d, a);
      steps.push(...r.steps);
      total = 1;
      correct = r.correct ? 1 : 0;
      finish(rng() < Math.max(affinity, 0.75), 9000);
      return steps;
    }
    case "challenge":
    case "guided": {
      const parts = a.type === "challenge" ? a.parts : a.steps;
      for (const [i, part] of parts.entries()) {
        if (i > 0 && rng() > Math.max(affinity, 0.2) + 0.25) {
          finish(false, 20000);
          return steps;
        }
        const r = answerChoice(persona, rng, a.id, a.conceptId, a.difficulty, part);
        steps.push(...r.steps);
        total++;
        if (r.correct) correct++;
      }
      finish(rng() < Math.max(affinity, 0.35), 40000);
      return steps;
    }
    case "explanation": {
      const m = persona.modalityAffinity?.[a.modality] ?? 0.5;
      const lands = rng() < (m + affinity) / 2;
      if (!lands && rng() < 0.6) {
        return [
          {
            input: { type: "control", action: "EXPLAIN_DIFFERENTLY" },
            dt: 9000,
            narration: 'Pressed "Explain differently"',
          },
        ];
      }
      finish(lands, 30000);
      return steps;
    }
    case "curiosity": {
      // Curiosity checks are guesses, not practice: they never count toward ability or accuracy.
      const goes = rng() < affinity;
      finish(goes, 60000);
      return steps;
    }
    case "mission": {
      const r = answerChoice(persona, rng, a.id, a.conceptId, a.difficulty, a.yourPart);
      steps.push(...r.steps);
      total = 1;
      correct = r.correct ? 1 : 0;
      if (rng() < affinity)
        steps.push({
          input: { type: "assist", activityId: a.id },
          dt: 4000,
          narration: "Explained a step to a peer",
        });
      finish(rng() < Math.max(affinity, 0.4), 60000);
      return steps;
    }
    case "choice": {
      const options = a.options.map((o) => o.choice);
      const best = [...options].sort(
        (x, y) =>
          (y === "hands-on"
            ? (persona.affinity.REAL_WORLD_HOOK ?? 0.5)
            : (persona.modalityAffinity?.[y] ?? 0.5)) -
          (x === "hands-on"
            ? (persona.affinity.REAL_WORLD_HOOK ?? 0.5)
            : (persona.modalityAffinity?.[x] ?? 0.5)),
      )[0]!;
      return [{ input: { type: "choice", choice: best }, dt: 3000, narration: `Chose ${best}` }];
    }
    case "reflection":
      return [
        {
          input: { type: "reflection", usefulness: affinity > 0.5 ? 3 : 2 },
          dt: 15000,
          narration: "Wrote a one-line reflection",
        },
      ];
    case "break":
      return [
        {
          input: { type: "activity_completed", activityId: a.id, dwellMs: 120000 },
          dt: a.stopHere ? 1000 : 120000,
          narration: "Took the break",
        },
      ];
  }
}
