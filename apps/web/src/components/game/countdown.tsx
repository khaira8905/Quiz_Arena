"use client";

import type { TimerState } from "@quizarena/shared/game";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { TimerStyle } from "@quizarena/shared/appearance";
import { useArena } from "@/components/arena/arena-theme";
import { cn } from "@/lib/cn";
import { play } from "@/lib/sound";
import { tensionFor, urgencyFor, useCountdown } from "@/lib/use-countdown";
import { EASE } from "@/lib/motion";

/**
 * The countdown is a core game element, not a widget. Urgency escalates through motion,
 * scale and weight — colour shifts too, but is never the only signal:
 *   >10s calm · 10s soft wave, ring thickens · 5s ring tightens · 3s pulse ·
 *   1s major pulse · 0 burst.
 */
const RING = {
  stroke: ["var(--accent)", "var(--warning)", "var(--danger)", "var(--danger)", "var(--danger)"],
};
/** Pulse size per tension level: calm, 10s, 5s, 3s, 2s, 1s. */
const PULSE = [1, 1.02, 1.045, 1.075, 1.09, 1.14];

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
  const tension = tensionFor(seconds, active && !timer?.paused);
  const reduced = useReducedMotion();
  const { appearance, motion: arenaMotion } = useArena();
  // The operator's panel always uses the ring; the projector follows the arena's style.
  const look: TimerStyle = variant === "panel" ? "CIRCULAR" : appearance.timerStyle;
  const lively = !reduced && arenaMotion.emphasis;
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (!sound || !active || timer?.paused) return;
    if (seconds !== lastTick.current && seconds > 0 && seconds <= 5)
      play(seconds <= 3 ? "tickUrgent" : "tick");
    lastTick.current = seconds;
  }, [seconds, sound, active, timer?.paused]);

  const stage = variant === "stage";
  const label = timer?.paused ? `Paused with ${seconds} seconds left` : `${seconds} seconds left`;
  const digit = (fontSize: string) => (
    <AnimatePresence mode="popLayout" initial={false}>
      {urgency === 4 ? (
        <motion.span
          key="zero"
          className="numeric font-extrabold text-danger"
          style={{ fontSize }}
          initial={lively ? { scale: 1.6, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
        >
          0
        </motion.span>
      ) : (
        <motion.span
          key={seconds}
          className={cn(
            "numeric font-extrabold",
            urgency >= 2 && look !== "CIRCULAR" && "text-danger",
          )}
          style={{ fontSize }}
          initial={
            reduced ? false : { y: "-40%", opacity: 0, scale: lively && urgency >= 2 ? 1.5 : 1 }
          }
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={reduced ? undefined : { y: "40%", opacity: 0, scale: 0.8 }}
          transition={{ duration: urgency >= 2 ? 0.28 : 0.22, ease: EASE.out }}
        >
          {seconds}
        </motion.span>
      )}
    </AnimatePresence>
  );
  const paused = timer?.paused && (
    <span className="label mt-1 text-[clamp(0.75rem,0.9vw,1.75rem)] text-warning">Paused</span>
  );

  if (look === "DIGITAL" || look === "PROGRESS" || look === "MINIMAL") {
    // DIGITAL: a scoreboard panel. MINIMAL / PROGRESS: the number alone (PROGRESS draws its
    // bar across the stage, see StageTimerBar).
    const panel = look === "DIGITAL";
    return (
      <motion.div
        role="timer"
        aria-live={urgency >= 2 ? "assertive" : "off"}
        aria-label={label}
        className={cn(
          "relative flex shrink-0 flex-col items-center justify-center leading-none",
          panel && "notch border-2 bg-sunken px-[1.6vw] pb-[1.4vh] pt-[1.2vh]",
          panel &&
            (urgency >= 2
              ? "border-danger"
              : urgency === 1
                ? "border-warning"
                : "border-line-strong"),
          className,
        )}
        style={{ minWidth: panel ? "min(19vh,19vw)" : undefined }}
        animate={
          lively && urgency >= 1 && urgency < 4
            ? { scale: [1, 1 + 0.03 * urgency, 1] }
            : { scale: 1 }
        }
        transition={{ duration: 0.45, ease: "easeOut" }}
        key={lively && urgency >= 1 && urgency < 4 ? `pulse-${seconds}` : "static"}
      >
        {digit(look === "MINIMAL" || look === "PROGRESS" ? "min(6vh,6vw)" : "min(8vh,8vw)")}
        {panel && (
          <span className="mt-[1vh] block h-[0.6vh] w-full bg-line">
            <span
              className={cn(
                "block h-full origin-left",
                urgency >= 2 ? "bg-danger" : urgency === 1 ? "bg-warning" : "bg-accent",
              )}
              style={{ transform: `scaleX(${progress})` }}
            />
          </span>
        )}
        {paused}
      </motion.div>
    );
  }

  const size = stage ? "min(17vh,17vw)" : "7.5rem";
  const r = 46;
  const c = 2 * Math.PI * r;

  return (
    <div
      role="timer"
      aria-live={urgency >= 2 ? "assertive" : "off"}
      aria-label={label}
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Ten seconds left: one soft wave, the first signal that time is running down. */}
      <AnimatePresence>
        {lively && seconds === 10 && urgency === 0 && active && !timer?.paused && (
          <motion.span
            key="wave-10"
            className="absolute inset-0 rounded-full border-2 border-accent"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Shockwave on each urgent second */}
      <AnimatePresence>
        {lively && urgency >= 2 && urgency < 4 && (
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

      {/* Zero: an impact ring, once. */}
      <AnimatePresence>
        {lively && tension === 6 && (
          <motion.span
            key="impact"
            className="absolute inset-0 rounded-full border-[3px] border-danger"
            initial={{ scale: 0.9, opacity: 0.9 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </AnimatePresence>

      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 -rotate-90"
        animate={
          lively
            ? tension === 6
              ? // Impact: a short, controlled shake.
                { scale: [1.12, 1], x: [0, -6, 6, -4, 3, 0] }
              : tension >= 1
                ? {
                    // Two seconds: rapid tension, two beats a second.
                    scale:
                      tension === 4 ? [1, PULSE[4]!, 1, PULSE[4]!, 1] : [1, PULSE[tension]!, 1],
                  }
                : { scale: 1 }
            : undefined
        }
        transition={{
          duration: tension === 6 ? 0.45 : tension === 4 ? 0.8 : 0.45,
          ease: "easeOut",
        }}
        key={lively && tension >= 1 ? `pulse-${seconds}-${tension}` : "static"}
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
          // 10s: the ring thickens; 3s and under: thicker still.
          strokeWidth={urgency >= 2 ? 7 : active && seconds <= 10 ? 6 : 5}
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke 250ms, stroke-width 250ms" }}
        />
      </motion.svg>

      <div className="relative flex flex-col items-center leading-none">
        {digit(stage ? "min(7.5vh,7.5vw)" : "2.75rem")}
        {paused}
      </div>
    </div>
  );
}

/**
 * PROGRESS timer style: a full-width bar across the stage that drains towards zero, the
 * most legible style from the back of a hall.
 */
export function StageTimerBar({ timer, active }: { timer: TimerState | null; active: boolean }) {
  const { seconds, progress } = useCountdown(timer, active, { fine: true });
  const urgency = urgencyFor(seconds, active && !timer?.paused);
  return (
    <div className="h-[1.2vh] min-h-2 w-full shrink-0 bg-line" aria-hidden>
      <div
        className={cn(
          "h-full origin-left transition-colors",
          urgency >= 2 ? "bg-danger" : urgency === 1 ? "bg-warning" : "bg-accent",
        )}
        style={{ transform: `scaleX(${progress})` }}
      />
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
          className={cn("absolute inset-0 origin-left transition-colors", color)}
          style={{ transform: `scaleX(${progress})` }}
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
