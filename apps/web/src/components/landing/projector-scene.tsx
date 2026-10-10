"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const ANSWERS = [
  { text: "Jupiter", right: true },
  { text: "Mars", right: false },
  { text: "Earth", right: false },
  { text: "Venus", right: false },
];
const LETTERS = ["A", "B", "C", "D"];

/** Final order; the first two trade places during the loop (see .lp-row-up/down). */
const BOARD = [
  { name: "Kai", pts: "3,940", move: "lp-row-up" },
  { name: "Mira", pts: "3,610", move: "lp-row-down" },
  { name: "Sam", pts: "2,880", move: "" },
];

/**
 * The hero's "big screen": a 12-second loop of one question, drawn in HTML/SVG so it takes
 * the current theme. Question in, countdown ring drains (turning amber, then red), answers
 * tick in, the right answer is revealed, then a glass leaderboard slides in and two players
 * swap places. All CSS keyframes on one shared clock (landing.css, "projector scene"); this
 * component only pauses the clock while the scene is off-screen or the tab is hidden.
 * Illustrative only: no game is running.
 */
export function ProjectorScene({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = false;
    const sync = () => el.toggleAttribute("data-paused", !visible || document.hidden);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="A sample game on the big screen: a question with a countdown ring, answers coming in, the right answer revealed, then the leaderboard updating."
      data-paused=""
      className={cn(
        "lp-scene relative aspect-[4/5] w-full overflow-hidden rounded-[var(--lp-radius)] border border-line bg-sunken text-fg",
        className,
      )}
    >
      {/* The projected arena: a faint floor grid lit from above. */}
      <div aria-hidden className="arena-floor absolute inset-0 opacity-70" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_-10%,var(--accent-soft),transparent_70%)]"
      />

      <div aria-hidden className="absolute inset-[6%] flex flex-col gap-[4cqw]">
        <div className="flex items-center justify-between text-[3.1cqw] text-fg-3">
          <span className="label">Question 4 of 10</span>
          <span className="numeric rounded-full border border-line px-[2.4cqw] py-[0.8cqw] font-semibold tracking-wide text-fg-2">
            QA 482 193
          </span>
        </div>

        <div className="lp-anim lp-scene-in flex flex-1 flex-col gap-[4cqw]">
          <p className="font-display text-[6.6cqw] font-bold leading-[1.08] tracking-[-0.03em]">
            Which planet has the shortest day?
          </p>

          <div className="flex items-center gap-[4cqw]">
            <div className="relative h-[22cqw] w-[22cqw] shrink-0">
              <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
                <circle cx="22" cy="22" r="19" fill="none" stroke="var(--line)" strokeWidth="3.5" />
                <circle
                  className="lp-anim lp-ring"
                  cx="22"
                  cy="22"
                  r="19"
                  fill="none"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray="100"
                />
              </svg>
              <span className="lp-anim lp-timer numeric absolute inset-0 grid place-items-center text-[7.5cqw] font-bold" />
            </div>
            <div className="flex flex-col gap-[1cqw]">
              <span className="numeric text-[6cqw] font-bold leading-none">
                <span className="lp-anim lp-count" />
                <span className="text-fg-3">/30</span>
              </span>
              <span className="text-[3.2cqw] text-fg-2">answers in</span>
            </div>
          </div>

          <ul className="mt-auto grid grid-cols-2 gap-[2.2cqw]">
            {ANSWERS.map((a, i) => (
              <li
                key={a.text}
                className={cn(
                  "lp-anim relative flex items-center gap-[2cqw] rounded-[2.4cqw] px-[3cqw] py-[3.4cqw] text-[4.2cqw] font-bold",
                  a.right ? "lp-right" : "lp-wrong",
                )}
                style={{
                  background: `var(--answer-${i + 1})`,
                  color: `var(--answer-ink-${i + 1})`,
                }}
              >
                <span className="numeric text-[3cqw] opacity-70">{LETTERS[i]}</span>
                {a.text}
                {a.right && (
                  <span className="lp-anim lp-tick ml-auto grid h-[5.6cqw] w-[5.6cqw] place-items-center rounded-full bg-[var(--answer-ink-1)] text-[var(--answer-1)]">
                    <Check className="h-[3.6cqw] w-[3.6cqw]" strokeWidth={3} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Glass leaderboard over the scene, as in the real game after a question. */}
      <div
        aria-hidden
        className="lp-anim lp-board lp-glass absolute inset-x-[6%] bottom-[6%] bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] p-[3.6cqw]"
      >
        <div className="mb-[2cqw] flex items-center justify-between text-[3cqw] text-fg-2">
          <span className="label">Leaderboard</span>
          <span>after Q4</span>
        </div>
        {/* Ranks stay put while the rows slide past them. */}
        <div className="relative overflow-hidden pl-[6cqw]">
          <ol className="absolute inset-y-0 left-0 flex flex-col">
            {BOARD.map((r, i) => (
              <li
                key={r.name}
                className="numeric flex h-[8.4cqw] items-center text-[3.8cqw] text-fg-3"
              >
                {i + 1}
              </li>
            ))}
          </ol>
          <ol>
            {BOARD.map((r, i) => (
              <li
                key={r.name}
                className={cn(
                  "flex h-[8.4cqw] items-center gap-[2.6cqw] text-[3.8cqw]",
                  r.move && `lp-anim ${r.move}`,
                )}
              >
                <span
                  className="h-[5cqw] w-[5cqw] rounded-full"
                  style={{ background: `var(--answer-${i + 2})` }}
                />
                <span className="font-semibold">{r.name}</span>
                {i === 0 && (
                  <span className="lp-anim lp-delta numeric rounded-full bg-[var(--success-soft)] px-[1.6cqw] text-[2.8cqw] font-semibold text-success">
                    ▲1 +940
                  </span>
                )}
                <span className="numeric ml-auto font-semibold">{r.pts}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
