"use client";

import { ArrowLeft, ArrowRight, Play, Trophy } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** cubic-bezier(x1, y1, x2, y2) as a function of time, for JS-driven glides. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, s: number) =>
    3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  const slope = (a: number, b: number, s: number) =>
    3 * (1 - s) * (1 - s) * a + 6 * (1 - s) * s * (b - a) + 3 * s * s * (1 - b);
  return (t: number) => {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = at(x1, x2, s) - t;
      if (Math.abs(err) < 1e-4) break;
      s -= err / (slope(x1, x2, s) || 1);
    }
    return at(y1, y2, Math.min(1, Math.max(0, s)));
  };
}
/** The landing page's slide curve (--lp-glide): a long, soft landing. */
const glideEase = bezier(0.22, 1, 0.36, 1);
const GLIDE_MS = 650;

/* ------------------------------------------------------------------------------------------
   5. Question types: a native scroller (swipe/trackpad as usual); the arrows glide it one
   card at a time over 650ms. The rail bleeds past the frame so the next card is cut off.
   ------------------------------------------------------------------------------------------ */

function Slide({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <li className="w-[300px] md:w-[360px]">
      <div
        aria-hidden
        className="relative aspect-[9/10] overflow-hidden rounded-[var(--lp-radius)] border border-line bg-surface"
      >
        {children}
      </div>
      <h3 className="mt-5 text-[20px] font-medium">{title}</h3>
      <p className="lp-body mt-1.5 text-[15px]!">{body}</p>
    </li>
  );
}

const SHAPES = ["▲", "◆", "●", "■"];

