import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OrbitField } from "@/components/ambient/orbit-field";
import { Parade } from "@/components/ambient/parade";
import { Logo } from "@/components/brand/logo";
import { HeroTitle } from "@/components/landing/hero-title";
import { JoinCodeForm } from "@/components/landing/join-code-form";
import { Reveal } from "@/components/landing/reveal";
import { Showcase } from "@/components/landing/showcase";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

const steps = [
  {
    n: "01",
    title: "Build",
    body: "Write questions in the editor. Timers, points, images and video, set per question.",
  },
  { n: "02", title: "Project", body: "Go live. The big screen shows a game PIN and a QR code." },
  {
    n: "03",
    title: "Compete",
    body: "Players answer on their phones. Fastest correct answers climb the board.",
  },
];

export default function Home() {
  return (
    <main className="arena-floor relative flex min-h-dvh flex-col overflow-x-clip">
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-5">
          <ThemeSwitcher className="hidden sm:flex" />
          <Link
            href="/admin"
            className="group inline-flex items-center gap-2 whitespace-nowrap text-body-sm font-semibold text-fg-2 transition-colors hover:text-fg"
          >
            Host a quiz
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-[var(--motion-normal)] group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-10 px-5 pb-10 pt-4 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-6">
        {/* String-art orbit: behind the copy on phones, beside it on wide screens. */}
        <div className="pointer-events-none absolute inset-0 -z-0 opacity-50 lg:static lg:order-2 lg:aspect-square lg:opacity-100">
          <OrbitField />
        </div>
        <div className="relative lg:order-1">
          <p className="eyebrow flex items-center gap-2 text-accent">
            <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-accent" />
            Live quiz for any room
          </p>
          <div className="mt-6">
            <HeroTitle />
          </div>
          <Reveal delay={0.5}>
            <p className="mt-6 max-w-lg text-body-lg text-fg-2">
              Run a live quiz for a lecture hall, a hackathon or a company all-hands. One screen,
              every phone in the room, results the second the timer hits zero.
            </p>
          </Reveal>
          <Reveal delay={0.65}>
            <div className="mt-8 max-w-xl rounded-lg border border-line-strong bg-surface/90 p-5 shadow-[var(--shadow-lg)] backdrop-blur-[2px] sm:p-6">
              <h2 className="font-display text-h2">Have a game PIN?</h2>
              <p className="mt-1 text-body-sm text-fg-2">
                It&apos;s on the big screen and looks like QA482193.
              </p>
              <JoinCodeForm />
            </div>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="showcase-title" className="relative py-12">
        <Reveal className="mx-auto mb-6 max-w-7xl px-5 sm:px-8">
          <h2 id="showcase-title" className="font-display text-h1">
            Every question, a moment.
          </h2>
          <p className="mt-2 max-w-xl text-body text-fg-2">
            Questions with images or video, a clock the whole room can feel, and a leaderboard that
            moves after every round.
          </p>
        </Reveal>
        <Showcase />
      </section>

      {/* The crowd arriving. */}
      <Parade className="h-16 border-b border-line-strong sm:h-20" />

      <section aria-label="How it works" className="bg-surface/60">
        <ol className="mx-auto grid max-w-7xl gap-px px-5 sm:px-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.n} className="py-8 md:pr-8">
              <Reveal delay={i * 0.08}>
                <span className="numeric text-numeric text-accent">{s.n}</span>
                <h3 className="mt-2 font-display text-h3">{s.title}</h3>
                <p className="mt-1 text-body-sm text-fg-2">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 border-t border-line px-5 py-6 text-body-sm text-fg-3 sm:px-8">
        <span>QuizArena. Live quizzes for any room.</span>
        <ThemeSwitcher className="sm:hidden" />
      </footer>
    </main>
  );
}
