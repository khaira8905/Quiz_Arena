"use client";

import type { ARENA_THEMES } from "@quizarena/shared/appearance";
import { MOTION_LEVELS } from "@quizarena/shared/appearance";
import type { HostView, PodiumStep, TimerState } from "@quizarena/shared/game";
import type { LiveSettingsPatch } from "@quizarena/shared/schemas";
import { Check, ImageIcon, UserX } from "lucide-react";
import { motion } from "motion/react";
import { memo, useMemo } from "react";
import { answerStyle } from "@/components/game/answer-style";
import { QuestionImage } from "@/components/media/question-image";
import { Select } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { formatNumber, pad2 } from "@/lib/format";
import { PHASE_LABELS } from "@/lib/game/use-host-game";
import { useCountdown } from "@/lib/use-countdown";

/* ------------------------------------------------------------------ status */

/** One glance: where the game is, how long is left, who's in, who's still answering. */
export function StatusPanel({ view }: { view: HostView }) {
  const waiting = useMemo(
    () => view.players.filter((p) => p.connected && !p.answered).length,
    [view.players],
  );
  const answering =
    view.phase === "QUESTION_ACTIVE" ||
    view.phase === "QUESTION_LOCKED" ||
    view.phase === "QUESTION_READING";
  return (
    <div className="grid grid-cols-2 border border-line bg-surface sm:grid-cols-5">
      <Cell label="State">
        <span className={cn("text-body-lg font-bold", view.paused && "text-warning")}>
          {view.paused ? "Paused" : PHASE_LABELS[view.phase]}
        </span>
      </Cell>
      <Cell label={view.phase === "QUESTION_READING" ? "Reading" : "Time left"}>
        <TimeLeft view={view} />
      </Cell>
      <Cell label="Players">
        <span className="numeric text-h3 font-extrabold">{view.connectedCount}</span>
        {view.playerCount !== view.connectedCount && (
          <span className="ml-1.5 text-body-sm text-fg-3">
            +{view.playerCount - view.connectedCount} offline
          </span>
        )}
      </Cell>
      <Cell label="Answered">
        <span className="numeric text-h3 font-extrabold">
          {answering || view.phase === "ANSWER_DISTRIBUTION" || view.phase === "ANSWER_REVEAL"
            ? view.answeredCount
            : "—"}
        </span>
      </Cell>
      <Cell label="Waiting" last>
        <span
          className={cn(
            "numeric text-h3 font-extrabold",
            view.phase === "QUESTION_ACTIVE" && waiting > 0 && "text-accent",
          )}
        >
          {view.phase === "QUESTION_ACTIVE" ? waiting : "—"}
        </span>
      </Cell>
    </div>
  );
}

function Cell({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn("min-w-0 border-line px-4 py-3", !last && "border-b sm:border-b-0 sm:border-r")}
    >
      <div className="label text-fg-3">{label}</div>
      <div className="mt-1 flex min-h-8 items-baseline">{children}</div>
    </div>
  );
}

function TimeLeft({ view }: { view: HostView }) {
  const reading = view.phase === "QUESTION_READING";
  const readingTimer: TimerState | null =
    reading && view.readingEndsAt
      ? {
          startedAt: view.serverTime,
          deadline: view.readingEndsAt,
          durationMs: Math.max(1, view.readingEndsAt - view.serverTime),
          paused: false,
          remainingMs: Math.max(0, view.readingEndsAt - view.serverTime),
        }
      : null;
  const timer = reading ? readingTimer : view.timer;
  const active = reading ? !!readingTimer : view.phase === "QUESTION_ACTIVE";
  const { remaining } = useCountdown(timer, active, { fine: true });
  if (reading && !readingTimer)
    return <span className="text-body font-semibold text-fg-2">Host starts</span>;
  if (!timer || !(reading || view.phase === "QUESTION_ACTIVE"))
    return <span className="numeric text-h3 font-extrabold text-fg-3">—</span>;
  const s = remaining / 1000;
  return (
    <span
      className={cn(
        "numeric text-h3 font-extrabold tabular-nums",
        !reading && s <= 5 && "text-danger",
        view.paused && "text-warning",
      )}
    >
      {s.toFixed(1)}
      <span className="ml-0.5 text-body text-fg-3">s</span>
    </span>
  );
}

/* ------------------------------------------------------------------ question */

