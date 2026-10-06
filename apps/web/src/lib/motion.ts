/**
 * Motion tokens for JS animation (motion/react). Mirrors the CSS custom properties in
 * globals.css so CSS transitions and JS springs share one vocabulary. Pick by intent:
 *   out       - the default; quick start, soft landing (UI responses)
 *   emphasis  - long, dramatic settle (stage reveals, headlines)
 *   inOut     - symmetric, for loops and ambient movement
 *   snap      - a small overshoot that reads as "confirmed"
 */
export const EASE = {
  out: [0.22, 1, 0.36, 1],
  emphasis: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  snap: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Durations in seconds (motion/react's unit). */
export const DUR = {
  instant: 0.09,
  fast: 0.16,
  normal: 0.26,
  slow: 0.52,
  cinematic: 0.9,
} as const;

/** Springs with a personality each. */
export const SPRING = {
  /** Controls: firm, no wobble. */
  ui: { type: "spring", stiffness: 520, damping: 38, mass: 0.7 },
  /** Things that land: a little bounce. */
  land: { type: "spring", stiffness: 300, damping: 22, mass: 0.9 },
  /** Leaderboard rows sliding past each other: heavy and smooth. */
  rank: { type: "spring", stiffness: 170, damping: 26, mass: 1 },
} as const;

/** Stagger step between siblings, capped so long lists don't take forever. */
export function stagger(index: number, step = 0.05, cap = 10): number {
  return Math.min(index, cap) * step;
}
