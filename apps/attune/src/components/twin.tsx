"use client";

import Link from "next/link";
import { useState } from "react";
import type { SessionState } from "@attune/engine";
import { Download, Eye, EyeOff, Trash2, X } from "lucide-react";
import {
  categoryStats,
  CONCEPT_META,
  CONCEPT_ORDER,
  INTERVENTION_META,
  learnerPatterns,
  MODALITIES,
  MODALITY_META,
  STATE_META,
  TRAIT_META,
  TRAITS,
  type EngagementState,
  type InterventionKind,
  type LearnerModel,
  type Trait,
} from "@attune/engine";
import { useAttune } from "@/lib/store";
import { Badge, Button, cn, Eyebrow, percent, SimulatedTag, Skeleton, StateDot } from "./ui";

/**
 * The learner's digital twin: what the engine currently believes, how that changed, and where
 * every belief came from. The learner can correct or delete any of it.
 */

export function TwinView() {
  const { hydrated, session, updateLearner, forgetEverything, scenarioId } = useAttune();
  const [compare, setCompare] = useState<"yesterday" | "today">("yesterday");

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <Eyebrow>Your twin is empty</Eyebrow>
        <h1 className="voice mt-3 text-[34px] text-ink">
          Nothing learned yet, because nothing has happened yet.
        </h1>
        <p className="mt-3 text-ink-2">
          Do a check-in or a demo scenario. The twin fills in as you go, and you can wipe it any
          time.
        </p>
        <Link
          href="/begin"
          className="mt-6 inline-flex h-11 items-center rounded-xl bg-ink px-5 text-sm font-medium text-inverse"
        >
          Begin check-in
        </Link>
      </div>
    );
  }

  const learner = session.learner;
  const baselines = baselinesFor(session);
  const baseline = (compare === "yesterday" ? baselines.yesterday : undefined) ?? baselines.today;
  const nowLabel = "Now";
  const { patterns, engageTriggers, disengageTriggers, preferredModality } =
    learnerPatterns(learner);
  const categories = categoryStats(learner).filter((c) => c.tries > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Eyebrow>Learner twin · day {learner.day}</Eyebrow>
          <h1 className="voice mt-2 text-[36px] leading-tight text-ink sm:text-[42px]">
            {learner.displayName}&apos;s engagement map
          </h1>
          <p className="mt-2 max-w-2xl text-ink-2">
            What Attune currently believes helps{" "}
            {learner.displayName === "You" ? "you" : learner.displayName} engage, how that&apos;s
            changing, and the evidence behind it. It evolves with every activity and lives on this
            device.
          </p>
        </div>
        {scenarioId && (
          <span className="ml-auto">
            <SimulatedTag>Fictional demo learner</SimulatedTag>
          </span>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Traits */}
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-medium text-ink">Dimensions</h2>
            {baselines.yesterday && (
              <div
                role="radiogroup"
                aria-label="Compare with"
                className="flex rounded-lg border border-line p-0.5 text-[12px]"
              >
                {(["yesterday", "today"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={compare === c}
                    onClick={() => setCompare(c)}
                    className={cn(
                      "rounded-md px-2 py-0.5",
                      compare === c ? "bg-ink text-inverse" : "text-muted hover:text-ink",
                    )}
                  >
                    {c === "yesterday" ? "Since yesterday" : "Since this session"}
                  </button>
                ))}
              </div>
            )}
            {baseline && (
              <div className="flex items-center gap-4 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-full border-2 border-muted"
                    aria-hidden
                  />{" "}
                  {baseline.label}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full bg-ink" aria-hidden />{" "}
                  {nowLabel}
                </span>
              </div>
            )}
          </div>
          <ul className="mt-5 space-y-5">
            {TRAITS.map((t) => (
              <TraitRow key={t} trait={t} now={learner.traits[t]} before={baseline?.traits[t]} />
            ))}
          </ul>
        </section>

        {/* Patterns */}
        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[15px] font-medium text-ink">Emerging patterns</h2>
            {patterns.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {patterns.map((p) => (
                  <li key={p.text}>
                    <p className="voice text-[20px] leading-snug text-ink">{p.text}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      Evidence: {p.evidence} ·{" "}
                      <Badge tone={p.strength === "clear" ? "accent" : "neutral"}>
                        {p.strength}
                      </Badge>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-ink-2">
                Too early to call. Patterns appear once there&apos;s evidence from at least a few
                activities, and they always show it.
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[12.5px] text-muted">Brings you back</p>
                <p className="mt-1 text-[14px] text-ink">
                  {engageTriggers.length ? engageTriggers.join(", ") : "Not enough evidence yet"}
                </p>
              </div>
              <div>
                <p className="text-[12.5px] text-muted">Hasn&apos;t helped yet</p>
                <p className="mt-1 text-[14px] text-ink">
                  {disengageTriggers.length ? disengageTriggers.join(", ") : "Nothing so far"}
                </p>
              </div>
            </div>
            {preferredModality && (
              <p className="mt-4 text-[13.5px] text-ink-2">
                Explanations land best as{" "}
                <strong className="text-ink">{preferredModality.label.toLowerCase()}</strong> so far
                ({percent(preferredModality.rate)} of the time).
              </p>
            )}
          </div>

          {categories.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-[15px] font-medium text-ink">
                Recovery rate by kind of activity
              </h2>
              <p className="text-[12.5px] text-muted">
                How often each kind brought engagement back
              </p>
              <ul className="mt-3 space-y-2">
                {categories.map((c) => (
                  <li
                    key={c.key}
                    className="grid grid-cols-[150px_1fr_56px] items-center gap-3 text-[13px]"
                  >
                    <span className="text-ink-2">{c.label}</span>
                    <span className="h-2.5 rounded-full bg-surface-3">
                      <span
                        className="block h-full rounded-full bg-[var(--series-1)]"
                        style={{ width: `${Math.max(3, (c.rate ?? 0) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular text-right text-ink">
                      {c.recoveries}/{c.tries}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ConceptPath learner={learner} before={baseline?.ability} />
        <Modalities learner={learner} />
      </div>

      <Effectiveness learner={learner} />

      <Privacy
        learner={learner}
        updateLearner={updateLearner}
        forgetEverything={forgetEverything}
      />
    </div>
  );
}

/** Baselines: the start of the previous day (yesterday), and the start of this session (today). */
function baselinesFor(session: SessionState) {
  const learner = session.learner;
  const previousDay = [...learner.snapshots].reverse().find((s) => s.day < learner.day);
  const yesterday = previousDay?.start
    ? {
        label: `Start of day ${previousDay.day}`,
        traits: previousDay.start.traits,
        ability: previousDay.start.ability,
      }
    : undefined;
  const today = session.learnerAtStart
    ? {
        label: learner.day > 1 ? "Start of today" : "Start of session",
        traits: session.learnerAtStart.traits,
        ability: session.learnerAtStart.ability,
      }
    : undefined;
  return { yesterday, today };
}

function TraitRow({ trait, now, before }: { trait: Trait; now: number; before?: number }) {
  const meta = TRAIT_META[trait];
  const delta = before === undefined ? 0 : now - before;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-medium text-ink">{meta.label}</span>
        <span className="tabular text-[12.5px] text-muted">
          {Math.round(now * 100)}
          {Math.abs(delta) >= 0.01 && (
            <span className={cn("ml-1.5", delta > 0 ? "text-good" : "text-ink-2")}>
              {delta > 0 ? "+" : "−"}
              {Math.round(Math.abs(delta) * 100)}
            </span>
          )}
        </span>
      </div>
      <div
        className="relative mt-2 h-6"
        role="img"
        aria-label={`${meta.label}: ${Math.round(now * 100)} of 100${before !== undefined ? `, was ${Math.round(before * 100)}` : ""}`}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3" />
        {before !== undefined && Math.abs(delta) >= 0.01 && (
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink/25"
            style={{ left: `${Math.min(before, now) * 100}%`, width: `${Math.abs(delta) * 100}%` }}
          />
        )}
        {before !== undefined && (
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-surface"
            style={{ left: `${before * 100}%` }}
          />
        )}
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-surface"
          style={{ left: `${now * 100}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[11.5px] text-muted">
        <span>{meta.low}</span>
        <span>{meta.high}</span>
      </div>
    </li>
  );
}

function ConceptPath({
  learner,
  before,
}: {
  learner: LearnerModel;
  before?: LearnerModel["ability"];
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-[15px] font-medium text-ink">Where you are in the topic</h2>
      <p className="text-[12.5px] text-muted">
        Estimated level on each concept (1–5), learned from answers
      </p>
      <ol className="mt-4 space-y-3">
        {CONCEPT_ORDER.map((c, i) => {
          const theta = learner.ability[c];
          const prev = before?.[c];
          const d = prev === undefined ? 0 : theta - prev;
          return (
            <li key={c} className="grid grid-cols-[20px_1fr_64px] items-center gap-3">
              <span className="font-mono text-[12px] text-muted">{i + 1}</span>
              <div>
                <div className="flex items-baseline justify-between text-[13.5px]">
                  <span
                    className={cn(
                      "text-ink-2",
                      c === learner.goalConcept && "font-medium text-ink",
                    )}
                  >
                    {CONCEPT_META[c].label}
                    {c === learner.goalConcept && (
                      <span className="ml-2 text-[11.5px] text-accent">goal</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-[var(--series-1)]"
                    style={{ width: `${Math.min(100, (theta / 5) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="tabular text-right text-[13px] text-ink">
                {theta.toFixed(1)}
                {Math.abs(d) >= 0.05 && (
                  <span className={cn("ml-1 text-[11.5px]", d > 0 ? "text-good" : "text-muted")}>
                    {d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Modalities({ learner }: { learner: LearnerModel }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-[15px] font-medium text-ink">How explanations land</h2>
      <p className="text-[12.5px] text-muted">
        Starts neutral; moves only with evidence (things you chose, and what worked)
      </p>
      <ul className="mt-4 space-y-2.5">
        {MODALITIES.map((m) => {
          const { a, b } = learner.modality[m];
          const observations = Math.round((a + b - 2) * 10) / 10;
          const rate = a / (a + b);
          return (
            <li key={m} className="grid grid-cols-[120px_1fr_76px] items-center gap-3 text-[13px]">
              <span className="text-ink-2">{MODALITY_META[m].label}</span>
              <span className="relative h-2.5 rounded-full bg-surface-3">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" aria-hidden />
                <span
                  className="block h-full rounded-full bg-[var(--series-1)]"
                  style={{ width: `${rate * 100}%`, opacity: observations > 0 ? 1 : 0.3 }}
                />
              </span>
              <span className="tabular text-right text-muted">
                {observations > 0 ? `${percent(rate)} · ${observations}` : "no data"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Effectiveness({ learner }: { learner: LearnerModel }) {
  const rows = Object.entries(learner.effectiveness)
    .map(([key, rec]) => {
      const [state, kind] = key.split("|") as [EngagementState, InterventionKind];
      return { state, kind, ...rec };
    })
    .sort((a, b) => b.tries - a.tries);
  if (rows.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-[15px] font-medium text-ink">Intervention history</h2>
      <p className="text-[12.5px] text-muted">
        The table the engine consults before every decision: in this state, did this help you?
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 font-normal">When you were</th>
              <th className="py-2 font-normal">Attune tried</th>
              <th className="py-2 text-right font-normal">Brought you back</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.state}|${r.kind}`} className="border-b border-line/60">
                <td className="py-2">
                  <span className="inline-flex items-center gap-2 text-ink">
                    <StateDot state={r.state} /> {STATE_META[r.state].label}
                  </span>
                </td>
                <td className="py-2 text-ink-2">{INTERVENTION_META[r.kind].label}</td>
                <td className="tabular py-2 text-right text-ink">
                  {r.recoveries} of {r.tries}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Privacy({
  learner,
  updateLearner,
  forgetEverything,
}: {
  learner: LearnerModel;
  updateLearner: (fn: (l: LearnerModel) => LearnerModel) => void;
  forgetEverything: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const exportData = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), learner }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attune-${learner.displayName.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows: { what: string; value: React.ReactNode; source: string; why: string }[] = [
    {
      what: "Name",
      value: learner.displayName,
      source: "You told me",
      why: "To talk to you like a person",
    },
    {
      what: "Interests",
      value: learner.interests.length ? (
        <span className="flex flex-wrap gap-1.5">
          {learner.interests.map((i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12.5px]"
            >
              {i}
              <button
                type="button"
                aria-label={`Remove ${i}`}
                onClick={() =>
                  updateLearner((l) => ({ ...l, interests: l.interests.filter((x) => x !== i) }))
                }
              >
                <X className="size-3 text-muted hover:text-ink" />
              </button>
            </span>
          ))}
        </span>
      ) : (
        "None"
      ),
      source: "Keywords from your check-in",
      why: "To frame problems in things you care about",
    },
    {
      what: "Today's energy & time",
      value: `${learner.context.energy}/5 · ${learner.context.timeBudgetMin} min`,
      source: "You told me",
      why: "To size activities, and to know when to suggest stopping",
    },
    {
      what: "Level on each concept",
      value: "5 estimates",
      source: "Learned from your answers",
      why: "To keep difficulty in your stretch zone",
    },
    {
      what: "What has helped you",
      value: `${Object.keys(learner.effectiveness).length} records`,
      source: "Learned from outcomes",
      why: "To choose what's likely to bring you back",
    },
    {
      what: "Device",
      value: learner.context.sharedDevice ? "Shared: cleared when this tab closes" : "Personal",
      source: "You told me",
      why: "So the next person can't see your data",
    },
  ];

  const toggles: { key: keyof LearnerModel["consent"]; label: string; hint: string }[] = [
    {
      key: "learnFromBehaviour",
      label: "Learn from how I work",
      hint: "Off: Attune adapts only to what you tell it, not to answers or timing.",
    },
    {
      key: "useAiGateway",
      label: "Allow AI rewrites",
      hint: "Sends library text and interest keywords only. Never your name or words.",
    },
    {
      key: "shareWithMentor",
      label: "Share a summary with my mentor",
      hint: "Aggregates only: recovery rate and topics. Never answers, moods or reflections.",
    },
  ];

  return (
    <section id="privacy" className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-[15px] font-medium text-ink">What Attune knows about you, and why</h2>
      <p className="text-[12.5px] text-muted">
        Everything here lives on this device. You can correct it, export it, or delete it.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 font-normal">What</th>
              <th className="py-2 font-normal">Value</th>
              <th className="py-2 font-normal">Where it came from</th>
              <th className="py-2 font-normal">Why it&apos;s used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.what} className="border-b border-line/60 align-top">
                <td className="py-2.5 pr-3 text-ink">{r.what}</td>
                <td className="py-2.5 pr-3 text-ink-2">{r.value}</td>
                <td className="py-2.5 pr-3 text-muted">{r.source}</td>
                <td className="py-2.5 text-muted">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-xl bg-surface-2 p-4 text-[13px] text-ink-2">
        <p className="font-medium text-ink">Deliberately not kept</p>
        <p className="mt-1">
          What you type in the check-in (reduced to keywords on this device) · your reflection notes
          (never synced) · any psychological label (states describe the session, not you) ·
          location, contacts, or anything from other apps.
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {toggles.map((t) => (
          <label
            key={t.key}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3"
          >
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--accent)]"
              checked={learner.consent[t.key]}
              onChange={(e) =>
                updateLearner((l) => ({
                  ...l,
                  consent: { ...l.consent, [t.key]: e.target.checked },
                }))
              }
            />
            <span>
              <span className="text-[14px] text-ink">{t.label}</span>
              <span className="block text-[12px] text-muted">{t.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={exportData}>
          <Download className="size-3.5" /> Export my data
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowRaw((s) => !s)}>
          {showRaw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{" "}
          {showRaw ? "Hide" : "Show"} the raw model
        </Button>
        {confirm ? (
          <span className="flex items-center gap-2 text-[13px] text-ink">
            Delete everything on this device?
            <Button size="sm" variant="primary" onClick={forgetEverything}>
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3.5" /> Forget everything
          </Button>
        )}
      </div>
      {showRaw && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-[11.5px] text-ink-2">
          {JSON.stringify(learner, null, 2)}
        </pre>
      )}
    </section>
  );
}
