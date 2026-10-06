"use client";

import { motion } from "motion/react";

/**
 * A single pass of light across its parent (which must be `relative overflow-hidden`):
 * the "this just landed" glint on answer tiles and the correct answer. Re-runs whenever
 * `run` changes; renders nothing when `play` is false.
 */
export function Sweep({
  play,
  run,
  delay = 0,
  strength = 0.28,
}: {
  play: boolean;
  run?: string | number;
  delay?: number;
  strength?: number;
}) {
  if (!play) return null;
  return (
    <motion.span
      key={run}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[45%] -skew-x-12"
      style={{
        background: `linear-gradient(90deg, transparent, rgb(255 255 255 / ${strength}), transparent)`,
      }}
      initial={{ x: "-130%" }}
      animate={{ x: "330%" }}
      transition={{ duration: 0.9, delay, ease: [0.45, 0, 0.2, 1] }}
    />
  );
}
