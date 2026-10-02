"use client";

import { Check, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { answerStyle } from "./answer-style";

export type TileState = "idle" | "selected" | "dimmed" | "correct" | "wrong" | "neutral";

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
}: {
  index: number;
  text: string;
  state: TileState;
  count?: number;
  share?: number;
  showStats?: boolean;
  delay?: number;
}) {
  const style = answerStyle(index);
  const reduced = useReducedMotion();
  const dim = state === "dimmed" || state === "wrong";

  return (
    <motion.div
      layout
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.97 }}
      animate={{
        opacity: dim ? 0.32 : 1,
        y: 0,
        scale: state === "correct" ? 1.025 : 1,
        filter: dim ? "saturate(0.35)" : "saturate(1)",
      }}
      transition={{ delay, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "notch relative flex min-h-0 items-center gap-[1.4vw] overflow-hidden px-[1.6vw] py-[1.8vh] text-answer-ink",
        style.bg,
        state === "correct" && "z-10 outline outline-[0.35vw] -outline-offset-[0.35vw] outline-fg",
      )}
    >
      {showStats && share !== undefined && (
        <motion.div
          className="absolute inset-y-0 left-0 bg-answer-ink/22"
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(share * 100)}%` }}
          transition={{ delay: delay + 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden
        />
      )}
      <span
        className="relative grid aspect-square w-[clamp(2.75rem,4.4vw,9rem)] shrink-0 place-items-center bg-answer-ink font-display text-[clamp(1.5rem,2.4vw,5rem)] font-extrabold"
        style={{ color: style.fill }}
      >
        {state === "correct" ? (
          <Check className="h-[55%] w-[55%]" strokeWidth={3.5} />
        ) : (
          style.letter
        )}
      </span>
      <span className="relative min-w-0 flex-1 text-stage-answer">{text}</span>
      {showStats && count !== undefined && (
        <span className="relative shrink-0 text-right">
          <span className="numeric block text-[clamp(1.5rem,2.6vw,5.5rem)] font-extrabold leading-none">
            {count}
          </span>
          <span className="numeric mt-[0.6vh] block text-[clamp(0.9rem,1.2vw,2.6rem)] font-bold opacity-75">
            {Math.round((share ?? 0) * 100)}%
          </span>
        </span>
      )}
    </motion.div>
  );
}

/**
 * Phone answer button. Big, thumb-reachable, instant: press compresses, selection confirms,
 * reveal shows correct (pop) or wrong (shake).
 */
export function PhoneAnswerButton({
  index,
  text,
  state,
  disabled,
  onPress,
  compact,
}: {
  index: number;
  text: string;
  state: TileState;
  disabled?: boolean;
  onPress?: () => void;
  compact?: boolean;
}) {
  const style = answerStyle(index);
  const reduced = useReducedMotion();
  const dim = state === "dimmed";

  const animate =
    state === "wrong" && !reduced
      ? { x: [0, -10, 9, -6, 4, 0], opacity: 1 }
      : state === "correct" && !reduced
        ? { scale: [1, 1.06, 1], opacity: 1 }
        : { scale: state === "selected" ? 1.02 : 1, opacity: dim ? 0.3 : 1, x: 0 };

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onPress}
      aria-pressed={state === "selected" || undefined}
      aria-label={`${style.letter}: ${text}${state === "correct" ? " — correct answer" : state === "wrong" ? " — your answer, incorrect" : ""}`}
      whileHover={disabled || reduced ? undefined : { y: -3 }}
      whileTap={disabled || reduced ? undefined : { scale: 0.95 }}
      animate={animate}
      transition={{ duration: state === "wrong" ? 0.42 : 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "notch relative flex min-h-0 flex-col justify-between overflow-hidden p-4 text-left text-answer-ink transition-[filter] disabled:cursor-default",
        style.bg,
        compact ? "gap-2" : "gap-3",
        state === "selected" && "outline outline-4 -outline-offset-4 outline-fg",
        state === "correct" && "outline outline-4 -outline-offset-4 outline-fg",
        state === "wrong" && "saturate-50",
      )}
    >
      <span className="flex items-start justify-between">
        <span
          className={cn(
            "grid aspect-square place-items-center bg-answer-ink font-display font-extrabold",
            compact ? "w-10 text-xl" : "w-12 text-2xl",
          )}
          style={{ color: style.fill }}
        >
          {style.letter}
        </span>
        {state === "correct" && <Check className="h-8 w-8" strokeWidth={3.5} aria-hidden />}
        {state === "wrong" && <X className="h-8 w-8" strokeWidth={3.5} aria-hidden />}
        {state === "selected" && (
          <span className="label rounded-sm bg-answer-ink px-2 py-1 text-fg">Locked in</span>
        )}
      </span>
      <span
        className={cn(
          "font-display font-bold leading-tight tracking-[-0.015em]",
          compact ? "text-base" : "text-lg sm:text-xl",
          "line-clamp-4",
        )}
      >
        {text}
      </span>
    </motion.button>
  );
}
