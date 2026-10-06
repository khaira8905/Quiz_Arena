"use client";

import { START_COUNTDOWN_MS } from "@quizarena/shared/constants";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { serverNow } from "@/lib/clock";
import { play } from "@/lib/sound";

type Beat = "ready" | "3" | "2" | "1" | "go";

/** Beat boundaries in ms from the start of the 4.5s sequence (synced to server time). */
const BEATS: [Beat, number][] = [
  ["ready", 0],
  ["3", 1100],
  ["2", 1850],
  ["1", 2600],
  ["go", 3350],
];

function beatAt(elapsed: number): Beat {
  let current: Beat = "ready";
  for (const [b, at] of BEATS) if (elapsed >= at) current = b;
  return current;
}

/**
 * The live-event opener: PLAYERS READY → 3 → 2 → 1 → QUIZARENA → (question 1 arrives).
 * Every screen derives the beat from the shared server deadline, so the projector and
 * phones count down together.
 */
export function StartSequence({
  endsAt,
  playerCount,
  variant = "stage",
  sound = false,
}: {
  endsAt: number;
  playerCount: number;
  variant?: "stage" | "phone";
  sound?: boolean;
}) {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState<Beat>(() => beatAt(START_COUNTDOWN_MS - (endsAt - serverNow())));

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const left = endsAt - serverNow();
      const next = beatAt(START_COUNTDOWN_MS - left);
      setBeat((b) => (b === next ? b : next));
      // The sequence is over once the question takes the screen; stop the frame loop.
      if (left > -1000) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);

  useEffect(() => {
    if (!sound) return;
    if (beat === "3" || beat === "2" || beat === "1") play("tickUrgent");
    if (beat === "go") play("start");
  }, [beat, sound]);

  const stage = variant === "stage";
  const big = stage ? "text-[min(42vh,30vw)]" : "text-[11rem]";

  return (
    <div
      className="relative grid h-full w-full place-items-center overflow-hidden"
      aria-live="assertive"
    >
      {/* Scan line sweeping across on every beat */}
      {!reduced && (
        <motion.div
          key={`sweep-${beat}`}
          className="absolute inset-y-0 left-0 w-[30%] bg-gradient-to-r from-transparent via-accent/10 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "340%" }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        />
      )}
      {/* Constant frame so no beat is ever an empty screen mid-transition. */}
      <p
        className={
          stage
            ? "label absolute top-[6vh] text-[min(2vh,1.4vw)] text-fg-3"
            : "label absolute top-8 text-fg-3"
        }
      >
        Get ready
      </p>
      <AnimatePresence mode="popLayout">
        {beat === "ready" && (
          <motion.div
            key="ready"
            className="text-center"
            initial={reduced ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.35 }}
          >
            <div
              className={
                stage
                  ? "numeric text-[min(22vh,16vw)] font-extrabold leading-none text-accent"
                  : "numeric text-8xl font-extrabold text-accent"
              }
            >
              {playerCount}
            </div>
            <div
              className={
                stage ? "label mt-[2vh] text-[min(2.4vh,1.6vw)] text-fg-2" : "label mt-3 text-fg-2"
              }
            >
              {playerCount === 1 ? "Player ready" : "Players ready"}
            </div>
          </motion.div>
        )}
        {(beat === "3" || beat === "2" || beat === "1") && (
          <motion.div
            key={beat}
            className={`numeric font-extrabold leading-none ${big}`}
            initial={reduced ? false : { opacity: 0, scale: 1.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 520, damping: 26 }}
          >
            {beat}
          </motion.div>
        )}
        {beat === "go" && (
          <motion.div
            key="go"
            className="flex flex-col items-center gap-[3vh]"
            initial={reduced ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <LogoMark size={stage ? 140 : 72} />
            <div
              className={
                stage
                  ? "font-display text-[min(13vh,9vw)] font-bold leading-none tracking-[-0.045em]"
                  : "font-display text-5xl font-bold tracking-[-0.045em]"
              }
            >
              Quiz<span className="text-accent">Arena</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
