"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SCENARIOS, type ScenarioId } from "@attune/engine";
import { BrandMark } from "@/components/shell";
import { AttuneStoryVideo } from "@/components/story";
import { Eyebrow, SimulatedTag } from "@/components/ui";
import { useAttune } from "@/lib/store";

const LOOP = [
  {
    step: "Detect",
    text: "Signals from what you say and how you work: pace, misses, hints, switching.",
  },
  {
    step: "Understand",
    text: "Why you've drifted: bored, stuck, tired, curious, or alone. Read as states, never diagnoses.",
  },
  { step: "Intervene", text: "The one thing most likely to help now. Often not more content." },
  { step: "Observe", text: "Did it bring you back? Measured, not assumed." },
  { step: "Adapt", text: "What worked becomes the next starting point, with the reason shown." },
];

export default function Home() {
  const router = useRouter();
  const { startScenario, session, hydrated } = useAttune();

  const start = (id: ScenarioId) => {
    startScenario(id);
    router.push("/session");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <section className="pt-14 sm:pt-24">
        <div className="flex items-center gap-2">
          <BrandMark size={28} />
          <Eyebrow>Engagement intelligence for learners</Eyebrow>
        </div>
        <h1 className="type-display mt-6 max-w-4xl text-ink">
          Not personalized content.
          <br />
          <em className="text-accent">Personalized engagement.</em>
        </h1>
        <p className="mt-6 max-w-2xl type-lead text-ink-2">
          A student can be bored, stuck, tired, curious or alone, and each needs something
          different. Attune works out which, changes the next few minutes to fit, and shows its
          reasoning. It runs on a cheap phone, offline.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/begin"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-5 text-[15px] font-medium text-inverse hover:opacity-90"
          >
            Begin a 40-second check-in <ArrowRight className="size-4" />
          </Link>
          {hydrated && session && !session.endedAt && (
            <Link
              href="/session"
              className="inline-flex h-12 items-center rounded-xl border border-line bg-surface px-5 text-[15px] text-ink hover:border-line-strong"
            >
              Resume your session
            </Link>
          )}
          <Link href="/story" className="px-2 text-[15px] text-muted hover:text-ink">
            Read the story
          </Link>
        </div>
      </section>

      <AttuneStoryVideo className="mt-14" autoPlayInView />

      <section
        aria-label="The loop"
        className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-5"
      >
        {LOOP.map((l, i) => (
          <div key={l.step} className="bg-surface p-4">
            <p className="font-mono text-[11px] text-muted">0{i + 1}</p>
            <p className="mt-1 text-[15px] font-medium text-ink">{l.step}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{l.text}</p>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Demo · about four minutes</Eyebrow>
            <h2 className="type-h1 mt-2 text-ink">
              Same topic. Four learners. Four different reasons.
            </h2>
            <p className="mt-2 max-w-2xl text-ink-2">
              Pick one and watch the engine choose a different strategy for each, then overrule it
              and watch it adapt.
            </p>
          </div>
          <SimulatedTag>Fictional learners</SimulatedTag>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map((s) => (
            <div key={s.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
              <p className="font-mono text-[12px] text-muted">Scenario {s.id}</p>
              <p className="type-h2 mt-2 text-ink">{s.name}</p>
              <p className="text-[14px] font-medium text-ink-2">{s.label}</p>
              <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">{s.tagline}</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => start(s.id)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-inverse hover:opacity-90"
                >
                  Start as {s.name} <ArrowRight className="size-4" />
                </button>
                <Link
                  href={`/begin?scenario=${s.id}`}
                  className="text-center text-[13px] text-muted hover:text-ink"
                >
                  or walk through the check-in
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
