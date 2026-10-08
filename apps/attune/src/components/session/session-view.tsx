"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Cpu, Fingerprint, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  CONCEPT_META,
  CONTROL_META,
  INTERVENTION_META,
  MODALITY_META,
  type Decision,
} from "@attune/engine";
import { useConnectivity } from "@/lib/connectivity";
import { useAttune } from "@/lib/store";
import { Badge, Button, cn, Eyebrow, Skeleton, StateBadge } from "../ui";
import { ActivityView } from "./activity";
import { EngagementArc } from "./arc";
import { ControlBar } from "./controls";
import { SessionSummary } from "./summary";
import { EngineTrace, TraceHeader } from "./trace";
import { WhyPanel } from "./why";

function triggerText(d: Decision, previous?: Decision): string {
  const t = d.trigger;
  if (t === "start") return "From your check-in";
  if (t === "mood") {
    const feeling = d.reading.signals.find((s) => s.key.startsWith("now_"));
    return feeling ? feeling.detail : "From how you said you're feeling";
  }
  if (t === "choice") return "You chose this";
  if (t === "reflection") return "After your reflection";
  if (t === "completed")
    return previous ? `After you finished “${previous.activity.title}”` : "After the last activity";
  if (t === "abandoned") return "After you moved on";
  const action = t.replace("control:", "") as keyof typeof CONTROL_META;
  return `You pressed “${CONTROL_META[action].label}”`;
}

/** What visibly changed between the previous decision and this one — the adaptation, made legible. */
function changes(d: Decision, prev?: Decision): string[] {
  if (!prev) return [];
  const out: string[] = [];
  if (prev.kind !== d.kind)
    out.push(`${INTERVENTION_META[prev.kind].label} → ${INTERVENTION_META[d.kind].label}`);
  if (prev.difficulty && d.difficulty && prev.difficulty !== d.difficulty) {
    out.push(
      `Level ${prev.difficulty} ${d.difficulty > prev.difficulty ? "↑" : "↓"} ${d.difficulty}`,
    );
  }
  if (prev.modality && d.modality && prev.modality !== d.modality) {
    out.push(`${MODALITY_META[prev.modality].label} → ${MODALITY_META[d.modality].label}`);
  } else if (!prev.modality && d.modality) {
    out.push(`Now: ${MODALITY_META[d.modality].label.toLowerCase()}`);
  }
  if (prev.frame !== d.frame && d.frame) out.push(`Framed in ${d.frame}`);
  return out;
}

function useMinutes(since: number) {
  const [now, setNow] = useState(() => since);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the clock from the real time after mount
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((now - since) / 60000));
}

