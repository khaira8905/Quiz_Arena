import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { JoinCodeForm } from "@/components/landing/join-code-form";

const steps = [
  {
    n: "01",
    title: "Build",
    body: "Write questions in the editor. Timers, points, images — set per question.",
  },
  { n: "02", title: "Project", body: "Go live. The arena shows a code and QR on the big screen." },
  {
    n: "03",
    title: "Compete",
    body: "Players answer on their phones. Fastest correct answers climb the board.",
  },
];

export default function Home() {
  return (
    <main className="arena-floor relative flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link
          href="/admin"
          className="label inline-flex items-center gap-2 text-fg-2 transition-colors hover:text-fg"
        >
          Host a quiz <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>

      <section className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-12 px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <div>
          <p className="label flex items-center gap-2 text-accent">
            <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-accent" />
            Live multiplayer quiz platform
          </p>
          <h1 className="mt-6 font-display text-display uppercase">
            100 players.
            <br />
            <span className="text-accent">One arena.</span>
          </h1>
          <p className="mt-6 max-w-lg text-body-lg text-fg-2">
            Run a live quiz for a lecture hall, a hackathon or a company all-hands. One screen,
            every phone in the room, results the second the timer hits zero.
          </p>
        </div>

        <div className="notch relative border border-line-strong bg-surface/90 p-6 sm:p-8">
          <div className="label text-fg-3">Have a code?</div>
          <h2 className="mt-3 font-display text-h1">Enter the arena</h2>
          <p className="mt-2 text-body text-fg-2">
            It&apos;s on the big screen — looks like QA4821.
          </p>
          <JoinCodeForm />
        </div>
      </section>

      <section aria-label="How it works" className="border-t border-line bg-surface/60">
        <ol className="mx-auto grid max-w-7xl gap-px px-5 sm:px-8 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="py-7 md:pr-8">
              <span className="numeric text-h2 font-bold text-accent">{s.n}</span>
              <h3 className="mt-2 font-display text-h3">{s.title}</h3>
              <p className="mt-1 text-body-sm text-fg-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
