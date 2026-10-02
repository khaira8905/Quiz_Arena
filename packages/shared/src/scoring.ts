/**
 * Scoring rules. This module is pure so it can be unit tested and shown in the editor
 * as a preview — but only the server's result is ever authoritative.
 */
export const SCORING_MODES = ["SPEED", "ACCURACY"] as const;
export type ScoringMode = (typeof SCORING_MODES)[number];

export interface ScoringConfig {
  mode: ScoringMode;
  /** Adds a bonus for consecutive correct answers. */
  streakBonus: boolean;
}

export interface ScoreInput {
  correct: boolean;
  /** Time from question open to server receipt, ms. */
  responseMs: number;
  durationMs: number;
  basePoints: number;
  /** Streak length INCLUDING this answer (1 = first correct in a row). */
  streak: number;
}

/** Speed mode keeps at least this share of the base points for a correct answer at the buzzer. */
export const SPEED_FLOOR = 0.5;
/** Per-step streak bonus as a share of base points, and the max number of steps. */
export const STREAK_STEP = 0.05;
export const STREAK_MAX_STEPS = 5;

export function computePoints(input: ScoreInput, config: ScoringConfig): number {
  if (!input.correct || input.basePoints <= 0) return 0;

  const duration = Math.max(1, input.durationMs);
  const elapsed = Math.min(Math.max(0, input.responseMs), duration) / duration;

  const base =
    config.mode === "SPEED"
      ? input.basePoints * (1 - (1 - SPEED_FLOOR) * elapsed)
      : input.basePoints;

  const steps = config.streakBonus ? Math.min(Math.max(0, input.streak - 1), STREAK_MAX_STEPS) : 0;
  const bonus = input.basePoints * STREAK_STEP * steps;

  return Math.round(base + bonus);
}