export function SessionView() {
  const { hydrated, session, send, end, resume, shareDiscovery } = useAttune();
  const { mode, aiConfigured } = useConnectivity();
  const [traceOpen, setTraceOpen] = useState(true);
  const minutes = useMinutes(session?.startedAt ?? 0);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <Eyebrow>No session yet</Eyebrow>
        <h1 className="voice mt-3 text-[34px] leading-tight text-ink">
          Start with a 40-second check-in.
        </h1>
        <p className="mt-3 text-ink-2">
          Or open Demo mode and pick one of four fictional learners to see how differently the
          engine responds to each.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/begin"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-inverse"
          >
            Begin check-in <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (session.endedAt || !session.current) return <SessionSummary />;

  const decision = session.current;
  const previous = session.decisions[session.decisions.length - 2];
  const previousEntry = session.timeline[session.timeline.length - 2];
  const learner = session.learner;
  const diff = changes(decision, previous);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6">
      {/* Session header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <p className="text-[13px] text-muted">
            {learner.displayName} · Day {learner.day} · {learner.goal}
          </p>
          <p className="text-[13px] text-ink-2">
            Working on{" "}
            <span className="font-medium text-ink">
              {CONCEPT_META[decision.focusConcept].label}
            </span>
            {decision.focusConcept !== learner.goalConcept && (
              <span className="text-muted">
                {" "}
                (on the way to {CONCEPT_META[learner.goalConcept].short.toLowerCase()})
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="tabular text-[13px] text-muted">
            {minutes} min · planned {learner.context.timeBudgetMin}
          </span>
          <Button size="sm" variant="ghost" onClick={end}>
            End session
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="hidden lg:inline-flex"
            onClick={() => setTraceOpen((o) => !o)}
            aria-pressed={traceOpen}
          >
            {traceOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
            Engine
          </Button>
        </div>
      </div>

      {/* Engagement arc */}
      <section
        aria-label="Engagement arc"
        className="mt-4 rounded-2xl border border-line bg-surface px-4 pb-3 pt-3"
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-ink">Engagement arc</p>
          <p className="hidden text-[11.5px] text-muted sm:block">
            Engagement index: a heuristic reading of the interaction, 0–100. Not a measure of you.
          </p>
        </div>
        <EngagementArc timeline={session.timeline} height={112} />
      </section>

      <div className={cn("mt-5 grid gap-5", traceOpen && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
        <section aria-label="Current activity" className="min-w-0">
          {/* Decision header: state read → intervention → reason */}
          <div key={decision.id} className="rise">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge
                state={decision.reading.primary}
                p={decision.reading.distribution[0]?.p}
              />
              <span className="text-[13px] text-muted">{triggerText(decision, previous)}</span>
              {decision.patternRecognized && (
                <Badge tone="accent">
                  <Fingerprint className="size-3" /> Recognised pattern
                </Badge>
              )}
            </div>
            <h1 className="voice mt-3 text-[30px] leading-[1.15] text-ink sm:text-[34px]">
              {decision.rationale.headline}
            </h1>
            <p className="mt-2 max-w-3xl text-[15.5px] leading-relaxed text-ink-2">
              {decision.rationale.summary}
            </p>
            {diff.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="What changed">
                <span className="inline-flex items-center gap-1 text-[12px] text-accent">
                  <Cpu className="size-3.5" aria-hidden /> Adapted
                </span>
                {diff.map((c) => (
                  <span
                    key={c}
                    className="rounded-md bg-accent-soft px-2 py-0.5 text-[12.5px] font-medium text-accent"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3">
              <WhyPanel decision={decision} />
            </div>
          </div>

          {/* The activity */}
          <article className="mt-5 rounded-2xl border border-line bg-surface p-5 shadow-soft sm:p-7">
            <ActivityView
              key={decision.id}
              decision={decision}
              mode={mode}
              interests={learner.interests}
              aiAvailable={aiConfigured && learner.consent.useAiGateway}
              onEvent={send}
              onEnd={end}
              onResume={resume}
              onShare={(title, text) => shareDiscovery({ title, text })}
            />
          </article>

          {/* Human control */}
          <div className="mt-4 rounded-2xl border border-line bg-surface-2/50 p-3 sm:p-4">
            <p className="mb-2 text-[12.5px] text-muted">
              You&apos;re in control. Anything you press changes what comes next, and teaches the
              engine about you.
            </p>
            <ControlBar
              onEvent={send}
              energy={learner.context.energy}
              timeBudgetMin={learner.context.timeBudgetMin}
            />
          </div>

          {mode !== "full" && (
            <p className="mt-3 text-[12.5px] text-muted">
              {mode === "light" ? "Light mode" : "Offline mode"}: this activity is{" "}
              <span className="tabular font-mono">
                {(new Blob([JSON.stringify(decision.activity)]).size / 1024).toFixed(1)} KB
              </span>{" "}
              of text, served from this device.
              {mode === "offline" && " Your progress is queued and will sync when you reconnect."}
            </p>
          )}
        </section>

        {/* The glass box */}
        <aside aria-label="Engine trace" className={cn(traceOpen ? "block" : "hidden", "min-w-0")}>
          <div className="lg:sticky lg:top-20">
            <TraceHeader />
            <EngineTrace decision={decision} previous={previousEntry} />
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              Everything above was computed on this device by the Attune engine. No language model
              decides what you see.
            </p>
          </div>
        </aside>
        {!traceOpen && (
          <button
            type="button"
            onClick={() => setTraceOpen(true)}
            className="text-left text-[13px] font-medium text-accent lg:hidden"
          >
            Show engine trace
          </button>
        )}
      </div>
    </div>
  );
}
