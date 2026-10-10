import {
  Globe,
  ImagePlay,
  ListOrdered,
  PenLine,
  Projector,
  Smartphone,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { Competitor, seedOf } from "@/components/ambient/competitor";
import { Marquee } from "@/components/ambient/marquee";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------------------------------
   3. Pillars + bento
   ------------------------------------------------------------------------------------------ */

const PILLARS = [
  {
    icon: PenLine,
    title: "Build",
    body: "Multiple choice and true/false questions, with an image or a video, and a timer and points set per question. Or import a whole quiz from a spreadsheet or Google Sheets.",
  },
  {
    icon: Projector,
    title: "Run",
    body: "Put the arena on any screen. Players answer on their phones while you set the pace, adjust the timer and trigger reveals from a separate host view.",
  },
  {
    icon: Trophy,
    title: "Celebrate",
    body: "A live leaderboard between questions, then a 3D podium ceremony that reveals third, second and first, one at a time.",
  },
];

const JOINED = [
  { name: "Mira", t: "0:03", c: 2 },
  { name: "Kai", t: "0:05", c: 1 },
  { name: "Sam", t: "0:06", c: 3 },
];

export function Pillars() {
  return (
    <section id="pillars" aria-labelledby="pillars-title" className="lp-frame py-20 md:py-28">
      <h2 id="pillars-title" className="lp-h2">
        Build it. Run it. Crown a winner.
      </h2>
      <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {PILLARS.map((p) => (
          <li key={p.title}>
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent-soft text-accent">
              <p.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <h3 className="mt-4 text-[20px] font-medium">{p.title}</h3>
            <p className="lp-body mt-2 text-[15px]!">{p.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-14 grid gap-4 md:grid-cols-[2fr_1fr]">
        {/* A room filling up: competitors on the arena floor, join cards stacking up. */}
        <div
          aria-hidden
          className="arena-floor relative h-[22rem] overflow-hidden rounded-[var(--lp-radius)] border border-line bg-sunken md:h-[28rem]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_30%_0%,var(--accent-soft),transparent_70%)]" />
          <div className="absolute inset-x-0 bottom-0 flex h-[38%] items-end md:h-[48%] justify-start gap-[2%] px-[6%] pb-[6%]">
            {["owl", "fox", "kai", "mira", "sam", "zee"].map((n, i) => (
              <Competitor
                key={n}
                seed={seedOf(n)}
                walking={false}
                className={cn("h-full w-auto", i % 2 === 1 && "mb-[4%] h-[85%]")}
              />
            ))}
          </div>
          <ul className="absolute right-[5%] top-[6%] flex w-[min(15rem,52%)] flex-col gap-1.5">
            {JOINED.map((j, i) => (
              <li
                key={j.name}
                className="lp-glass flex items-center gap-3 px-3 py-2.5"
                style={{ marginLeft: `${i * 10}%` }}
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-full"
                  style={{ background: `var(--answer-${j.c})` }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{j.name}</span>
                  <span className="block text-[12px] text-fg-2">joined · {j.t}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* The player's phone, just after answering. */}
        <div
          aria-hidden
          className="relative h-[22rem] overflow-hidden rounded-[var(--lp-radius)] bg-elevated md:h-[28rem]"
        >
          <div className="absolute left-1/2 top-10 w-[15rem] -translate-x-1/2 rounded-[2.4rem] border-[6px] border-line-strong bg-bg p-4 pb-24 shadow-[var(--shadow-lg)]">
            <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-line" />
            <div className="flex items-center justify-between text-[11px] text-fg-3">
              <span>Question 4</span>
              <span className="numeric">Kai · 3,000</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className={cn(
                    "numeric grid h-[4.5rem] place-items-center rounded-xl text-[22px] font-bold",
                    n !== 1 && "opacity-30",
                  )}
                  style={{ background: `var(--answer-${n})`, color: `var(--answer-ink-${n})` }}
                >
                  {"ABCD"[n - 1]}
                </span>
              ))}
            </div>
            <p className="lp-glass mt-4 px-3 py-2 text-center text-[13px] font-medium">
              Answer in ✓ Eyes on the big screen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------
   4. Capability strip: what QuizArena does, not awards it hasn't won.
   ------------------------------------------------------------------------------------------ */

const CAPABILITIES = [
  { icon: Smartphone, label: "No app install" },
  { icon: Globe, label: "Any phone, any browser" },
  { icon: ImagePlay, label: "Images + video" },
  { icon: ListOrdered, label: "Live leaderboard" },
  { icon: Trophy, label: "3D podium" },
];

/** Leaves along two arcs, mirrored left and right. */
const LEAVES = [0, 1, 2, 3, 4].map((k) => {
  const deg = 200 + k * 26;
  const a = (deg * Math.PI) / 180;
  return { x: 36 + Math.cos(a) * 26, y: 38 - Math.sin(a) * 26, r: 90 - deg };
});

function Laurel({ icon: Icon, label }: (typeof CAPABILITIES)[number]) {
  return (
    <div className="flex w-36 shrink-0 flex-col items-center gap-2 text-fg-2">
      <span className="relative grid h-[4.5rem] w-[4.5rem] place-items-center">
        <svg
          viewBox="0 0 72 72"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          aria-hidden
          className="absolute inset-0 h-full w-full"
        >
          {LEAVES.map((l, k) => (
            <g key={k}>
              <ellipse
                cx={l.x}
                cy={l.y}
                rx="2.6"
                ry="5.4"
                transform={`rotate(${l.r} ${l.x} ${l.y})`}
              />
              <ellipse
                cx={72 - l.x}
                cy={l.y}
                rx="2.6"
                ry="5.4"
                transform={`rotate(${-l.r} ${72 - l.x} ${l.y})`}
              />
            </g>
          ))}
        </svg>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <span className="text-center text-[12px] text-fg-3">{label}</span>
    </div>
  );
}

export function Capabilities() {
  return (
    <section aria-label="What you get" className="lp-hairline border-b border-line">
      <div className="lp-frame hidden py-20 md:block">
        <ul className="flex justify-between">
          {CAPABILITIES.map((c) => (
            <li key={c.label}>
              <Laurel {...c} />
            </li>
          ))}
        </ul>
      </div>
      {/* Phones: the same badges as a slow ticker. */}
      <div className="py-12 md:hidden">
        <Marquee duration={15} gap={8}>
          {CAPABILITIES.map((c) => (
            <Laurel key={c.label} {...c} />
          ))}
        </Marquee>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------
   7a. Floating competitors: the crowd that came to play.
   ------------------------------------------------------------------------------------------ */

const CROWD = [
  { name: "Kai", x: "6%", y: "12%", d: 0 },
  { name: "Mira", x: "15%", y: "50%", d: 0.2, wide: true },
  { name: "Sam", x: "4%", y: "76%", d: 0.5 },
  { name: "Zee", x: "28%", y: "4%", d: 0.9, wide: true },
  { name: "Ola", x: "66%", y: "2%", d: 1.1, wide: true },
  { name: "Theo", x: "84%", y: "14%", d: 1.4 },
  { name: "Ivy", x: "88%", y: "52%", d: 0.2, wide: true },
  { name: "Ravi", x: "78%", y: "78%", d: 0.9 },
];

export function Crowd() {
  return (
    <section
      aria-labelledby="crowd-title"
      className="lp-frame relative overflow-hidden py-28 md:py-36"
    >
      <div aria-hidden className="absolute inset-0">
        {CROWD.map((c) => (
          <div
            key={c.name}
            className={cn("absolute", c.wide && "max-md:hidden")}
            style={{ left: c.x, top: c.y }}
          >
            <div className="lp-bob" style={{ animationDelay: `${c.d}s` }}>
              <div className="lp-wiggle flex flex-col items-center gap-1">
                <Competitor seed={seedOf(c.name)} walking={false} className="h-12 w-auto md:h-16" />
                <span className="rounded-full border border-line bg-surface px-2 text-[11px] leading-5 text-fg-2">
                  {c.name}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="relative mx-auto flex max-w-[40rem] flex-col items-center px-12 text-center md:px-0">
        <h2 id="crowd-title" className="lp-h2">
          Everyone plays. Nobody installs anything.
        </h2>
        <Link href="/play" className="lp-btn lp-btn-ink mt-6">
          Join a game
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------
   9. Footer
   ------------------------------------------------------------------------------------------ */

const FOOTER_LINKS = [
  {
    heading: "Play",
    links: [
      { label: "Join a game", href: "/play" },
      { label: "Host a quiz", href: "/admin" },
    ],
  },
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#pillars" },
      { label: "Question types", href: "#types" },
      { label: "Sample game", href: "#replay" },
    ],
  },
  {
    heading: "On this page",
    links: [
      { label: "Why QuizArena", href: "#problems" },
      { label: "The podium", href: "#finale" },
      { label: "Back to top", href: "#top" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="lp-band rounded-t-[var(--lp-radius)] bg-[var(--lp-footer)]!">
      <div className="lp-frame pb-10 pt-16 md:pt-20">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid min-h-48 place-items-center rounded-[var(--lp-radius)] bg-[var(--lp-band-card)] p-8">
            {/* The logo reads theme tokens; point them at the footer's own colours. */}
            <span
              style={
                {
                  "--text-primary": "var(--lp-band-text)",
                  "--accent": "var(--lp-band-emph)",
                  "--background": "var(--lp-band-card)",
                } as React.CSSProperties
              }
            >
              <Logo size="lg" />
            </span>
          </div>
          <div className="flex flex-col justify-center gap-6 md:pl-8">
            <p className="font-[family-name:var(--lp-serif)] text-[28px] font-[200] leading-[1.15] md:text-[32px]">
              Ready when your room is. Build a quiz, put it on the big screen, and let the phones do
              the rest.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin" className="lp-btn lp-btn-accent">
                Host a quiz
              </Link>
              <Link
                href="/play"
                className="lp-btn border-[var(--lp-band-line)] text-[var(--lp-band-text)] hover:bg-[var(--lp-band-card)]"
              >
                Join a game
              </Link>
            </div>
          </div>
        </div>

        <nav aria-label="Footer" className="mt-14 grid grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER_LINKS.map((col) => (
            <div key={col.heading}>
              <p className="text-[16px] text-[var(--lp-band-muted)] md:text-[18px]">
                {col.heading}
              </p>
              <ul className="mt-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="lp-link inline-block py-1 text-[16px] leading-6">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-[16px] text-[var(--lp-band-muted)] md:text-[18px]">Theme</p>
            <div className="mt-3">
              <ThemeToggle />
            </div>
          </div>
        </nav>

        <p className="mt-14 text-[12px] text-[var(--lp-band-muted)]">
          QuizArena. Live quizzes for classrooms, campuses and events.
        </p>
      </div>
    </footer>
  );
}
