"use client";

import type { LeaderboardEntry } from "@quizarena/shared/game";
import { ArrowDown, ArrowUp, Flame } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useArena } from "@/components/arena/arena-theme";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/cn";

const TOP_STYLES = [
  "bg-accent text-accent-ink",
  "bg-fg text-inverse",
  "bg-[color-mix(in_oklab,var(--answer-1)_75%,var(--surface-elevated))] text-ink1",
];

/** Animated standings: overtakes are visible, top three get podium treatment. */
export function Leaderboard({
  entries,
  size = "stage",
  highlightId,
  title = "Leaderboard",
}: {
  entries: LeaderboardEntry[];
  size?: "stage" | "phone" | "panel";
  highlightId?: string;
  title?: string;
}) {
  const { appearance } = useArena();
  // Organisers can switch overtaking animation off; reduced-motion users never get it.
  const reduced = useReducedMotion() || !appearance.leaderboardAnimation;
  // Rows render in their previous order until this list has "settled" (650ms later), then
  // re-sort — layout animation physically moves players past each other.
  const [settled, setSettled] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setSettled(entries), 650);
    return () => clearTimeout(t);
  }, [entries, reduced]);
  const order = useMemo(
    () =>
      reduced || settled === entries
        ? entries
        : [...entries].sort(
            (a, b) => (a.previousRank ?? 999) - (b.previousRank ?? 999) || a.rank - b.rank,
          ),
    [entries, settled, reduced],
  );

  const stage = size === "stage";

  return (
    <section aria-label={title} className="w-full">
      <LayoutGroup>
        <ol className={cn("flex flex-col", stage ? "gap-[0.7vh]" : "gap-1.5")}>
          <AnimatePresence initial={false}>
            {order.map((e, i) => {
              const top = e.rank <= 3;
              const moved = e.previousRank !== null && e.previousRank !== e.rank;
              const up = moved && e.previousRank! > e.rank;
              return (
                <motion.li
                  key={e.participantId}
                  layout={reduced ? false : "position"}
                  initial={reduced ? false : { opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    layout: { type: "spring", stiffness: 260, damping: 30 },
                    delay: reduced ? 0 : i * 0.035,
                  }}
                  className={cn(
                    "relative flex items-center overflow-hidden border",
                    stage
                      ? top
                        ? "h-[7vh] gap-[1.4vw] px-[1.4vw]"
                        : "h-[5.3vh] gap-[1.4vw] px-[1.4vw]"
                      : size === "phone"
                        ? "h-12 gap-3 px-3"
                        : "h-11 gap-3 px-3",
                    e.participantId === highlightId
                      ? "border-accent bg-accent-soft"
                      : top
                        ? "border-line-strong bg-elevated"
                        : "border-line bg-surface",
                  )}
                  aria-label={`${e.rank}. ${e.nickname}, ${e.score} points`}
                >
                  <span
                    className={cn(
                      "numeric grid shrink-0 place-items-center font-extrabold leading-none",
                      stage
                        ? "h-[70%] aspect-square text-[clamp(1.25rem,2.2vw,4.5rem)]"
                        : "h-8 w-8 text-body",
                      top ? cn(TOP_STYLES[e.rank - 1], "notch-sm") : "text-fg-3",
                    )}
                  >
                    {e.rank}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-display font-bold tracking-[-0.02em]",
                      stage
                        ? top
                          ? "text-[clamp(1.25rem,2.3vw,4.75rem)]"
                          : "text-[clamp(1.1rem,1.8vw,3.75rem)]"
                        : "text-body-lg",
                    )}
                  >
                    {e.nickname}
                  </span>
                  {e.streak >= 2 && (
                    <span
                      className={cn(
                        "flex items-center gap-1 font-bold text-warning",
                        stage ? "text-[clamp(0.9rem,1.2vw,2.5rem)]" : "text-caption",
                      )}
                      title={`${e.streak} in a row`}
                    >
                      <Flame
                        className={stage ? "h-[1.2em] w-[1.2em]" : "h-3.5 w-3.5"}
                        aria-hidden
                      />{" "}
                      {e.streak}
                    </span>
                  )}
                  {e.lastPoints > 0 && (
                    <motion.span
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.03 }}
                      className={cn(
                        "numeric font-bold text-success",
                        stage ? "text-[clamp(0.9rem,1.3vw,2.75rem)]" : "text-caption",
                      )}
                    >
                      +{e.lastPoints}
                    </motion.span>
                  )}
                  {moved && (
                    <span
                      className={cn("flex items-center", up ? "text-success" : "text-danger")}
                      aria-label={up ? "moved up" : "moved down"}
                    >
                      {up ? (
                        <ArrowUp className={stage ? "h-[2.2vh] w-[2.2vh]" : "h-3.5 w-3.5"} />
                      ) : (
                        <ArrowDown className={stage ? "h-[2.2vh] w-[2.2vh]" : "h-3.5 w-3.5"} />
                      )}
                    </span>
                  )}
                  <AnimatedNumber
                    value={e.score}
                    from={e.score - e.lastPoints}
                    duration={1.2}
                    className={cn(
                      "numeric shrink-0 text-right font-extrabold",
                      stage
                        ? "min-w-[8vw] text-[clamp(1.25rem,2.3vw,4.75rem)]"
                        : "min-w-16 text-body-lg",
                    )}
                  />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </LayoutGroup>
    </section>
  );
}
