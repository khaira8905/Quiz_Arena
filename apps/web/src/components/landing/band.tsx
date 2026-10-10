"use client";

import { useState } from "react";
import { CodePill } from "./code-pill";

/* Flat outline illustrations, original to QuizArena, drawn in the band's emphasis colour. */
function PaperChaos() {
  return (
    <svg
      viewBox="0 0 200 150"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
      className="h-full w-full"
    >
      <g transform="rotate(-14 90 80)">
        <rect x="40" y="38" width="86" height="64" rx="6" />
        <path d="M52 56h52M52 68h40M52 80h46" opacity=".55" />
      </g>
      <g transform="rotate(8 110 80)">
        <rect x="64" y="34" width="86" height="64" rx="6" fill="var(--lp-band-card)" />
        <path d="M76 52h50M76 64h36M76 76h44" opacity=".55" />
      </g>
      <g transform="rotate(-3 100 90)">
        <rect x="50" y="56" width="90" height="66" rx="6" fill="var(--lp-band-card)" />
        <path d="M62 74h56M62 86h30M62 98h48" opacity=".55" />
        <path d="M120 96l8 8m0-8-8 8" />
      </g>
      <circle cx="152" cy="40" r="15" fill="var(--danger)" stroke="none" />
      <path
        d="M147.5 35.5a4.5 4.5 0 1 1 6.2 4.2c-1.2.5-1.7 1.3-1.7 2.6v1"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="152" cy="48" r="1.3" fill="#fff" stroke="none" />
    </svg>
  );
}

function NobodyCanSee() {
  return (
    <svg
      viewBox="0 0 200 150"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
      className="h-full w-full"
    >
      <rect x="34" y="16" width="132" height="78" rx="5" />
      <path d="M100 94v12M84 112h32" />
      <path
        d="M48 32h70M48 40h88M48 48h60M48 56h80M48 64h52M48 72h74"
        strokeWidth="1"
        opacity=".5"
      />
      <circle cx="58" cy="122" r="9" />
      <path d="M53 121h4M60 121h4" strokeLinecap="round" />
      <path d="M58 131v16M44 140c4-4 9-6 14-6s10 2 14 6" />
      <path d="M70 112c6-6 10-14 10-22" strokeDasharray="2 4" opacity=".7" />
    </svg>
  );
}

function SlowScoring() {
  return (
    <svg
      viewBox="0 0 200 150"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
      className="h-full w-full"
    >
      <circle cx="70" cy="82" r="40" />
      <path d="M70 42v-10M62 30h16M100 52l7-7" />
      <path d="M70 82V58M70 82l16 10" strokeLinecap="round" />
      <text
        x="70"
        y="140"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="13"
        fontFamily="var(--font-mono)"
      >
        +02:47
      </text>
      <rect x="122" y="40" width="54" height="76" rx="6" />
      <rect x="138" y="34" width="22" height="10" rx="3" fill="var(--lp-band-card)" />
      <path d="M132 60v14M137 60v14M142 60v14M147 60v14M129 72l22-10" />
      <path d="M132 88v14M137 88v14M142 88v14" />
    </svg>
  );
}

const PROBLEMS = [
  {
    title: "Paper chaos",
    Art: PaperChaos,
    lead: "Answers lock in on phones.",
    body: "Every player taps a choice before the clock runs out, so there is nothing to collect, read out or argue over.",
  },
  {
    title: "Nobody can see",
    Art: NobodyCanSee,
    lead: "Built for the projector.",
    body: "Question, timer and answers scale to fill a 1080p or 4K screen, so the back row reads as easily as the front.",
  },
  {
    title: "Slow scoring",
    Art: SlowScoring,
    lead: "Scores are instant.",
    body: "Points for being right and for being quick are worked out the moment time is up, then the leaderboard moves.",
  },
];

function ProblemCard({ p }: { p: (typeof PROBLEMS)[number] }) {
  const [open, setOpen] = useState(false);
  const id = `problem-${p.title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <li
      data-open={open ? "" : undefined}
      className="lp-reveal flex h-[26rem] w-[85%] shrink-0 snap-start flex-col rounded-[var(--lp-radius)] border border-[var(--lp-band-line)] bg-[var(--lp-band-card)] p-6 md:h-[27.5rem] md:w-auto"
    >
      <div className="flex-1 p-2 text-[var(--lp-band-emph)]">
        <p.Art />
      </div>
      <span aria-hidden className="lp-reveal-veil" />
      <div className="relative z-10">
        <div className="flex items-end justify-between gap-4">
          <h3 className="lp-h3">{p.title}</h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            aria-label={`How QuizArena fixes ${p.title.toLowerCase()}`}
            onClick={() => setOpen((o) => !o)}
            className="lp-reveal-toggle grid h-10 w-10 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M3 8h10" />
              <path className="lp-plus-v" d="M8 3v10" />
            </svg>
          </button>
        </div>
        <div id={id} className="lp-reveal-more">
          <div>
            <p className="pt-3 text-[15px] leading-relaxed text-[var(--lp-band-muted)]">
              <strong className="font-semibold text-[var(--lp-band-text)]">{p.lead}</strong>{" "}
              {p.body}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * The one hard colour beat on the page: a warm black (night) or deep navy (day) band naming
 * what goes wrong at a quiz night, with three cards that reveal the fix on hover, keyboard
 * focus or tap. Then the second copy of the PIN entry.
 */
export function Band() {
  return (
    <section id="problems" aria-labelledby="problems-title" className="lp-band">
      <div className="lp-frame py-20 md:py-28">
        <h2 id="problems-title" className="lp-h1 max-w-[18ch]">
          <span className="text-[var(--lp-band-emph)]">Dead air</span> and{" "}
          <span className="text-[var(--lp-band-emph)]">lost scoresheets</span> ruin quiz night.
        </h2>
        <p className="lp-body mt-5 max-w-[47.5rem]">
          Hands up, pens out, someone squinting at the slide from the back row, then ten minutes of
          adding up scores while the room goes quiet. QuizArena takes all of that off your hands.
        </p>

        <ul className="-mx-[var(--lp-pad)] mt-12 flex snap-x snap-mandatory scroll-px-[var(--lp-pad)] gap-[18px] overflow-x-auto px-[var(--lp-pad)] [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {PROBLEMS.map((p) => (
            <ProblemCard key={p.title} p={p} />
          ))}
        </ul>

        <div className="mt-20 grid gap-10 md:mt-28 md:grid-cols-2 md:items-end">
          <div>
            <h2 className="lp-h2 max-w-[16ch]">Got a PIN from the big screen? Jump straight in.</h2>
            <p className="lp-body mt-4 max-w-[28rem]">
              Type the six digits after QA. Pick a nickname and you&apos;re in the lobby, waiting
              for the first question with everyone else.
            </p>
          </div>
          <div className="flex flex-col gap-4 md:items-end">
            <p className="text-[18px]">No app. No account. Just the PIN.</p>
            <CodePill variant="band" />
          </div>
        </div>
      </div>
    </section>
  );
}
