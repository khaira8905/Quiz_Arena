"use client";

import type { PublicQuestion } from "@quizarena/shared/game";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useArena } from "@/components/arena/arena-theme";
import { answerStyle } from "@/components/game/answer-style";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/cn";
import { answerScale } from "@/lib/text-fit";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * "What did everyone choose?" — one horizontal bar per answer. Bars grow from zero while
 * the counts tick up, then hold. On the reveal the same bars stay put and the correct one
 * takes the spotlight, so the room watches the answer land instead of a screen swap.
 */
export function StageDistribution({
  question,
  distribution,
  correctOptionIds,
}: {
  question: PublicQuestion;
  distribution: Record<string, number>;
  /** Null until the reveal (or when the quiz keeps correct answers private). */
  correctOptionIds: string[] | null;
}) {
  const reduced = useReducedMotion();
  const { motion: arenaMotion } = useArena();
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const top = Math.max(1, ...question.options.map((o) => distribution[o.id] ?? 0));
  const correct = correctOptionIds ? new Set(correctOptionIds) : null;
  const aScale = answerScale(question.options.map((o) => o.text));
  // Slower and bigger than any phone motion: a room of people reads this together.
  const grow = reduced ? 0 : 1.4 / Math.max(0.6, arenaMotion.amplitude ** 0.25);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-[1.6vh]">
      {question.options.map((o, i) => {
        const s = answerStyle(i);
        const count = distribution[o.id] ?? 0;
        const share = total ? count / total : 0;
        const isCorrect = correct?.has(o.id) ?? false;
        const dim = correct !== null && !isCorrect;
        return (
          <motion.div
            key={o.id}
            className={cn("relative flex min-h-0 flex-1 items-center gap-[1.4vw]")}
            initial={reduced ? false : { opacity: 0, x: "-2vw" }}
            animate={{
              opacity: dim ? 0.38 : 1,
              x: 0,
              scale: isCorrect && arenaMotion.emphasis && !reduced ? 1.015 : 1,
            }}
            transition={{ delay: reduced ? 0 : i * 0.09, duration: 0.5, ease: EASE }}
          >
            <span
              className={cn(
                "notch-sm grid aspect-square h-[min(9vh,100%)] shrink-0 place-items-center font-display text-[clamp(1.5rem,2.6vw,5.5rem)] font-extrabold",
                s.bg,
                s.ink,
              )}
            >
              {isCorrect ? (
                <Check className="h-[55%] w-[55%]" strokeWidth={3.5} aria-label="Correct" />
              ) : (
                s.letter
              )}
            </span>
            <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-[1vh]">
              <span
                className="min-w-0 truncate text-stage-answer"
                style={
                  aScale < 1
                    ? { fontSize: `calc(var(--text-stage-answer) * ${aScale})` }
                    : undefined
                }
              >
                {o.text}
              </span>
              {/* The bar: scaled from the left edge, relative to the most-picked answer so
                  the leader fills the track and small differences stay visible. Text never
                  sits on the fill, so it reads the same in every theme. */}
              <div
                className={cn(
                  "relative h-[min(3.4vh,40%)] min-h-3 overflow-hidden bg-line",
                  isCorrect && "outline outline-[0.25vw] outline-offset-[0.25vw] outline-fg",
                )}
              >
                <motion.div
                  className={cn("absolute inset-0 origin-left", s.bg)}
                  initial={reduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: count / top }}
                  transition={{ delay: reduced ? 0 : 0.25 + i * 0.09, duration: grow, ease: EASE }}
                  aria-hidden
                />
              </div>
            </div>
            <div className="w-[13vw] shrink-0 text-right">
              <AnimatedNumber
                value={count}
                from={reduced ? count : 0}
                duration={grow}
                className="numeric block text-[clamp(1.75rem,3.4vw,7rem)] font-extrabold leading-none"
              />
              <AnimatedNumber
                value={Math.round(share * 100)}
                from={reduced ? Math.round(share * 100) : 0}
                duration={grow}
                format={(n) => `${n}%`}
                className="numeric mt-[0.4vh] block text-[clamp(1rem,1.5vw,3rem)] font-bold text-fg-2"
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
