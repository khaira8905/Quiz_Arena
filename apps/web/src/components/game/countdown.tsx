"use client";

import type { TimerState } from "@quizarena/shared/game";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { play } from "@/lib/sound";
import { urgencyFor, useCountdown } from "@/lib/use-countdown";

/**
 * The countdown is a core game element, not a widget. Urgency escalates through motion,
 * scale and weight — colour shifts too, but is never the only signal:
 *   >5s calm · 5s ring tightens · 3s pulse · 2s stronger pulse · 1s major pulse · 0 burst.
 */
const RING = {
  stroke: ["var(--accent)", "var(--warning)", "var(--danger)", "var(--danger)", "var(--danger)"],
  pulse: [1, 1.035, 1.08, 1.12, 1],
};

export function Countdown({
  timer,
  active,
  variant = "stage",
  sound = false,
  className,
}: {
  timer: TimerState | null;
  active: boolean;
  variant?: "stage" | "panel";
  sound?: boolean;
  className?: string;
}) {
  const { seconds, progress } = useCountdown(timer, active, { fine: true });
  const urgency = urgencyFor(seconds, active && !timer?.paused);
  const reduced = useReducedMotion();
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (!sound || !active || timer?.paused) return;
    if (seconds !== lastTick.current && seconds > 0 && seconds <= 5)
      play(seconds <= 3 ? "tickUrgent" : "tick");
    lastTick.current = seconds;
  }, [seconds, sound, active, timer?.paused]);

  const size = variant === "stage" ? "min(17vh,17vw)" : "7.5rem";
  const r = 46;
  const c = 2 * Math.PI * r;

  return (
    <div
      role="timer"
      aria-live={urgency >= 2 ? "assertive" : "off"}
      aria-label={timer?.paused ? `Paused with ${seconds} seconds left` : `${seconds} seconds left`}
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Shockwave on each urgent second */}
      <AnimatePresence>
        {!reduced && urgency >= 2 && urgency < 4 && (
          <motion.span
            key={`wave-${seconds}`}
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: RING.stroke[urgency] }}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: urgency === 3 ? 1.55 : 1.3, opacity: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 -rotate-90"
        animate={
          reduced
            ? undefined
            : { scale: urgency >= 1 && urgency < 4 ? [1, RING.pulse[urgency]!, 1] : 1 }
        }
        transition={{ duration: 0.45, ease: "easeOut" }}
        key={urgency >= 1 && urgency < 4 ? `pulse-${seconds}` : "static"}
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="var(--surface-sunken)"
          stroke="var(--line)"
          strokeWidth="5"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={RING.stroke[urgency]}
          strokeWidth={urgency >= 2 ? 7 : 5}
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke 250ms, stroke-width 250ms" }}
        />
      </motion.svg>

      <div className="relative flex flex-col items-center leading-none">
        <AnimatePresence mode="popLayout" initial={false}>
          {urgency === 4 ? (
            <motion.span
              key="zero"
              className="font-display font-extrabold tracking-[-0.04em] text-danger"
              style={{ fontSize: variant === "stage" ? "min(4.2vh,4.2vw)" : "1.6rem" }}
              initial={reduced ? false : { scale: 1.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              TIME
            </motion.span>
          ) : (
            <motion.span
              key={seconds}
              className="numeric font-extrabold"
              style={{ fontSize: variant === "stage" ? "min(7.5vh,7.5vw)" : "2.75rem" }}
              initial={reduced ? false : { y: "-40%", opacity: 0, scale: urgency >= 2 ? 1.5 : 1 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={reduced ? undefined : { y: "40%", opacity: 0, scale: 0.8 }}
              transition={{ duration: urgency >= 2 ? 0.28 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {seconds}
            </motion.span>
          )}
        </AnimatePresence>
        {timer?.paused && <span className="label mt-1 text-warning">Paused</span>}
      </div>
    </div>
  );
}

/** Slim horizontal timer for phones: depleting bar + digits, same urgency language. */
export function CountdownBar({ timer, active }: { timer: TimerState | null; active: boolean }) {
  const { seconds, progress } = useCountdown(timer, active, { fine: true });
  const urgency = urgencyFor(seconds, active && !timer?.paused);
  const reduced = useReducedMotion();
  const color = urgency >= 2 ? "bg-danger" : urgency === 1 ? "bg-warning" : "bg-accent";

  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${seconds} seconds left`}>
      <div className="relative h-2 flex-1 overflow-hidden bg-line">
        <div
          className={cn("absolute inset-y-0 left-0 transition-colors", color)}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <motion.span
        key={urgency >= 2 ? seconds : "calm"}
        className={cn(
          "numeric w-10 text-right text-2xl font-extrabold",
          urgency >= 2 && "text-danger",
        )}
        initial={reduced || urgency < 2 ? false : { scale: 1.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 20 }}
      >
        {urgency === 4 ? "0" : seconds}
      </motion.span>
    </div>
  );
}
