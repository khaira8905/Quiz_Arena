"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useArena } from "@/components/arena/arena-theme";
import { EASE } from "@/lib/motion";

/**
 * The stage's scene change: when `scene` changes, an accent panel wipes across the whole
 * stage carrying the next screen's title, holds for a beat while the content swaps
 * underneath, then wipes off the other side. Never on first paint, and only for NORMAL
 * and HIGH arena motion without reduced motion.
 */
export function Curtain({ scene, title }: { scene: string; title: string | null }) {
  const reduced = useReducedMotion();
  const { motion: arenaMotion } = useArena();
  const [shown, setShown] = useState<{ scene: string; title: string | null; run: number }>({
    scene,
    title: null,
    run: 0,
  });
  if (shown.scene !== scene) {
    setShown({ scene, title, run: shown.run + 1 });
  }
  const play = shown.run > 0 && !reduced && arenaMotion.amplitude >= 1 && shown.title !== null;

  return (
    <AnimatePresence>
      {play && (
        <motion.div
          key={shown.run}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-accent text-accent-ink"
          initial={{ clipPath: "inset(0% 100% 0% 0%)" }}
          animate={{
            clipPath: [
              "inset(0% 100% 0% 0%)",
              "inset(0% 0% 0% 0%)",
              "inset(0% 0% 0% 0%)",
              "inset(0% 0% 0% 100%)",
            ],
          }}
          transition={{ duration: 1.05, times: [0, 0.34, 0.6, 1], ease: EASE.inOut }}
          onAnimationComplete={() => setShown((s) => ({ ...s, title: null }))}
        >
          <motion.span
            className="font-display text-[clamp(3rem,9vw,18rem)] font-bold leading-none tracking-[-0.05em]"
            initial={{ x: "-6vw", opacity: 0 }}
            animate={{
              x: ["-6vw", "-6vw", "0vw", "0vw", "6vw"],
              opacity: [0, 0, 1, 1, 0],
            }}
            transition={{ duration: 1.05, times: [0, 0.12, 0.36, 0.62, 0.9], ease: "easeOut" }}
          >
            {shown.title}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
