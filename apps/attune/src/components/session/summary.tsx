"use client";

import Link from "next/link";
import { ArrowRight, FastForward, Leaf } from "lucide-react";
import { growthMoments, learnerPatterns, sessionMetrics, type Rate } from "@attune/engine";
import { useAttune } from "@/lib/store";
import { Button, Eyebrow, percent, SimulatedTag } from "../ui";
import { EngagementArc } from "./arc";

function rateText(r: Rate): string {
  return r.rate === null ? "—" : `${r.n} of ${r.of}`;
}

export function SessionSummary() {
  const { session, end, resume, tomorrow, scenarioId } = useAttune();
  if (!session) return null;
  const ended = Boolean(session.endedAt);
  const m = sessionMetrics(session);
  const moments = growthMoments(session);
  const { patterns } = learnerPatterns(session.learner);

  const tiles = [
    {
      label: "Recovery from disengagement",
      value: rateText(m.recovery),
      note: "Moments that started disengaged and came back",
    },
    {
      label: "Task completion",
      value: percent(m.taskCompletion.rate),
      note: `${m.taskCompletion.n} of ${m.taskCompletion.of} activities finished`,
    },
    {
      label: "Challenge calibration",
      value: m.calibration ? `${percent(m.calibration.observed)} right` : "—",
      note: m.calibration
        ? `Aimed for ~${percent(m.calibration.target)} · ${m.calibration.onTarget ? "on target" : "adjusting"}`
        : "No answers yet",
    },
    {
      label: "Persistence after a miss",
      value: rateText(m.persistence),
      note: "Kept going after getting one wrong",
    },
    {
      label: "Return to learning",
      value: rateText(m.returnToLearning),
      note: "Came back to the work after a break or tangent",
    },
    {
      label: "Useful?",
      value:
        m.usefulness === null
          ? "—"
          : ["", "Not really", "Somewhat", "Yes"][Math.round(m.usefulness)]!,
      note: "Your own rating, if you gave one",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-6">
      <Leaf className="size-6 text-accent" aria-hidden />
      <Eyebrow className="mt-3">
        {session.learner.displayName} · Day {session.learner.day}
      </Eyebrow>
      <h1 className="type-h1 mt-2 text-ink">
        {ended ? "That's a good place to stop." : "This looks like a good place to stop."}
      </h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-2">
        {ended
          ? "We don't count minutes here. What matters is whether the work got unstuck, and whether you'd want to come back."
          : "You've done real work, and stopping on something that went well makes it easier to start next time. Your call."}
      </p>
      {!ended && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={end}>
            End and see the summary
          </Button>
          <Button onClick={resume}>Keep going</Button>
        </div>
      )}

      <section className="mt-8 rounded-2xl border border-line bg-surface p-4">
        <p className="mb-1 text-[13px] font-medium text-ink">How the session went</p>
        <EngagementArc timeline={session.timeline} height={150} />
        <p className="mt-2 text-[13px] text-ink-2">
          Started at <strong className="tabular text-ink">{m.startIndex}</strong>, ended at{" "}
          <strong className="tabular text-ink">{m.endIndex}</strong> on the engagement index, across{" "}
          {session.timeline.length} adaptive decisions.
        </p>
      </section>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-medium text-ink">Measured this session</p>
          <p className="text-[11.5px] text-muted">No &ldquo;time spent&rdquo;, by design</p>
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl border border-line bg-surface p-4">
              <dt className="text-[12.5px] text-muted">{t.label}</dt>
              <dd className="tabular mt-1 text-[26px] font-medium leading-tight text-ink">
                {t.value}
              </dd>
              <dd className="mt-1 text-[12.5px] text-ink-2">{t.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      {moments.length > 0 && (
        <section className="mt-6">
          <p className="text-[13px] font-medium text-ink">Worth noticing</p>
          <p className="text-[12.5px] text-muted">
            Not points or streaks: the things that actually build a learner.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {moments.map((g) => (
              <li key={g.key} className="rounded-xl border border-line bg-surface px-4 py-3">
                <p className="text-[14.5px] font-medium text-ink">{g.label}</p>
                <p className="text-[13px] text-ink-2">{g.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {patterns.length > 0 && (
        <section className="mt-6 rounded-2xl bg-accent-soft p-4">
          <p className="text-[13px] font-medium text-ink">What your twin learned</p>
          {patterns.map((p) => (
            <p key={p.text} className="mt-1 text-[14.5px] text-ink">
              {p.text}{" "}
              <span className="text-[12.5px] text-ink-2">
                ({p.evidence} · {p.strength})
              </span>
            </p>
          ))}
        </section>
      )}

      {ended && (
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link
            href="/twin"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-inverse"
          >
            See what changed in your twin <ArrowRight className="size-4" />
          </Link>
          <Button onClick={tomorrow}>
            <FastForward className="size-4" /> Fast-forward to tomorrow
          </Button>
          {scenarioId && <SimulatedTag>Demo</SimulatedTag>}
        </div>
      )}
    </div>
  );
}
