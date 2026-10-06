"use client";

import { motion, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/motion";

const LINES: { words: string[]; accent?: boolean }[] = [
  { words: ["100", "players."] },
  { words: ["One", "arena."], accent: true },
];

/**
 * The landing headline. Each word rises out of a mask and comes into focus, line by line;
 * then a hand-drawn stroke underlines the last word.
 */
export function HeroTitle() {
  const reduced = useReducedMotion();
  let n = 0;
  return (
    <h1
      className="font-display text-[clamp(3.25rem,7.4vw,9.75rem)] font-bold leading-[0.9] tracking-[-0.05em]"
      aria-label="100 players. One arena."
    >
      {LINES.map((line, li) => (
        <span key={li} className="block" aria-hidden>
          {line.words.map((word, wi) => {
            const i = n++;
            const last = li === LINES.length - 1 && wi === line.words.length - 1;
            return (
              <span
                key={wi}
                // Padding keeps descenders inside the mask; the negative margin gives the
                // space back so lines stay tight. The gap is the word space.
                className="relative mr-[0.22em] inline-block overflow-hidden pb-[0.18em] -mb-[0.18em] pr-[0.04em] align-top last:mr-0"
              >
                <motion.span
                  className={line.accent ? "inline-block text-accent" : "inline-block text-lit"}
                  initial={reduced ? false : { y: "105%", filter: "blur(10px)", opacity: 0 }}
                  animate={{ y: "0%", filter: "blur(0px)", opacity: 1 }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.09, ease: EASE.emphasis }}
                >
                  {word}
                </motion.span>
                {last && (
                  <svg
                    viewBox="0 0 300 24"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute bottom-[0.02em] left-0 h-[0.16em] w-full overflow-visible text-accent"
                  >
                    <motion.path
                      d="M4 16 C 60 6, 120 4, 170 9 S 260 18, 296 7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="7"
                      strokeLinecap="round"
                      initial={reduced ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, delay: 0.75, ease: EASE.inOut }}
                    />
                  </svg>
                )}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
