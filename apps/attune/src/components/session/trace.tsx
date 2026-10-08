"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  CONTROL_META,
  INTERVENTION_META,
  MODALITY_META,
  STATE_META,
  type Decision,
  type TimelineEntry,
} from "@attune/engine";
import { cn, Eyebrow, stateColor } from "../ui";

/**
 * The glass box. Five steps of the loop, each showing exactly what the engine computed:
 * Detect (signals) → Understand (state distribution) → Intervene (scored options)
 * → Observe (outcome of the last activity) → Adapt (what changed in the model).
 */
export function EngineTrace({
  decision,
  previous,
}: {
  decision: Decision;
  previous?: TimelineEntry;
}) {
  const signals = [...decision.reading.signals]
    .filter((s) => s.key !== "baseline")
    .sort((a, b) => b.value - a.value);
  const top = decision.reading.distribution.slice(0, 6);
  const c = decision.constraints;
  const constraintText = [
    c.cause && c.cause !== "mood" && c.cause !== "choice"
      ? `from “${CONTROL_META[c.cause].label}”`
      : c.cause === "mood"
        ? "from your mood check-in"
        : c.cause === "choice"
          ? "from your choice"
          : "",
    c.forceKind ? `must be ${INTERVENTION_META[c.forceKind].label.toLowerCase()}` : "",
    c.allowedKinds
      ? `only ${c.allowedKinds.map((k) => INTERVENTION_META[k].label.toLowerCase()).join(" / ")}`
      : "",
    c.excludeKinds?.length
      ? `not ${c.excludeKinds.map((k) => INTERVENTION_META[k].label.toLowerCase()).join(", ")}`
      : "",
    c.minDifficulty !== undefined ? `level ≥ ${Math.min(c.minDifficulty, 5)}` : "",
    c.maxDifficulty !== undefined ? `level ≤ ${c.maxDifficulty}` : "",
    c.excludeModalities?.length
      ? `not ${c.excludeModalities.map((m) => MODALITY_META[m].label.toLowerCase()).join(", ")}`
      : "",
    c.preferModality ? `prefer ${MODALITY_META[c.preferModality].label.toLowerCase()}` : "",
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <Step n={1} title="Detect" subtitle={`${signals.length} signals`} defaultOpen>
        <ul className="space-y-2">
          {signals.slice(0, 8).map((s) => (
            <li key={s.key}>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="font-mono text-ink">{s.key}</span>
                <span className="font-mono text-muted">{s.source}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-ink-2"
                  style={{ width: `${Math.round(s.value * 100)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[12px] text-muted">{s.detail}</p>
            </li>
          ))}
          {signals.length === 0 && <li className="text-[12.5px] text-muted">No signals yet.</li>}
        </ul>
      </Step>

      <Step
        n={2}
        title="Understand"
        subtitle={`${STATE_META[decision.reading.primary].label} · confidence ${Math.round(decision.reading.confidence * 100)}`}
        defaultOpen
      >
        <ul className="space-y-1.5">
          {top.map((d) => (
            <li
              key={d.state}
              className="grid grid-cols-[96px_1fr_36px] items-center gap-2 text-[12px]"
            >
              <span className="truncate text-ink-2">{STATE_META[d.state].label}</span>
              <span className="h-2 rounded-full bg-surface-3">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(2, d.p * 100)}%`, background: stateColor(d.state) }}
                />
              </span>
              <span className="tabular text-right font-mono text-muted">
                {Math.round(d.p * 100)}%
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-muted">
          Engagement index{" "}
          <span className="font-mono text-ink">{decision.reading.engagementIndex}</span> · knowledge{" "}
          <span className="font-mono text-ink">
            {decision.reading.knowledgeHigh ? "high" : "building"}
          </span>
        </p>
      </Step>

      <Step n={3} title="Intervene" subtitle={INTERVENTION_META[decision.kind].label} defaultOpen>
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-1 font-normal">option</th>
              <th className="pb-1 text-right font-normal" title="Rule-table prior for this state">
                prior
              </th>
              <th className="pb-1 text-right font-normal" title="This learner's history with it">
                learned
              </th>
              <th
                className="pb-1 text-right font-normal"
                title="Energy, time, connectivity, traits"
              >
                context
              </th>
              <th
                className="pb-1 text-right font-normal"
                title="Penalty for repeating what isn't working"
              >
                novelty
              </th>
              <th className="pb-1 text-right font-normal">score</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {decision.candidates.slice(0, 6).map((cand) => (
              <tr
                key={cand.kind}
                className={cn(cand.kind === decision.kind ? "text-ink" : "text-muted")}
              >
                <td className="py-0.5 pr-1 font-sans">
                  {cand.kind === decision.kind ? "▸ " : ""}
                  {INTERVENTION_META[cand.kind].label}
                </td>
                <td className="text-right">{cand.prior.toFixed(2)}</td>
                <td className="text-right">{cand.learned.toFixed(2)}</td>
                <td className="text-right">{cand.context.toFixed(2)}</td>
                <td className="text-right">{cand.novelty.toFixed(2)}</td>
                <td className="text-right">{cand.score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {constraintText.length > 0 && (
          <p className="mt-2 rounded-lg bg-surface-2 px-2 py-1.5 text-[12px] text-ink-2">
            <span className="font-medium text-ink">Constraint</span> {constraintText.join(" · ")}
          </p>
        )}
        <p className="mt-2 text-[12px] text-muted">
          Served <span className="font-mono text-ink">{decision.activity.id}</span>
          {decision.difficulty ? ` · level ${decision.difficulty}` : ""}
          {decision.modality ? ` · ${MODALITY_META[decision.modality].label.toLowerCase()}` : ""}
          {decision.frame ? ` · ${decision.frame}` : ""}
        </p>
      </Step>

      <Step
        n={4}
        title="Observe"
        subtitle={
          previous?.outcome ? (previous.outcome.recovered ? "Recovered" : "No lift") : "Waiting"
        }
      >
        {previous?.outcome ? (
          <div className="text-[12.5px] text-ink-2">
            <p>
              Last: <span className="text-ink">{previous.title}</span> (
              {INTERVENTION_META[previous.kind].label.toLowerCase()}, while{" "}
              {STATE_META[previous.state].label.toLowerCase()})
            </p>
            <p className="mt-1 font-mono text-[12px]">
              {previous.outcome.status} · index {previous.indexBefore} →{" "}
              {previous.outcome.indexAfter} ({previous.outcome.delta >= 0 ? "+" : ""}
              {previous.outcome.delta})
            </p>
            <p
              className={cn(
                "mt-1 font-medium",
                previous.outcome.recovered ? "text-good" : "text-ink-2",
              )}
            >
              {previous.outcome.recovered
                ? "Counts as a recovery."
                : "Doesn't count as a recovery."}
            </p>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">
            The first outcome appears when this activity ends.
          </p>
        )}
      </Step>

      <Step
        n={5}
        title="Adapt"
        subtitle={previous?.modelDelta?.length ? `${previous.modelDelta.length} updates` : "—"}
      >
        {previous?.modelDelta?.length ? (
          <ul className="space-y-1 font-mono text-[11.5px]">
            {previous.modelDelta.map((d) => (
              <li key={d.label} className="flex justify-between gap-2">
                <span className="font-sans text-ink-2">{d.label}</span>
                <span className="text-ink">
                  {d.from < 0 ? "new" : d.from.toFixed(2)} → {d.to.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted">Model updates appear after each activity.</p>
        )}
      </Step>
    </div>
  );
}

function Step({
  n,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  n: number;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-surface-2 font-mono text-[11px] text-ink-2">
          {n}
        </span>
        <span className="text-[13px] font-medium text-ink">{title}</span>
        <span className="ml-auto truncate text-[12px] text-muted">{subtitle}</span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <div className="border-t border-line px-3 py-2.5">{children}</div>}
    </section>
  );
}

export function TraceHeader() {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <Eyebrow>Engine trace</Eyebrow>
      <span className="text-[11.5px] text-muted">live · on this device</span>
    </div>
  );
}
