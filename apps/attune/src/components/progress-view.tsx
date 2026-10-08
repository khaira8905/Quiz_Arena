"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CloudOff, Database, HardDrive, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { CONCEPT_META, CONTROL_META, type ControlAction } from "@attune/engine";
import { useAuth } from "@/lib/auth";
import { fetchProgress } from "@/lib/cloud";
import { useConnectivity } from "@/lib/connectivity";
import {
  progressFromCloud,
  progressFromEvents,
  type ProgressView as Progress,
} from "@/lib/progress";
import { useAttune } from "@/lib/store";
import { ModelStoryStrip } from "./model-story";
import { Badge, Button, Card, Eyebrow, Meter, Notice, percent, Skeleton } from "./ui";

const TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
  ]);
}

type Load =
  | { state: "loading" }
  | { state: "ready"; progress: Progress }
  | { state: "error"; message: string };

function feedbackLabel(kind: string, value: string): string {
  if (kind === "control") return CONTROL_META[value as ControlAction]?.label ?? value;
  if (kind === "mood") return `Felt ${value}`;
  if (kind === "reflection") return "Rated an activity";
  if (kind === "choice") return `Chose ${value}`;
  return value;
}

export function ProgressView() {
  const { status, user, supabase } = useAuth();
  const { mode } = useConnectivity();
  const { session, scenarioId, pending, hydrated } = useAttune();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const ownSession = session && !scenarioId ? session : null;

  const refresh = useCallback(async () => {
    if (status !== "signed-in" || !supabase || !user) return;
    setLoad({ state: "loading" });
    try {
      const cloud = await withTimeout(fetchProgress(supabase, user.id));
      setLoad({ state: "ready", progress: progressFromCloud(cloud) });
    } catch (e) {
      setLoad({
        state: "error",
        message:
          (e as Error).message === "timeout"
            ? "The server took too long to answer."
            : "Couldn't load your progress from your account.",
      });
    }
  }, [status, supabase, user]);

  useEffect(() => {
    if (mode === "offline") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching account data on mount
    void refresh();
  }, [refresh, mode]);

  if (status === "loading" || !hydrated) return <ProgressSkeleton />;
  if (status !== "signed-in") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <Notice
          tone="info"
          title="Log in to see progress across sessions"
          action={
            <Link
              href="/login?next=/progress"
              className="font-medium text-accent underline underline-offset-4"
            >
              Log in
            </Link>
          }
        >
          Without an account, today&apos;s session summary is on the Session page.
        </Notice>
      </div>
    );
  }

  // Offline (or the account can't be reached): show what this device knows, labelled as such.
  const device = ownSession
    ? progressFromEvents([{ events: ownSession.events, day: ownSession.learner.day }])
    : null;
  const offline = mode === "offline";
  const shown = offline ? device : load.state === "ready" ? load.progress : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Progress</Eyebrow>
          <h1 className="mt-2 type-h1 text-ink">What you&apos;ve actually done</h1>
          <p className="mt-2 max-w-2xl type-body text-ink-2">
            Every number here is counted from recorded events: no estimates, no simulated data.
          </p>
        </div>
        {shown && (
          <Badge tone={shown.source === "account" ? "accent" : "neutral"}>
            {shown.source === "account" ? (
              <>
                <Database className="size-3.5" aria-hidden /> From your account
              </>
            ) : (
              <>
                <HardDrive className="size-3.5" aria-hidden /> This device only
              </>
            )}
          </Badge>
        )}
      </div>

      {offline && (
        <Notice tone="warn" className="mt-6" title="You're offline">
          Showing today&apos;s session from this device. Your full history loads when you&apos;re
          back online.
        </Notice>
      )}
      {!offline && pending > 0 && (
        <Notice tone="info" className="mt-6">
          <CloudOff className="mr-1 inline size-3.5" aria-hidden />
          {pending} recent events are still syncing; they&apos;ll appear here shortly.
        </Notice>
      )}

      {ownSession && <ModelStoryStrip session={ownSession} className="mt-8" />}

      {!offline && load.state === "loading" && <ProgressSkeleton inline />}
      {!offline && load.state === "error" && (
        <Notice
          tone="danger"
          className="mt-8"
          title={load.message}
          action={
            <Button size="sm" onClick={() => void refresh()}>
              <RotateCcw className="size-3.5" /> Try again
            </Button>
          }
        >
          Your progress is safe; this is only a problem loading it.
        </Notice>
      )}

      {shown &&
      shown.attempts === 0 &&
      shown.activitiesCompleted === 0 &&
      shown.feedback.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="type-h3 text-ink">Nothing recorded yet</p>
          <p className="mt-1 type-body text-ink-2">Complete an activity and it shows up here.</p>
          <Link
            href={ownSession ? "/session" : "/begin"}
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-ink px-4 text-sm font-medium text-inverse"
          >
            {ownSession ? "Back to your session" : "Start a session"}
          </Link>
        </Card>
      ) : shown ? (
        <ProgressBody p={shown} />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  i,
}: {
  label: string;
  value: string;
  detail?: string;
  i: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * i, duration: 0.3 }}
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <p className="type-small text-muted">{label}</p>
      <p className="mt-1 type-h2 type-data text-ink">{value}</p>
      {detail && <p className="mt-0.5 type-small text-muted">{detail}</p>}
    </motion.div>
  );
}

