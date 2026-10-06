"use client";

import { Check, Lock, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useArena } from "@/components/arena/arena-theme";
import { cn } from "@/lib/cn";
import { answerStyle } from "./answer-style";
import { EASE } from "@/lib/motion";
import { Sweep } from "@/components/motion/sweep";

export type TileState = "idle" | "selected" | "dimmed" | "correct" | "wrong" | "neutral";

/**
 * Tiles are notched (clip-path), which would cut a border or outline off at the corner.
 * Highlighted tiles are instead drawn as two notched layers: a frame-coloured outer layer
 * with padding and the answer colour inside it, so the frame follows the notch.
 */

/**
 * Stage (projector) answer tile. On reveal it doubles as a meter: an ink layer fills to the
 * share of the room that picked it, with the count printed — no separate chart to read.
 */
export function StageAnswerTile({
  index,
  text,
  state,
  count,
  share,
  showStats,
  delay = 0,
  textScale = 1,
  vertical = false,
}: {
  index: number;
  text: string;
  state: TileState;
  count?: number;
  share?: number;
  showStats?: boolean;
  delay?: number;
  /** From answerScale(): long answers step down instead of being clipped. */
  textScale?: number;
  /** Narrow columns (WIDE layout): letter above the text so the text gets the full width. */
  vertical?: boolean;
}) {
  const style = answerStyle(index);
  const reduced = useReducedMotion();
  const { motion: arenaMotion } = useArena();
  const dim = state === "dimmed" || state === "wrong";
  const framed = state === "correct";
  const lift = 24 * arenaMotion.amplitude;

  return (
    <motion.div
      // 4. Answers rise off the floor of the stage in turn, tipping up to face the room.
      initial={
        reduced
          ? false
          : arenaMotion.emphasis
            ? { opacity: 0, y: lift, z: -240, rotateX: 32, transformPerspective: 1200 }
            : { opacity: 0, y: lift, scale: 0.97 }
      }
      animate={{
        opacity: dim ? 0.32 : 1,
        y: 0,
        z: 0,
        rotateX: 0,
        transformPerspective: 1200,
        scale: framed && arenaMotion.emphasis ? 1.03 : 1,
        filter: dim ? "saturate(0.35)" : "saturate(1)",
      }}
      transition={{
        delay,
        y: { delay, type: "spring", stiffness: 210, damping: 22 },
        rotateX: { delay, type: "spring", stiffness: 160, damping: 20 },
        z: { delay, duration: 0.6, ease: EASE.emphasis },
        default: { delay, duration: 0.42, ease: EASE.out },
      }}
      className={cn("notch relative min-h-0", framed ? "z-10 bg-fg p-[0.35vw]" : style.bg)}
    >
      <div
        className={cn(
          "relative flex h-full overflow-hidden px-[1.6vw] py-[1.8vh]",
          vertical ? "flex-col items-start gap-[1.6vh]" : "items-center gap-[1.4vw]",
          framed && "notch",
          style.bg,
          style.ink,
        )}
      >
        {/* A glint as the tile lands, and again when it's revealed as correct. */}
        <Sweep
          play={!reduced && arenaMotion.emphasis && (state === "idle" || state === "correct")}
          run={state}
          delay={state === "correct" ? 0.2 : delay + 0.3}
        />
        {showStats && share !== undefined && (
          <motion.div
            className={cn("absolute inset-y-0 left-0 origin-left", style.meter)}
            style={{ width: "100%" }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: share }}
            transition={{ delay: delay + 0.15, duration: 0.9, ease: EASE.emphasis }}
            aria-hidden
          />
        )}
        <span
          className={cn(
            "relative grid aspect-square w-[clamp(2.75rem,4.4vw,9rem)] shrink-0 place-items-center font-display text-[clamp(1.5rem,2.4vw,5rem)] font-extrabold",
            style.inkBg,
          )}
          style={{ color: style.fill }}
        >
          {state === "correct" ? (
            <Check className="h-[55%] w-[55%]" strokeWidth={3.5} aria-label="Correct" />
          ) : (
            style.letter
          )}
        </span>
        <span
          className="relative min-w-0 flex-1 text-stage-answer break-words"
          style={
            textScale < 1
              ? { fontSize: `calc(var(--text-stage-answer) * ${textScale})` }
              : undefined
          }
        >
          {text}
        </span>
        {showStats && count !== undefined && (
          <span
            className={cn(
              "relative shrink-0",
              vertical ? "flex w-full items-baseline justify-between" : "text-right",
            )}
          >
            <span className="numeric block text-[clamp(1.5rem,2.6vw,5.5rem)] font-extrabold leading-none">
              {count}
            </span>
            <span className="numeric mt-[0.6vh] block text-[clamp(1rem,1.2vw,2.6rem)] font-bold opacity-80">
              {Math.round((share ?? 0) * 100)}%
            </span>
          </span>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Phone answer button. Big, thumb-reachable, instant: press compresses, selection confirms,
 * reveal shows correct (pop) or wrong (shake). `rows` lays the button out horizontally for
 * long answers, so the full text stays readable instead of being truncated.
 */
export function PhoneAnswerButton({
  index,
  text,
  state,
  disabled,
  onPress,
  compact,
  rows,
}: {
  index: number;
  text: string;
  state: TileState;
  disabled?: boolean;
  onPress?: () => void;
  compact?: boolean;
  rows?: boolean;
}) {
  const style = answerStyle(index);
  const reduced = useReducedMotion();
  const { motion: arenaMotion } = useArena();
  const dim = state === "dimmed";
  const framed = state === "selected" || state === "correct";
  const lively = !reduced && arenaMotion.emphasis;

  const animate =
    state === "wrong" && lively
      ? { x: [0, -10, 9, -6, 4, 0], opacity: 1 }
      : state === "correct" && lively
        ? { scale: [1, 1.06, 1], opacity: 1 }
        : state === "selected" && lively
          ? // Strong confirmation: a squash, then it settles slightly proud of the rest.
            { scale: [0.94, 1.05, 1.02], opacity: 1, x: 0 }
          : { scale: state === "selected" ? 1.02 : 1, opacity: dim ? 0.3 : 1, x: 0 };

  const letter = (
    <span
      className={cn(
        "grid aspect-square shrink-0 place-items-center font-display font-extrabold",
        compact || rows ? "w-10 text-xl" : "w-12 text-2xl",
        style.inkBg,
      )}
      style={{ color: style.fill }}
    >
      {style.letter}
    </span>
  );
  const badge =
    state === "correct" ? (
      <Check className="h-7 w-7 shrink-0" strokeWidth={3.5} aria-hidden />
    ) : state === "wrong" ? (
      <X className="h-7 w-7 shrink-0" strokeWidth={3.5} aria-hidden />
    ) : state === "selected" ? (
      // Icon, not text: a "Locked in" label doesn't fit a 360px phone's half-width tile,
      // and the status line under the grid already says it in words.
      <span
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", style.inkBg)}
        style={{ color: style.fill }}
      >
        <Lock className="h-4 w-4" strokeWidth={3} aria-hidden />
      </span>
    ) : null;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onPress}
      aria-pressed={state === "selected" || undefined}
      aria-label={`${style.letter}: ${text}${state === "correct" ? " — correct answer" : state === "wrong" ? " — your answer, incorrect" : ""}`}
      // Tactile: lifts and leans back on hover (desktop players), compresses on press.
      whileHover={
        disabled || reduced ? undefined : { y: -4, rotateX: 7, transformPerspective: 700 }
      }
      whileTap={disabled || reduced ? undefined : { scale: 0.94, rotateX: 0, y: 0 }}
      animate={animate}
      transition={{ duration: state === "wrong" ? 0.42 : 0.25, ease: EASE.out }}
      className={cn(
        "notch relative flex min-h-0 text-left disabled:cursor-default",
        framed ? "bg-fg p-1" : style.bg,
      )}
    >
      <span
        className={cn(
          "relative flex min-h-0 w-full overflow-hidden",
          rows ? "items-center gap-3 px-3 py-2" : "flex-col justify-between p-4",
          !rows && (compact ? "gap-2" : "gap-3"),
          framed && "notch",
          state === "wrong" && "saturate-50",
          style.bg,
          style.ink,
        )}
      >
        {/* A flash of light as the choice locks in. */}
        {state === "selected" && lively && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-white"
            initial={{ opacity: 0.45 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE.out }}
          />
        )}
        {rows ? (
          <>
            {letter}
            <span className="min-w-0 flex-1 font-display text-base font-bold leading-snug tracking-[-0.01em] break-words">
              {text}
            </span>
            {badge}
          </>
        ) : (
          <>
            <span className="flex items-start justify-between gap-2">
              {letter}
              {badge}
            </span>
            <span
              className={cn(
                "font-display font-bold leading-tight tracking-[-0.015em] break-words",
                compact ? "text-base" : "text-lg sm:text-xl",
              )}
            >
              {text}
            </span>
          </>
        )}
      </span>
    </motion.button>
  );
}
