"use client";

import { GAME_CODE_DIGITS, MAX_QUESTIONS_PER_QUIZ } from "@quizarena/shared/constants";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CodePill } from "./code-pill";

/** Runs `fn` (keep it stable) once, the first time `ref` is at least `threshold` on screen. */
function useFirstView(ref: React.RefObject<Element | null>, fn: () => void, threshold = 0.4) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          io.disconnect();
          fn();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, fn, threshold]);
}

/* ------------------------------------------------------------------------------------------
   7b. Big numbers on solid accent blocks. True product facts only.
   ------------------------------------------------------------------------------------------ */

const STATS = [
  { n: GAME_CODE_DIGITS, unit: "digits", label: "is all a player types to join" },
  { n: 0, unit: "apps", label: "to install, on any phone" },
  { n: MAX_QUESTIONS_PER_QUIZ, unit: "questions", label: "fit in a single quiz", wide: true },
];

/** Counts up from zero once, the first time it scrolls into view (skipped for reduced motion). */
function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [value, setValue] = useState(to);
  const armed = useRef(false);

  // Only numbers that start below the fold count up; one already in view just shows its value.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || to === 0) return;
    if (el.getBoundingClientRect().top > window.innerHeight) {
      armed.current = true;
      setValue(0);
    }
  }, [reduced, to]);

  const run = useCallback(() => {
    if (!armed.current) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 600);
      setValue(Math.round(to * (1 - Math.pow(1 - t, 4))));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to]);
  useFirstView(ref, run);

  return <span ref={ref}>{value}</span>;
}

export function Stats() {
  return (
    <section aria-label="QuizArena in numbers" className="lp-frame pb-20 md:pb-28">
      <ul className="grid grid-cols-2 gap-4">
        {STATS.map((s) => (
          <li
            key={s.unit}
            className={cn(
              "flex min-h-44 flex-col justify-between gap-8 rounded-[var(--lp-radius)] bg-accent p-6 md:min-h-[21.5rem] md:p-8",
              s.wide && "col-span-2",
            )}
          >
            <p className="lp-stat text-[var(--lp-stat-num)]">
              <CountUp to={s.n} />
              <span className="block">{s.unit}</span>
            </p>
            <p className="text-[16px] text-[var(--lp-stat-label)] md:text-[24px]">{s.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------
   8. Final call: the third PIN entry, and the podium with a one-time burst.
   ------------------------------------------------------------------------------------------ */

const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const r = 90 + (i % 3) * 30;
  return {
    dx: `${Math.round(Math.cos(a) * r)}px`,
    dy: `${Math.round(Math.sin(a) * r - 40)}px`,
    rot: `${(i * 47) % 360}deg`,
    delay: `${(i % 4) * 0.05}s`,
    color: `var(--answer-${(i % 4) + 1})`,
  };
});

const BLOCKS = [
  { place: 2, h: "46%", name: "Kai" },
  { place: 1, h: "64%", name: "Ivy" },
  { place: 3, h: "34%", name: "Sam" },
];

export function FinalCta() {
  const podium = useRef<HTMLDivElement>(null);
  const [burst, setBurst] = useState(false);
  const fire = useCallback(() => setBurst(true), []);
  useFirstView(podium, fire);

  return (
    <section id="finale" aria-labelledby="finale-title" className="lp-frame pb-24 md:pb-32">
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col justify-between gap-10 rounded-[var(--lp-radius)] bg-[linear-gradient(to_bottom,var(--surface-elevated),var(--surface))] p-6 md:p-10">
          <ul className="flex flex-wrap gap-2 text-[12px] text-fg-2">
            {["No app", "Any browser", "Free to join"].map((t) => (
              <li key={t} className="rounded-full border border-line px-2.5 leading-6">
                {t}
              </li>
            ))}
          </ul>
          <div>
            <h2 id="finale-title" className="lp-h2 max-w-[14ch]">
              Your next game starts with a PIN.
            </h2>
            <p className="lp-body mt-4 max-w-[28rem]">
              Six digits on the big screen, a nickname on your phone, and you&apos;re in. Hosting
              tonight? Build the quiz first.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <CodePill />
            <Link href="/admin" className="lp-btn lp-btn-accent self-start">
              Host a quiz
            </Link>
          </div>
        </div>

        <div
          ref={podium}
          data-burst={burst ? "" : undefined}
          aria-hidden
          className="arena-floor relative min-h-[26rem] overflow-hidden rounded-[var(--lp-radius)] border border-line bg-sunken"
        >
          <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_30%,var(--accent-soft),transparent_70%)]" />
          {/* A podium in simple 3D: accent front faces under lit top faces. */}
          <div className="absolute inset-x-[10%] bottom-0 flex h-[70%] items-end gap-[3%]">
            {BLOCKS.map((b) => (
              <div key={b.place} className="flex flex-1 flex-col" style={{ height: b.h }}>
                <span className="mb-2 text-center text-[13px] font-semibold text-fg-2">
                  {b.name}
                </span>
                <span className="h-4 origin-bottom rounded-t-md bg-[color-mix(in_oklab,var(--accent)_45%,var(--arena-3d-light))] [transform:perspective(300px)_rotateX(45deg)]" />
                <span className="numeric flex flex-1 justify-center bg-[linear-gradient(to_bottom,var(--accent),color-mix(in_oklab,var(--accent)_70%,black))] pt-4 text-[44px] font-bold text-accent-ink">
                  {b.place}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute left-1/2 top-[30%]">
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="lp-spark absolute h-2.5 w-1.5 rounded-[2px]"
                style={
                  {
                    background: s.color,
                    "--dx": s.dx,
                    "--dy": s.dy,
                    "--rot": s.rot,
                    "--lp-spark-delay": s.delay,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="lp-glass absolute left-[6%] top-[6%] px-4 py-3">
            <p className="text-[12px] text-fg-2">1st place</p>
            <p className="text-[16px] font-semibold">
              Ivy · <span className="numeric">4,820</span> pts
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