export function QuestionTypes() {
  const rail = useRef<HTMLUListElement>(null);
  const frame = useRef(0);
  const reduced = useReducedMotion();
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2,
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  const go = (dir: 1 | -1) => {
    const el = rail.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const step = first.offsetWidth + 16;
    const max = el.scrollWidth - el.clientWidth;
    const to = Math.min(max, Math.max(0, (Math.round(el.scrollLeft / step) + dir) * step));
    cancelAnimationFrame(frame.current);
    if (reduced) {
      el.scrollLeft = to;
      return;
    }
    const from = el.scrollLeft;
    const t0 = performance.now();
    // Snapping would fight the glide; it comes back once the card has landed.
    el.style.scrollSnapType = "none";
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / GLIDE_MS);
      el.scrollLeft = from + (to - from) * glideEase(t);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else el.style.scrollSnapType = "";
    };
    frame.current = requestAnimationFrame(tick);
  };

  const arrows = (
    <div className="flex gap-3">
      <button
        type="button"
        className="lp-round"
        onClick={() => go(-1)}
        disabled={edges.start}
        aria-label="Previous question type"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        className="lp-round"
        onClick={() => go(1)}
        disabled={edges.end}
        aria-label="Next question type"
      >
        <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );

  return (
    <section id="types" aria-labelledby="types-title" className="overflow-x-clip py-20 md:py-28">
      <div className="lp-frame flex items-end justify-between gap-6">
        <h2 id="types-title" className="lp-h2 max-w-[18ch]">
          What can you put on the big screen?
        </h2>
        <div className="hidden md:block">{arrows}</div>
      </div>
      <ul
        ref={rail}
        onScroll={measure}
        // Focusable so keyboard users can scroll it with the arrow keys.
        tabIndex={0}
        className="lp-rail mt-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
        aria-label="Question types"
      >
        <Slide
          title="Multiple choice"
          body="Two to four answers, each with its own colour and shape, so players can match the screen at a glance."
        >
          <div className="grid h-full grid-cols-2 gap-3 p-6">
            {["Jupiter", "Mars", "Earth", "Venus"].map((a, i) => (
              <span
                key={a}
                className="flex flex-col justify-between rounded-2xl p-4 text-[18px] font-bold"
                style={{
                  background: `var(--answer-${i + 1})`,
                  color: `var(--answer-ink-${i + 1})`,
                }}
              >
                <span className="text-[20px] opacity-70">{SHAPES[i]}</span>
                {a}
              </span>
            ))}
          </div>
        </Slide>
        <Slide
          title="True or false"
          body="One tap, two giant halves. The fastest round in the game, and the loudest."
        >
          <div className="grid h-full grid-cols-2">
            <span
              className="flex items-end p-6 text-[34px] font-bold"
              style={{ background: "var(--answer-2)", color: "var(--answer-ink-2)" }}
            >
              True
            </span>
            <span
              className="flex items-end p-6 text-[34px] font-bold"
              style={{ background: "var(--answer-1)", color: "var(--answer-ink-1)" }}
            >
              False
            </span>
          </div>
        </Slide>
        <Slide
          title="Image questions"
          body="Add a picture to any question: a flag, a map, a painting, a blurry close-up to guess from."
        >
          <div className="absolute inset-6 overflow-hidden rounded-2xl bg-sunken">
            <svg
              viewBox="0 0 300 300"
              className="h-full w-full"
              preserveAspectRatio="xMidYMid slice"
            >
              <rect width="300" height="300" fill="var(--answer-2)" opacity=".25" />
              <circle cx="220" cy="80" r="30" fill="var(--answer-3)" />
              <path
                d="M0 230 90 120l60 70 40-40 110 100v50H0z"
                fill="var(--answer-4)"
                opacity=".7"
              />
              <path d="M0 260 70 200l70 50 60-30 100 50v30H0z" fill="var(--accent)" opacity=".8" />
            </svg>
            <span className="absolute left-[34%] top-[24%] h-24 w-24 rounded-full border-4 border-white shadow-[0_0_0_2px_rgb(0_0_0/0.25)]">
              <span className="absolute -bottom-6 -right-4 h-8 w-2 rotate-[-45deg] rounded-full bg-white" />
            </span>
          </div>
        </Slide>
        <Slide
          title="Video questions"
          body="Play a short clip on the big screen, then ask about it. The host can replay it or turn the sound on."
        >
          <div className="absolute inset-6 flex flex-col justify-between rounded-2xl bg-[#0b0b0e] p-4 text-white">
            <span className="self-end rounded-full bg-white/15 px-2 text-[12px] leading-5">
              Clip · 0:30
            </span>
            <span className="grid h-16 w-16 place-items-center self-center rounded-full bg-white text-[#0b0b0e]">
              <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />
            </span>
            <span className="flex items-center gap-3 text-[12px]">
              <span className="numeric">0:12</span>
              <span className="relative h-1 flex-1 rounded-full bg-white/25">
                <span className="absolute inset-y-0 left-0 w-[40%] rounded-full bg-[var(--accent)]" />
              </span>
            </span>
          </div>
        </Slide>
        <Slide
          title="Live leaderboard"
          body="After each question, or every few, the board shows who climbed and who slipped."
        >
          <ol className="flex h-full flex-col justify-center gap-2 p-6">
            {[
              { n: "Ivy", d: "▲1", up: true, p: "3,480" },
              { n: "Kai", d: "▼1", up: false, p: "3,400" },
              { n: "Mira", d: "—", up: null, p: "3,290" },
              { n: "Sam", d: "—", up: null, p: "2,610" },
            ].map((r, i) => (
              <li
                key={r.n}
                className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-3 py-2.5 text-[15px]"
              >
                <span className="numeric w-4 text-fg-3">{i + 1}</span>
                <span className="font-semibold">{r.n}</span>
                <span
                  className={cn(
                    "numeric text-[12px] font-semibold",
                    r.up ? "text-success" : r.up === false ? "text-danger" : "text-fg-3",
                  )}
                >
                  {r.d}
                </span>
                <span className="numeric ml-auto font-semibold">{r.p}</span>
              </li>
            ))}
          </ol>
        </Slide>
        <Slide
          title="Podium ceremony"
          body="The finale: third, second, then first rise onto a 3D podium, one reveal at a time."
        >
          <div className="flex h-full items-end justify-center gap-2 px-6 pb-6">
            {[
              { place: 2, h: "55%" },
              { place: 1, h: "75%" },
              { place: 3, h: "40%" },
            ].map((b) => (
              <span key={b.place} className="flex w-1/3 flex-col" style={{ height: b.h }}>
                <span className="h-3 rounded-t-lg bg-[color-mix(in_oklab,var(--accent)_55%,white)]" />
                <span className="numeric flex flex-1 justify-center bg-accent pt-3 text-[34px] font-bold text-accent-ink">
                  {b.place}
                </span>
              </span>
            ))}
          </div>
        </Slide>
      </ul>
      <div className="mt-8 flex justify-center md:hidden">{arrows}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------
   7c. A sample game, replayed: one card per round, auto-advancing so the board tells a
   small story ending on the winner. Pauses on hover, focus, off-screen, hidden tab and
   reduced motion. Example data, labelled as such.
   ------------------------------------------------------------------------------------------ */

type Row = { name: string; pts: string; move: number };
const ROUNDS: { q: string; rows: Row[] }[] = [
  {
    q: "Which planet has the shortest day?",
    rows: [
      { name: "Mira", pts: "1,000", move: 0 },
      { name: "Kai", pts: "860", move: 0 },
      { name: "Sam", pts: "820", move: 0 },
      { name: "Ivy", pts: "640", move: 0 },
    ],
  },
  {
    q: "What is 1010 in binary, in decimal?",
    rows: [
      { name: "Kai", pts: "1,840", move: 1 },
      { name: "Mira", pts: "1,700", move: -1 },
      { name: "Ivy", pts: "1,560", move: 1 },
      { name: "Sam", pts: "820", move: -1 },
    ],
  },
  {
    q: "Which river runs through Cairo?",
    rows: [
      { name: "Kai", pts: "2,780", move: 0 },
      { name: "Ivy", pts: "2,520", move: 1 },
      { name: "Mira", pts: "2,330", move: -1 },
      { name: "Sam", pts: "1,700", move: 0 },
    ],
  },
  {
    q: "Who painted The Starry Night?",
    rows: [
      { name: "Ivy", pts: "3,480", move: 1 },
      { name: "Kai", pts: "3,400", move: -1 },
      { name: "Mira", pts: "3,290", move: 0 },
      { name: "Sam", pts: "2,610", move: 0 },
    ],
  },
  {
    q: "How many sides does a hexagon have?",
    rows: [
      { name: "Ivy", pts: "4,820", move: 0 },
      { name: "Kai", pts: "4,350", move: 0 },
      { name: "Sam", pts: "3,590", move: 1 },
      { name: "Mira", pts: "3,290", move: -1 },
    ],
  },
];
const COLORS: Record<string, number> = { Mira: 2, Kai: 1, Sam: 3, Ivy: 4 };
const ADVANCE_MS = 4500;

export function Replay() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || hold || !visible) return;
    const t = window.setTimeout(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % ROUNDS.length);
    }, ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [index, reduced, hold, visible]);

  return (
    <section
      id="replay"
      ref={root}
      aria-labelledby="replay-title"
      aria-roledescription="carousel"
      className="overflow-x-clip py-20 md:py-28"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHold(false);
      }}
    >
      <div className="lp-frame text-center">
        <p className="text-[13px] text-fg-3">A sample game · example data</p>
        <h2 id="replay-title" className="lp-h2 mx-auto mt-2 max-w-[20ch]">
          Five questions. Four players. One winner.
        </h2>
      </div>

      <div
        className="mt-12 [--w:min(680px,calc(100vw-48px))]"
        style={{ "--i": index } as React.CSSProperties}
      >
        <ol
          className="flex gap-6 px-[calc(50%-var(--w)/2)] transition-transform duration-[650ms] ease-[var(--lp-glide)] motion-reduce:transition-none"
          style={{ transform: "translateX(calc(-1 * var(--i) * (var(--w) + 24px)))" }}
        >
          {ROUNDS.map((r, i) => {
            const last = i === ROUNDS.length - 1;
            return (
              <li
                key={r.q}
                aria-roledescription="slide"
                aria-label={`Round ${i + 1} of ${ROUNDS.length}`}
                aria-hidden={i !== index}
                onClick={() => setIndex(i)}
                className={cn(
                  "lp-replay-card w-[var(--w)] shrink-0 rounded-[var(--lp-radius)] border border-line bg-surface p-6 md:p-8",
                  i === index ? "opacity-100" : "cursor-pointer opacity-40",
                )}
              >
                <div className="flex items-center justify-between gap-4 text-[13px] text-fg-3">
                  <span>
                    {last ? "Final standings" : `After round ${i + 1} of ${ROUNDS.length}`}
                  </span>
                  {last && (
                    <span className="flex items-center gap-1.5 font-medium text-accent">
                      <Trophy className="h-4 w-4" aria-hidden /> Ivy wins
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[18px] leading-snug">“{r.q}”</p>
                <ol className="mt-6 flex flex-col gap-2">
                  {r.rows.map((row, rank) => (
                    <li
                      key={row.name}
                      className="flex items-center gap-3 rounded-xl bg-elevated px-3 py-2.5 text-[15px]"
                    >
                      <span className="numeric w-4 text-fg-3">{rank + 1}</span>
                      <span
                        className="h-6 w-6 rounded-full"
                        style={{ background: `var(--answer-${COLORS[row.name]})` }}
                      />
                      <span className="font-semibold">{row.name}</span>
                      {row.move !== 0 && (
                        <span
                          className={cn(
                            "numeric text-[12px] font-semibold",
                            row.move > 0 ? "text-success" : "text-danger",
                          )}
                        >
                          {row.move > 0 ? "▲" : "▼"}
                          {Math.abs(row.move)}
                        </span>
                      )}
                      <span className="numeric ml-auto font-semibold">{row.pts}</span>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-8 flex justify-center gap-2" role="group" aria-label="Choose a round">
        {ROUNDS.map((r, i) => (
          <button
            key={r.q}
            type="button"
            aria-label={`Round ${i + 1}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={cn(
              "h-3 rounded-full transition-[width,background-color] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              i === index ? "w-9 bg-accent" : "w-3 bg-line-strong hover:bg-fg-3",
            )}
          />
        ))}
      </div>
    </section>
  );
}