/** What the host sees and the room doesn't: the answer key and the live split. */
export function QuestionPanel({ view }: { view: HostView }) {
  const q = view.question;
  if (!q) return null;
  const total = Object.values(view.distribution).reduce((a, b) => a + b, 0);
  const correct = new Set(view.correctOptionIds ?? []);
  return (
    <section className="border border-line bg-surface" aria-label="Current question">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="label text-fg-3">
          Question <span className="text-accent">{pad2(q.index + 1)}</span> / {pad2(q.total)} ·{" "}
          {formatNumber(q.points)} pts ·{" "}
          {Math.round((view.timer?.durationMs ?? q.durationMs) / 1000)}s
        </span>
        <span className="label text-fg-3">Answer key · visible only to you</span>
      </div>
      <div className="flex gap-5 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-h2 text-balance break-words">{q.text}</h2>
          <ul className="mt-5 flex flex-col gap-2">
            {q.options.map((o, i) => {
              const count = view.distribution[o.id] ?? 0;
              const share = total ? count / total : 0;
              const isCorrect = correct.has(o.id);
              const s = answerStyle(i);
              return (
                <li
                  key={o.id}
                  className={cn(
                    "relative flex items-center gap-3 overflow-hidden border p-2.5",
                    isCorrect ? "border-success/60" : "border-line",
                  )}
                >
                  <motion.span
                    className={cn("absolute inset-y-0 left-0 opacity-20", s.bg)}
                    initial={false}
                    animate={{ width: `${share * 100}%` }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <span
                    className={cn(
                      "relative grid h-8 w-8 shrink-0 place-items-center font-display font-extrabold",
                      s.bg,
                      s.ink,
                    )}
                  >
                    {s.letter}
                  </span>
                  <span className="relative min-w-0 flex-1 text-body font-medium break-words">
                    {o.text}
                  </span>
                  {isCorrect && (
                    <span className="label relative flex items-center gap-1 text-success">
                      <Check className="h-3.5 w-3.5" /> Correct
                    </span>
                  )}
                  <span className="numeric relative w-12 text-right text-body-lg font-bold">
                    {count}
                  </span>
                  <span className="numeric relative w-11 text-right text-body-sm text-fg-3">
                    {Math.round(share * 100)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        {q.imageUrl ? (
          <QuestionImage
            src={q.imageUrl}
            fit={q.imageFit}
            position={q.imagePosition}
            placeholder={q.imagePlaceholder}
            rounded={false}
            className="hidden aspect-[2/1] w-48 shrink-0 self-start rounded-sm md:block"
          />
        ) : (
          <div className="hidden aspect-[2/1] w-48 shrink-0 self-start place-items-center rounded-sm border border-dashed border-line text-fg-3 md:grid">
            <ImageIcon className="h-5 w-5" aria-label="No image" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ lobby settings */

const TIMER_CHOICES = [
  { value: 0, label: "Per question" },
  { value: 10, label: "10s" },
  { value: 20, label: "20s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
];
const LIMITS = [20, 50, 100, 200, 300, 500, 1000];
const THEME_NAMES: Record<(typeof ARENA_THEMES)[number], string> = {
  BLUE: "Blue",
  WHITE: "White",
  BLACK: "Black",
};
const MOTION_NAMES: Record<(typeof MOTION_LEVELS)[number], string> = {
  SUBTLE: "Subtle",
  NORMAL: "Normal",
  HIGH: "High",
};

/**
 * Last-minute changes for this session only, before the start: the saved quiz is not
 * touched. Everything here applies to the stage and phones immediately.
 */
export function LobbySettings({
  view,
  onChange,
}: {
  view: HostView;
  onChange: (patch: LiveSettingsPatch) => void;
}) {
  const s = view.settings;
  return (
    <section className="border border-line bg-surface p-5" aria-label="Session settings">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label text-fg-2">Before you start</h2>
        <span className="text-caption text-fg-3">This session only — your quiz is unchanged</span>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Row label="Arena theme">
          <Segmented
            label="Arena theme"
            value={s.appearance.theme}
            options={(["BLUE", "WHITE", "BLACK"] as const).map((t) => ({
              value: t,
              label: THEME_NAMES[t],
            }))}
            onChange={(theme) => onChange({ theme })}
          />
        </Row>
        <Row label="Animation">
          <Segmented
            label="Animation"
            value={s.appearance.motion}
            options={MOTION_LEVELS.map((m) => ({ value: m, label: MOTION_NAMES[m] }))}
            onChange={(motion) => onChange({ motion })}
          />
        </Row>
        <Row label="Answer timer">
          <Segmented
            label="Answer timer"
            value={view.timerOverrideSec ?? 0}
            options={TIMER_CHOICES}
            onChange={(v) => onChange({ timerOverrideSec: v === 0 ? null : v })}
          />
        </Row>
        <Row label="Reading time">
          <Segmented
            label="Reading time"
            value={s.readingMode === "TIMED" ? s.readingTimeSec : s.readingMode}
            options={[
              { value: "OFF" as const, label: "None" },
              { value: 3, label: "3s" },
              { value: 5, label: "5s" },
              { value: 10, label: "10s" },
              { value: "MANUAL" as const, label: "Host starts" },
            ]}
            onChange={(v) =>
              onChange(
                typeof v === "number"
                  ? { readingMode: "TIMED", readingTimeSec: v }
                  : { readingMode: v },
              )
            }
          />
        </Row>
        <Switch
          label="Show what everyone chose"
          description="Answer bars after each question"
          checked={s.showAnswerStats}
          onChange={(showAnswerStats) => onChange({ showAnswerStats })}
        />
        <Switch
          label="Reveal the correct answer"
          checked={s.showCorrectAnswers}
          onChange={(showCorrectAnswers) => onChange({ showCorrectAnswers })}
        />
        <Switch
          label="Leaderboard between questions"
          checked={s.showLeaderboard}
          onChange={(showLeaderboard) => onChange({ showLeaderboard })}
        />
        <Switch
          label="Sound on the projector"
          checked={s.soundEnabled}
          onChange={(soundEnabled) => onChange({ soundEnabled })}
        />
        <Switch
          label="Late join"
          description="Players can join after the start"
          checked={s.allowLateJoin}
          onChange={(allowLateJoin) => onChange({ allowLateJoin })}
        />
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="participant-limit" className="text-body font-medium">
            Player limit
          </label>
          <Select
            id="participant-limit"
            className="w-28"
            value={String(s.participantLimit)}
            onChange={(e) => onChange({ participantLimit: Number(e.target.value) })}
          >
            {[...new Set([...LIMITS, s.participantLimit])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </Select>
        </div>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-body-sm font-medium text-fg-2">{label}</div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ podium */

const PODIUM_LABELS: Record<Exclude<PodiumStep, "COMPLETE">, string> = {
  THIRD: "Reveal 3rd",
  SECOND: "Reveal 2nd",
  FIRST: "Reveal 1st",
  BOARD: "Show full leaderboard",
};

/** The podium steps this room has (a two-player game has no third place). */
export function podiumOrder(players: number): PodiumStep[] {
  return [
    "COMPLETE",
    ...(players >= 3 ? (["THIRD"] as const) : []),
    ...(players >= 2 ? (["SECOND"] as const) : []),
    ...(players >= 1 ? (["FIRST"] as const) : []),
    "BOARD",
  ];
}

export function nextPodiumStep(view: HostView): PodiumStep | null {
  const order = podiumOrder(view.results?.standings.length ?? view.playerCount);
  const i = order.indexOf(view.podiumStep ?? "COMPLETE");
  return order[i + 1] ?? null;
}

export function podiumLabel(step: PodiumStep | null) {
  return step && step !== "COMPLETE" ? PODIUM_LABELS[step] : "Ceremony complete";
}

/** The finale, one beat per press: the host decides when each place is revealed. */
export function PodiumControls({
  view,
  busy,
  onNext,
}: {
  view: HostView;
  busy: boolean;
  onNext: () => void;
}) {
  const order = podiumOrder(view.results?.standings.length ?? view.playerCount).filter(
    (s): s is Exclude<PodiumStep, "COMPLETE"> => s !== "COMPLETE",
  );
  const next = nextPodiumStep(view);
  const done = new Set(
    podiumOrder(view.results?.standings.length ?? view.playerCount).slice(
      0,
      podiumOrder(view.results?.standings.length ?? view.playerCount).indexOf(
        view.podiumStep ?? "COMPLETE",
      ) + 1,
    ),
  );
  return (
    <section className="border border-line bg-surface p-5" aria-label="Podium">
      <h2 className="label text-fg-2">Podium ceremony</h2>
      <p className="mt-1 text-body-sm text-fg-3">
        Each press reveals the next place on the projector. Take your time.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {order.map((step) => {
          const isNext = step === next;
          const isDone = done.has(step);
          return (
            <button
              key={step}
              type="button"
              disabled={!isNext || busy}
              onClick={onNext}
              className={cn(
                "notch-sm flex h-14 items-center justify-center gap-2 px-3 text-button font-semibold transition-colors",
                isNext
                  ? "bg-accent text-accent-ink hover:bg-accent-strong"
                  : isDone
                    ? "border border-success/40 bg-success-soft text-success"
                    : "border border-line bg-sunken text-fg-3",
              )}
            >
              {isDone && <Check className="h-4 w-4" aria-hidden />}
              {PODIUM_LABELS[step]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ players */

export const PlayerList = memo(function PlayerList({
  players,
  phase,
  onKick,
}: {
  players: HostView["players"];
  phase: HostView["phase"];
  onKick: (p: { id: string; nickname: string }) => void;
}) {
  const answering = phase === "QUESTION_ACTIVE" || phase === "QUESTION_LOCKED";
  if (!players.length)
    return <p className="px-1 py-6 text-center text-body-sm text-fg-3">No players yet.</p>;
  return (
    <ul className="grid max-h-[22rem] grid-cols-1 gap-1 overflow-y-auto pr-1" aria-label="Players">
      {players.map((p) => (
        <li key={p.id} className="group flex items-center gap-2 border border-line px-3 py-1.5">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              !p.connected ? "bg-fg-3" : answering && p.answered ? "bg-success" : "bg-accent",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{p.nickname}</span>
          <span className="label text-fg-3">
            {!p.connected ? "Offline" : answering ? (p.answered ? "Answered" : "Thinking") : ""}
          </span>
          <span className="numeric w-14 text-right text-body-sm text-fg-2">
            {formatNumber(p.score)}
          </span>
          <button
            type="button"
            aria-label={`Remove ${p.nickname}`}
            onClick={() => onKick(p)}
            className="-my-1 grid h-7 w-7 place-items-center text-fg-3 opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
          >
            <UserX className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
});
