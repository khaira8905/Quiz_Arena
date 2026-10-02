"use client";

import type { GamePhase, PublicQuestion, TimerState } from "@quizarena/shared/game";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatNumber, pad2 } from "@/lib/format";
import { StageAnswerTile, type TileState } from "./answer-tile";
import { Countdown } from "./countdown";

/**
 * The projector question screen. Built for distance: the question is the largest text on
 * screen, answers fill the lower half, and the countdown sits where every eye goes next.
 */
export function StageQuestion({
  question,
  phase,
  timer,
  answeredCount,
  playerCount,
  distribution,
  correctOptionIds,
  showStats,
  showCorrect,
  explanation,
  sound,
}: {
  question: PublicQuestion;
  phase: GamePhase;
  timer: TimerState | null;
  answeredCount: number;
  playerCount: number;
  distribution: Record<string, number>;
  correctOptionIds: string[] | null;
  showStats: boolean;
  showCorrect: boolean;
  explanation: string | null;
  sound: boolean;
}) {
  const reduced = useReducedMotion();
  const revealed = phase === "ANSWER_REVEAL" || phase === "LEADERBOARD";
  const active = phase === "QUESTION_ACTIVE";
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const correct = new Set(revealed && showCorrect ? (correctOptionIds ?? []) : []);

  const tileState = (id: string): TileState => {
    if (!revealed || !showCorrect) return "idle";
    return correct.has(id) ? "correct" : "dimmed";
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={question.id}
        className="flex h-full flex-col gap-[2.6vh]"
        initial={reduced ? false : { opacity: 0, x: "6vw" }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduced ? undefined : { opacity: 0, x: "-6vw" }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ------------------------------------------------ header row */}
        <div className="flex items-start justify-between gap-[2vw]">
          <div className="flex min-w-0 flex-1 flex-col gap-[2vh]">
            <div className="flex items-center gap-[1.4vw]">
              <motion.span
                key={question.index}
                initial={reduced ? false : { y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="numeric text-[clamp(1.5rem,2.6vw,5.5rem)] font-extrabold leading-none text-accent"
              >
                Q{pad2(question.index + 1)}
              </motion.span>
              <span className="numeric text-[clamp(1rem,1.5vw,3rem)] font-bold text-fg-3">
                / {pad2(question.total)}
              </span>
              <ProgressTicks index={question.index} total={question.total} />
              {question.points !== 1000 && (
                <span className="label border border-line-strong px-[0.8vw] py-[0.6vh] text-[clamp(0.7rem,0.9vw,1.75rem)] text-fg-2">
                  {question.points === 0
                    ? "No points"
                    : question.points === 2000
                      ? "Double points"
                      : `${formatNumber(question.points)} pts`}
                </span>
              )}
            </div>
            <div className={cn("flex min-h-0 gap-[2.5vw]", question.imageUrl ? "items-start" : "")}>
              <motion.h1
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0 flex-1 text-stage-question font-display text-balance"
              >
                {question.text}
              </motion.h1>
              {question.imageUrl && (
                <motion.div
                  initial={reduced ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="notch shrink-0 overflow-hidden border border-line-strong bg-sunken"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- organiser-supplied image URL */}
                  <img
                    src={question.imageUrl}
                    alt=""
                    className="block max-h-[30vh] max-w-[34vw] object-contain"
                  />
                </motion.div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-[1.5vh]">
            <Countdown timer={timer} active={active} sound={sound} />
            <AnsweredMeter answered={revealed ? total : answeredCount} players={playerCount} />
          </div>
        </div>

        {/* ------------------------------------------------ answers */}
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-[1.2vw]",
            question.options.length > 2 ? "grid-cols-2 grid-rows-2" : "grid-cols-2 grid-rows-1",
          )}
        >
          {question.options.map((o, i) => {
            const count = distribution[o.id] ?? 0;
            return (
              <StageAnswerTile
                key={o.id}
                index={i}
                text={o.text}
                state={tileState(o.id)}
                count={count}
                share={total ? count / total : 0}
                showStats={revealed && showStats}
                delay={reduced ? 0 : 0.18 + i * 0.07}
              />
            );
          })}
        </div>

        {/* ------------------------------------------------ status ribbons */}
        <AnimatePresence>
          {phase === "QUESTION_LOCKED" && (
            <motion.div
              key="locked"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-[1vw] border-y border-danger/50 bg-danger-soft py-[1.2vh]"
            >
              <span className="font-display text-[clamp(1.25rem,2vw,4rem)] font-extrabold uppercase tracking-[-0.02em] text-danger">
                Time&apos;s up
              </span>
              <span className="label text-[clamp(0.7rem,1vw,2rem)] text-fg-2">Answers locked</span>
            </motion.div>
          )}
          {revealed && explanation && (
            <motion.p
              key="explain"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="border-l-[0.3vw] border-accent bg-surface px-[1.4vw] py-[1.4vh] text-[clamp(1rem,1.4vw,3rem)] leading-snug text-fg-2"
            >
              <span className="label mr-[0.8vw] text-accent">Why</span>
              {explanation}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function ProgressTicks({ index, total }: { index: number; total: number }) {
  if (total > 30) return null;
  return (
    <span className="flex items-center gap-[0.25vw]" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-[0.7vh] w-[1.1vw] transition-colors",
            i < index ? "bg-fg-3" : i === index ? "bg-accent" : "bg-line-strong",
          )}
        />
      ))}
    </span>
  );
}

function AnsweredMeter({ answered, players }: { answered: number; players: number }) {
  const share = players ? Math.min(1, answered / players) : 0;
  return (
    <div className="w-[min(17vh,17vw)] text-center" aria-live="polite">
      <div className="numeric text-[clamp(1.25rem,2vw,4rem)] font-extrabold leading-none">
        {answered}
        <span className="text-fg-3">/{players}</span>
      </div>
      <div className="label mt-[0.6vh] text-[clamp(0.6rem,0.8vw,1.5rem)] text-fg-3">Answered</div>
      <div className="mt-[0.8vh] h-[0.6vh] bg-line">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${share * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}
