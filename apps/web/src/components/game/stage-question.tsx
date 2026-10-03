"use client";

import type { GamePhase, PublicQuestion, TimerState } from "@quizarena/shared/game";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { screenTransition, useArena } from "@/components/arena/arena-theme";
import { cn } from "@/lib/cn";
import { formatNumber, pad2 } from "@/lib/format";
import { answerScale, questionScale } from "@/lib/text-fit";
import { StageDistribution } from "@/components/stage/stage-distribution";
import { useCountdown } from "@/lib/use-countdown";
import { StageAnswerTile, type TileState } from "./answer-tile";
import { Countdown, StageTimerBar } from "./countdown";

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
  readingEndsAt = null,
  serverTime = 0,
}: {
  question: PublicQuestion;
  phase: GamePhase;
  timer: TimerState | null;
  answeredCount: number;
  playerCount: number;
  /** Null while it's private (before the stats step, or when the quiz hides stats). */
  distribution: Record<string, number> | null;
  correctOptionIds: string[] | null;
  showStats: boolean;
  showCorrect: boolean;
  explanation: string | null;
  sound: boolean;
  /** Reading period: when answers open (null = the host opens them). */
  readingEndsAt?: number | null;
  serverTime?: number;
}) {
  const reduced = useReducedMotion();
  const { appearance, motion: arenaMotion } = useArena();
  const enter = screenTransition(appearance.transition, arenaMotion, "stage", reduced);
  const layout = appearance.projectorLayout;
  const minimal = layout === "MINIMAL";
  const qScale = questionScale(question.text);
  const aScale = answerScale(question.options.map((o) => o.text)) * (layout === "WIDE" ? 0.86 : 1);
  const revealed = phase === "ANSWER_REVEAL" || phase === "LEADERBOARD";
  const active = phase === "QUESTION_ACTIVE";
  const reading = phase === "QUESTION_READING";
  const dist = distribution ?? {};
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  // The stats step, and a reveal that keeps the stats on screen, use answer bars.
  const bars =
    distribution !== null && (phase === "ANSWER_DISTRIBUTION" || (revealed && showStats));
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
        initial={enter.initial}
        animate={enter.animate}
        exit={enter.exit}
        transition={enter.transition}
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
              {!minimal && <ProgressTicks index={question.index} total={question.total} />}
              {question.points !== 1000 && (
                <span className="label border border-line-strong px-[0.8vw] py-[0.6vh] text-[clamp(0.75rem,0.9vw,1.75rem)] text-fg-2">
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
                className="min-w-0 flex-1 text-stage-question font-display text-balance break-words"
                style={
                  qScale < 1
                    ? { fontSize: `calc(var(--text-stage-question) * ${qScale})` }
                    : undefined
                }
              >
                {question.text}
              </motion.h1>
              {question.imageUrl && (
                <motion.div
                  initial={reduced ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="shrink-0 overflow-hidden rounded-lg border border-line-strong bg-sunken"
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
            {!bars && <Countdown timer={timer} active={active} sound={sound} />}
            {!minimal && !reading && (
              <AnsweredMeter
                answered={distribution ? total : answeredCount}
                players={playerCount}
              />
            )}
          </div>
        </div>

        {appearance.timerStyle === "PROGRESS" && <StageTimerBar timer={timer} active={active} />}

        {/* ------------------------------------------------ answers */}
        {reading ? (
          <ReadingPanel endsAt={readingEndsAt} serverTime={serverTime} />
        ) : bars ? (
          <div className="min-h-[38vh] flex-1">
            <StageDistribution
              question={question}
              distribution={dist}
              correctOptionIds={revealed && showCorrect ? correctOptionIds : null}
            />
          </div>
        ) : (
          <div
            className={cn(
              "grid min-h-[38vh] flex-1 gap-[1.2vw]",
              layout === "WIDE"
                ? question.options.length > 2
                  ? "grid-cols-4 grid-rows-1"
                  : "grid-cols-2 grid-rows-1"
                : question.options.length > 2
                  ? "grid-cols-2 grid-rows-2"
                  : "grid-cols-2 grid-rows-1",
            )}
          >
            {question.options.map((o, i) => {
              const count = dist[o.id] ?? 0;
              return (
                <StageAnswerTile
                  key={o.id}
                  index={i}
                  text={o.text}
                  state={tileState(o.id)}
                  count={count}
                  share={total ? count / total : 0}
                  showStats={false}
                  delay={reduced ? 0 : 0.12 + i * 0.09}
                  textScale={aScale}
                  vertical={layout === "WIDE" && question.options.length > 2}
                />
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------ status ribbons */}
        {/* The slot is reserved while a question is open, so "Time's up" appearing never
            reflows the answer grid. */}
        <div className={cn("shrink-0", !revealed && "min-h-[6.5vh]")}>
          <AnimatePresence mode="wait">
            {phase === "ANSWER_DISTRIBUTION" && (
              <motion.p
                key="stats"
                initial={reduced ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center font-display text-[clamp(1.25rem,2.2vw,4.5rem)] font-extrabold uppercase tracking-[-0.02em] text-fg-2"
              >
                What did everyone choose?
              </motion.p>
            )}
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
                <span className="label text-[clamp(0.75rem,1vw,2rem)] text-fg-2">
                  Answers locked
                </span>
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
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * The reading period: the room reads the question before anyone can answer. The answer
 * area holds its size so the tiles arrive without the question moving.
 */
function ReadingPanel({ endsAt, serverTime }: { endsAt: number | null; serverTime: number }) {
  const reduced = useReducedMotion();
  const timer: TimerState | null = endsAt
    ? {
        startedAt: serverTime,
        deadline: endsAt,
        durationMs: Math.max(1, endsAt - serverTime),
        paused: false,
        remainingMs: Math.max(0, endsAt - serverTime),
      }
    : null;
  const { seconds, progress } = useCountdown(timer, !!timer, { fine: true });
  return (
    <div className="flex min-h-[38vh] flex-1 flex-col items-center justify-center gap-[3vh] border border-dashed border-line-strong">
      <motion.p
        initial={reduced ? false : { opacity: 0, letterSpacing: "0.3em" }}
        animate={{ opacity: 1, letterSpacing: "0.08em" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-[clamp(1.5rem,3vw,6.5rem)] font-extrabold uppercase text-fg-2"
      >
        Read the question
      </motion.p>
      {timer ? (
        <>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={seconds}
              initial={reduced ? false : { y: "-30%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: "30%", opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="numeric text-[clamp(3rem,7vw,15rem)] font-extrabold leading-none text-accent"
            >
              {seconds}
            </motion.span>
          </AnimatePresence>
          <div className="h-[0.8vh] w-[30vw] bg-line">
            <div
              className="h-full origin-left bg-accent"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <p className="label text-[clamp(0.8rem,1.1vw,2.2rem)] text-fg-3">Answers open soon</p>
        </>
      ) : (
        <p className="label text-[clamp(0.8rem,1.1vw,2.2rem)] text-fg-3">
          Answers open when the host starts the timer
        </p>
      )}
    </div>
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
      <div className="label mt-[0.6vh] text-[clamp(0.75rem,0.85vw,1.6rem)] text-fg-3">Answered</div>
      <div className="mt-[0.8vh] h-[0.6vh] bg-line">
        <motion.div
          className="h-full origin-left bg-accent"
          initial={false}
          animate={{ scaleX: share }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}
