"use client";

import type { FinalResults, FinalStanding } from "@quizarena/shared/game";
import { Crown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/cn";
import { formatPercent, formatSeconds } from "@/lib/format";
import { play } from "@/lib/sound";
import { Confetti } from "./confetti";
import { Leaderboard } from "./leaderboard";

/** 0 title · 1 third · 2 second · 3 drumroll · 4 champion · 5 full standings */
type Stage = 0 | 1 | 2 | 3 | 4 | 5;
const TIMELINE: [Stage, number][] = [
  [1, 1400],
  [2, 2700],
  [3, 4000],
  [4, 5600],
  [5, 10500],
];

/**
 * Game-show finale for the projector. A timed reveal from third place up to the champion,
 * then the full standings. Any key or click skips ahead; reduced motion shows the end state.
 */
export function WinnerScreen({
  results,
  quizTitle,
  sound,
}: {
  results: FinalResults;
  quizTitle: string;
  sound: boolean;
}) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>(reduced ? 5 : 0);
  const [first, second, third] = results.standings;

  useEffect(() => {
    if (reduced) return;
    const timers = TIMELINE.map(([s, at]) =>
      setTimeout(() => setStage((cur) => (cur < s ? s : cur)), at),
    );
    const skip = () => setStage(5);
    window.addEventListener("keydown", skip);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
    };
  }, [reduced]);

  useEffect(() => {
    if (!sound) return;
    if (stage === 1 || stage === 2) play("reveal");
    if (stage === 4) play("winner");
  }, [stage, sound]);

  if (!first) {
    return (
      <div className="grid h-full place-items-center text-center">
        <div>
          <p className="label text-fg-3">Game over</p>
          <h1 className="mt-4 font-display text-display">No players this time</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col" onClick={() => setStage(5)}>
      <Confetti fire={stage >= 4 ? "winner" : null} intensity={1.4} origin={{ x: 0.5, y: 0.4 }} />

      <AnimatePresence mode="wait">
        {stage < 5 ? (
          <motion.div
            key="podium"
            className="flex h-full flex-col"
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <p className="label text-[clamp(0.8rem,1.2vw,2.4rem)] text-fg-3">{quizTitle}</p>
              <h1 className="mt-[1vh] font-display text-[clamp(2rem,4vw,8rem)] font-extrabold uppercase leading-none tracking-[-0.04em]">
                {stage === 3 ? "And the champion is…" : "Final results"}
              </h1>
            </motion.div>

            <div className="mt-auto grid grid-cols-3 items-end gap-[2vw] px-[6vw]">
              <PodiumColumn entry={second} place={2} show={stage >= 2} height="38vh" />
              <PodiumColumn entry={first} place={1} show={stage >= 4} height="52vh" champion />
              <PodiumColumn entry={third} place={3} show={stage >= 1} height="28vh" />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="final"
            className="grid h-full grid-cols-[1.1fr_1fr] gap-[4vw]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col justify-center">
              <p className="label flex items-center gap-[0.6vw] text-[clamp(0.8rem,1.2vw,2.4rem)] text-accent">
                <Crown className="h-[1.2em] w-[1.2em]" /> Champion
              </p>
              <h1
                className="mt-[2vh] break-words font-display font-extrabold leading-[0.9] tracking-[-0.045em]"
                // Long names step down so a 20-character nickname stays on one or two lines
                // instead of breaking mid-word at champion size.
                style={{
                  fontSize:
                    first.nickname.length <= 9
                      ? "clamp(3rem,7vw,14rem)"
                      : first.nickname.length <= 14
                        ? "clamp(2.5rem,5.2vw,10.5rem)"
                        : "clamp(2rem,3.9vw,8rem)",
                }}
              >
                {first.nickname}
              </h1>
              <p className="numeric mt-[2vh] text-[clamp(2rem,4vw,8rem)] font-extrabold text-accent">
                <AnimatedNumber value={first.score} />{" "}
                <span className="text-[0.4em] text-fg-3">pts</span>
              </p>
              <dl className="mt-[5vh] grid grid-cols-4 gap-[1.5vw] border-t border-line pt-[3vh]">
                <Stat label="Players" value={String(results.participantCount)} />
                <Stat label="Questions" value={String(results.playedQuestions)} />
                <Stat label="Accuracy" value={formatPercent(results.averageAccuracy)} />
                <Stat label="Avg answer" value={formatSeconds(results.averageResponseMs)} />
              </dl>
            </div>
            <div className="flex min-h-0 flex-col justify-center">
              <p className="label mb-[2vh] text-[clamp(0.75rem,1vw,2rem)] text-fg-3">
                Final standings
              </p>
              <Leaderboard
                entries={results.standings
                  .slice(0, 8)
                  .map((s) => ({ ...s, previousRank: null, lastPoints: 0 }))}
              />
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
  return (
    <div className="flex flex-col items-center justify-end" style={{ height: "62vh" }}>
      <AnimatePresence>
        {show && entry && (
          <motion.div
            className="mb-[2vh] text-center"
            initial={{ opacity: 0, y: 40, scale: champion ? 0.6 : 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: champion ? 220 : 300,
              damping: champion ? 14 : 22,
            }}
          >
            {champion && (
              <Crown className="mx-auto mb-[1vh] h-[6vh] w-[6vh] text-accent" aria-hidden />
            )}
            <div
              className={cn(
                "break-words font-display font-extrabold leading-none tracking-[-0.03em]",
                champion ? "text-[clamp(2rem,4.4vw,9rem)]" : "text-[clamp(1.4rem,2.6vw,5.5rem)]",
              )}
            >
              {entry.nickname}
            </div>
            <div
              className={cn(
                "numeric mt-[1vh] font-bold",
                champion
                  ? "text-[clamp(1.4rem,2.6vw,5.5rem)] text-accent"
                  : "text-[clamp(1.1rem,1.8vw,3.5rem)] text-fg-2",
              )}
            >
              <AnimatedNumber value={entry.score} from={0} duration={1.4} />
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
        initial={{ height: 0 }}
        animate={{ height: show ? height : "4vh" }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      >
        <span className="numeric text-[clamp(2rem,5vw,10rem)] font-extrabold leading-none">
          {place}
        </span>
      </motion.div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label text-[clamp(0.75rem,0.85vw,1.6rem)] text-fg-3">{label}</dt>
      <dd className="numeric mt-[1vh] text-[clamp(1.25rem,2.2vw,4.5rem)] font-extrabold">
        {value}
      </dd>
    </div>
  );
}
