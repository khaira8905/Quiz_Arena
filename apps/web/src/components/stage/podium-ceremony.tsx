"use client";

import type { FinalResults, FinalStanding, PodiumStep } from "@quizarena/shared/game";
import { Crown, Flame } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Confetti } from "@/components/game/confetti";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent } from "@/lib/format";
import { play } from "@/lib/sound";

const PAGE_SIZE = 10;
const PAGE_MS = 7000;

/**
 * The finale, paced by the host: each PODIUM_NEXT step reveals one place, third to first,
 * then the full standings. Nothing advances on its own, so the host can build suspense and
 * talk over it. Every viewer of the stage (projector, preview) follows the same step.
 */
export function PodiumCeremony({
  results,
  quizTitle,
  step,
  sound,
}: {
  results: FinalResults;
  quizTitle: string;
  step: PodiumStep;
  sound: boolean;
}) {
  const reduced = useReducedMotion();
  const [first, second, third] = results.standings;
  const lastStep = useRef<PodiumStep | null>(null);

  useEffect(() => {
    if (lastStep.current === step) return;
    const initial = lastStep.current === null;
    lastStep.current = step;
    if (!sound || initial) return;
    if (step === "THIRD" || step === "SECOND") play("reveal");
    if (step === "FIRST") play("winner");
    if (step === "BOARD") play("leaderboard");
  }, [step, sound]);

  if (!first) {
    return (
      <div className="grid h-full place-items-center text-center">
        <div>
          <p className="label text-[clamp(0.8rem,1.2vw,2.4rem)] text-fg-3">Game over</p>
          <h1 className="mt-[2vh] font-display text-[clamp(2.5rem,5vw,10rem)] font-extrabold uppercase leading-none tracking-[-0.04em]">
            No players this time
          </h1>
        </div>
      </div>
    );
  }

  const shown = (place: number) =>
    step === "BOARD" ||
    (place === 3 && ["THIRD", "SECOND", "FIRST"].includes(step)) ||
    (place === 2 && ["SECOND", "FIRST"].includes(step)) ||
    (place === 1 && step === "FIRST");

  return (
    <div className="relative h-full">
      <Confetti
        fire={step === "FIRST" ? "champion" : null}
        intensity={1.5}
        origin={{ x: 0.5, y: 0.35 }}
      />
      {/* A crossfade, not "wait": the board never waits on the podium's exit animation
          (which a background or minimised projector window would never finish). */}
      <AnimatePresence initial={false}>
        {step === "BOARD" ? (
          <motion.div
            key="board"
            className="absolute inset-0"
            initial={reduced ? false : { opacity: 0, y: "3vh" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <FullStandings results={results} quizTitle={quizTitle} />
          </motion.div>
        ) : (
          <motion.div
            key="podium"
            className="absolute inset-0 flex flex-col"
            exit={reduced ? undefined : { opacity: 0, y: "-3vh" }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center">
              <p className="label text-[clamp(0.8rem,1.2vw,2.4rem)] text-fg-3">{quizTitle}</p>
              <AnimatePresence mode="wait">
                <motion.h1
                  key={step === "COMPLETE" ? "complete" : step === "SECOND" ? "next" : "results"}
                  initial={reduced ? false : { opacity: 0, y: "-2vh", scale: 1.04 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-[1vh] font-display text-[clamp(2rem,4.4vw,9rem)] font-extrabold uppercase leading-none tracking-[-0.04em]"
                >
                  {step === "COMPLETE"
                    ? "Quiz complete"
                    : step === "SECOND"
                      ? "And the champion is…"
                      : "Final results"}
                </motion.h1>
              </AnimatePresence>
              {step === "COMPLETE" && (
                <motion.p
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-[2vh] text-[clamp(1rem,1.6vw,3.2rem)] text-fg-2"
                >
                  {results.participantCount} {results.participantCount === 1 ? "player" : "players"}{" "}
                  · {results.playedQuestions}{" "}
                  {results.playedQuestions === 1 ? "question" : "questions"} · the podium is next
                </motion.p>
              )}
            </div>

            <div className="mt-auto grid grid-cols-3 items-end gap-[2vw] px-[6vw]">
              <PodiumColumn entry={second} place={2} show={shown(2)} height="38vh" />
              <PodiumColumn entry={first} place={1} show={shown(1)} height="52vh" champion />
              <PodiumColumn entry={third} place={3} show={shown(3)} height="28vh" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PodiumColumn({
  entry,
  place,
  show,
  height,
  champion,
}: {
  entry?: FinalStanding;
  place: number;
  show: boolean;
  height: string;
  champion?: boolean;
}) {
  const reduced = useReducedMotion();
  // A place with nobody in it (two-player game) stays a low, empty plinth.
  const visible = show && !!entry;
  return (
    <div className="flex flex-col items-center justify-end" style={{ height: "62vh" }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            className="mb-[2vh] w-full text-center"
            initial={reduced ? false : { opacity: 0, y: "6vh", scale: champion ? 0.55 : 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: champion ? 160 : 240,
              damping: champion ? 13 : 20,
              delay: reduced ? 0 : 0.35,
            }}
          >
            {champion && (
              <motion.span
                className="block"
                initial={reduced ? false : { rotate: -25, y: "-4vh", opacity: 0 }}
                animate={{ rotate: 0, y: 0, opacity: 1 }}
                transition={{
                  delay: reduced ? 0 : 0.9,
                  type: "spring",
                  stiffness: 200,
                  damping: 12,
                }}
              >
                <Crown className="mx-auto mb-[1vh] h-[7vh] w-[7vh] text-accent" aria-hidden />
              </motion.span>
            )}
            <div
              className={cn(
                "break-words font-display font-extrabold leading-none tracking-[-0.03em]",
                champion ? "text-[clamp(2rem,4.6vw,10rem)]" : "text-[clamp(1.4rem,2.7vw,6rem)]",
              )}
            >
              {entry.nickname}
            </div>
            <div
              className={cn(
                "numeric mt-[1vh] font-bold",
                champion
                  ? "text-[clamp(1.4rem,2.7vw,6rem)] text-accent"
                  : "text-[clamp(1.1rem,1.9vw,4rem)] text-fg-2",
              )}
            >
              <AnimatedNumber value={entry.score} from={0} duration={champion ? 2 : 1.4} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        className={cn(
          "notch flex w-full justify-center pt-[2vh]",
          champion
            ? "bg-accent text-accent-ink"
            : place === 2
              ? "bg-fg text-inverse"
              : "bg-[color-mix(in_oklab,var(--answer-1)_75%,var(--surface-elevated))] text-ink1",
        )}
        initial={reduced ? false : { height: "4vh" }}
        animate={{ height: visible ? height : "4vh" }}
        transition={{ type: "spring", stiffness: 90, damping: 18 }}
      >
        {/* The place number appears with its plinth, never clipped on an empty one. */}
        <motion.span
          className="numeric text-[clamp(2rem,5vw,10rem)] font-extrabold leading-none"
          initial={false}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ delay: visible && !reduced ? 0.25 : 0, duration: 0.4 }}
        >
          {place}
        </motion.span>
      </motion.div>
    </div>
  );
}

/**
 * The full standings as a scoreboard table. Pages through larger rooms on its own, ten
 * rows at a time, so a 100-player game shows everyone without tiny type.
 */
function FullStandings({ results, quizTitle }: { results: FinalResults; quizTitle: string }) {
  const reduced = useReducedMotion();
  const pages = Math.max(1, Math.ceil(results.standings.length / PAGE_SIZE));
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (pages < 2) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(t);
  }, [pages]);

  const rows = results.standings.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const head = "label text-[clamp(0.7rem,0.95vw,2rem)] text-fg-3";

  return (
    <div className="mx-auto flex h-full max-w-[82vw] flex-col">
      <div className="mb-[2.5vh] flex items-end justify-between gap-[2vw]">
        <div>
          <p className="label text-[clamp(0.8rem,1.1vw,2.2rem)] text-fg-3">{quizTitle}</p>
          <h1 className="mt-[0.6vh] font-display text-[clamp(2rem,3.8vw,8rem)] font-extrabold uppercase leading-none tracking-[-0.04em]">
            Final leaderboard
          </h1>
        </div>
        <dl className="flex gap-[3vw] text-right">
          <Stat label="Players" value={formatNumber(results.participantCount)} />
          <Stat label="Questions" value={String(results.playedQuestions)} />
          <Stat label="Accuracy" value={formatPercent(results.averageAccuracy)} />
        </dl>
      </div>

      <div role="table" aria-label="Final leaderboard" className="flex min-h-0 flex-1 flex-col">
        <div
          role="row"
          className="grid grid-cols-[7vw_minmax(0,1fr)_12vw_9vw_10vw_8vw] items-center gap-[1vw] border-b border-line-strong px-[1.2vw] pb-[1vh]"
        >
          <span role="columnheader" className={head}>
            Rank
          </span>
          <span role="columnheader" className={head}>
            Player
          </span>
          <span role="columnheader" className={cn(head, "text-right")}>
            Points
          </span>
          <span role="columnheader" className={cn(head, "text-right")}>
            Correct
          </span>
          <span role="columnheader" className={cn(head, "text-right")}>
            Accuracy
          </span>
          <span role="columnheader" className={cn(head, "text-right")}>
            Streak
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            role="rowgroup"
            className="flex flex-col gap-[0.6vh] pt-[1vh]"
            initial={reduced ? false : { opacity: 0, x: "2vw" }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? undefined : { opacity: 0, x: "-2vw" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {rows.map((s, i) => (
              <motion.div
                role="row"
                key={s.participantId}
                initial={reduced ? false : { opacity: 0, y: "1.5vh" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : i * 0.05, duration: 0.4 }}
                className={cn(
                  "grid h-[5.6vh] grid-cols-[7vw_minmax(0,1fr)_12vw_9vw_10vw_8vw] items-center gap-[1vw] border px-[1.2vw]",
                  s.rank <= 3 ? "border-line-strong bg-elevated" : "border-line bg-surface",
                )}
              >
                <span
                  role="cell"
                  className={cn(
                    "numeric text-[clamp(1.1rem,1.9vw,4rem)] font-extrabold",
                    s.rank === 1 ? "text-accent" : s.rank <= 3 ? "text-fg" : "text-fg-3",
                  )}
                >
                  {s.rank}
                </span>
                <span
                  role="cell"
                  className="truncate font-display text-[clamp(1.1rem,1.8vw,3.8rem)] font-bold tracking-[-0.02em]"
                >
                  {s.nickname}
                </span>
                <span
                  role="cell"
                  className="numeric text-right text-[clamp(1.1rem,1.9vw,4rem)] font-extrabold"
                >
                  {formatNumber(s.score)}
                </span>
                <span
                  role="cell"
                  className="numeric text-right text-[clamp(1rem,1.5vw,3.2rem)] font-bold text-fg-2"
                >
                  {s.correctCount}/{results.playedQuestions}
                </span>
                <span
                  role="cell"
                  className="numeric text-right text-[clamp(1rem,1.5vw,3.2rem)] font-bold text-fg-2"
                >
                  {formatPercent(s.accuracy)}
                </span>
                <span
                  role="cell"
                  className="numeric flex items-center justify-end gap-[0.3vw] text-[clamp(1rem,1.5vw,3.2rem)] font-bold text-fg-2"
                >
                  {s.bestStreak >= 2 && (
                    <Flame className="h-[1em] w-[1em] text-warning" aria-hidden />
                  )}
                  {s.bestStreak}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      {pages > 1 && (
        <div className="mt-[2vh] flex items-center justify-center gap-[0.6vw]" aria-hidden>
          {Array.from({ length: pages }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-[0.7vh] w-[2.2vw] transition-colors",
                i === page ? "bg-accent" : "bg-line-strong",
              )}
            />
          ))}
          <span className="label ml-[1vw] text-[clamp(0.7rem,0.95vw,2rem)] text-fg-3">
            {page * PAGE_SIZE + 1}–{Math.min(results.standings.length, (page + 1) * PAGE_SIZE)} of{" "}
            {results.standings.length}
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label text-[clamp(0.7rem,0.85vw,1.8rem)] text-fg-3">{label}</dt>
      <dd className="numeric mt-[0.6vh] text-[clamp(1.25rem,2.2vw,4.5rem)] font-extrabold">
        {value}
      </dd>
    </div>
  );
}