function ProgressBody({ p }: { p: Progress }) {
  const stats = [
    {
      label: "Sessions",
      value: String(p.sessions),
      detail: `${p.activeDays} active ${p.activeDays === 1 ? "day" : "days"}`,
    },
    { label: "Activities completed", value: String(p.activitiesCompleted) },
    {
      label: "Right first time",
      value: percent(p.firstTryRate),
      detail: `${p.firstTries} first ${p.firstTries === 1 ? "try" : "tries"}`,
    },
    {
      label: "Retries that worked",
      value: percent(p.retrySuccessRate),
      detail: `${p.retries} ${p.retries === 1 ? "retry" : "retries"}`,
    },
    { label: "Hints used", value: String(p.hintsUsed) },
    {
      label: "Time in activities",
      value: p.timeSpentMs > 0 && p.minutesSpent === 0 ? "<1 min" : `${p.minutesSpent} min`,
    },
  ];
  const concepts = p.concepts.filter((c) => c.attempts > 0);
  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s, i) => (
          <Stat key={s.label} {...s} i={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="type-h3 text-ink">By concept</h2>
          <p className="type-small text-muted">Share of first tries that were right</p>
          {concepts.length === 0 ? (
            <p className="mt-3 type-body text-ink-2">No answers yet.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {concepts.map((c) => (
                <li key={c.conceptId}>
                  <div className="flex items-baseline justify-between gap-3 type-small">
                    <span className="text-ink">{CONCEPT_META[c.conceptId].label}</span>
                    <span className="type-data text-muted">
                      {percent(c.firstTryRate)} · {c.attempts} answers
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Meter
                      value={c.firstTryRate ?? 0}
                      label={`${CONCEPT_META[c.conceptId].label}: right first time`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="type-h3 text-ink">What you told Attune</h2>
          <p className="type-small text-muted">Controls, moods and choices, most frequent first</p>
          {p.feedback.length === 0 ? (
            <p className="mt-3 type-body text-ink-2">
              Nothing yet. &ldquo;I&apos;m bored&rdquo;, &ldquo;Too easy&rdquo; and the rest all
              count.
            </p>
          ) : (
            <table className="mt-3 w-full type-small">
              <thead className="sr-only">
                <tr>
                  <th>Signal</th>
                  <th>Times</th>
                </tr>
              </thead>
              <tbody>
                {p.feedback.slice(0, 8).map((f) => (
                  <tr
                    key={`${f.kind}|${f.value}`}
                    className="border-b border-line/60 last:border-0"
                  >
                    <td className="py-2 text-ink">{feedbackLabel(f.kind, f.value)}</td>
                    <td className="py-2 text-right type-data text-muted">×{f.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function ProgressSkeleton({ inline = false }: { inline?: boolean }) {
  return (
    <div
      className={inline ? "mt-8 space-y-4" : "mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6"}
      aria-busy="true"
      aria-label="Loading progress"
    >
      {!inline && <Skeleton className="h-10 w-72" />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}
