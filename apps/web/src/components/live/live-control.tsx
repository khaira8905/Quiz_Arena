"use client";

import type { SessionSummaryDto } from "@quizarena/shared/dto";
import { ERROR_COPY } from "@quizarena/shared/errors";
import { HOST_COMMANDS, type HostCommand, type HostView } from "@quizarena/shared/game";
import { Check, Copy, ExternalLink, UserX } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { answerStyle } from "@/components/game/answer-style";
import { Countdown } from "@/components/game/countdown";
import { Leaderboard } from "@/components/game/leaderboard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { joinUrl, pad2 } from "@/lib/format";
import { COMMAND_LABELS, primaryCommand, useHostGame } from "@/lib/game/use-host-game";

const PHASES: Record<HostView["phase"], { label: string; tone: "accent" | "neutral" | "warning" | "success" }> = {
  LOBBY: { label: "Lobby open", tone: "accent" },
  COUNTDOWN: { label: "Starting", tone: "accent" },
  QUESTION_ACTIVE: { label: "Question live", tone: "accent" },
  QUESTION_LOCKED: { label: "Answers locked", tone: "warning" },
  ANSWER_REVEAL: { label: "Answer revealed", tone: "success" },
  LEADERBOARD: { label: "Leaderboard", tone: "neutral" },
  FINISHED: { label: "Finished", tone: "neutral" },
};

const DANGEROUS: HostCommand[] = ["SKIP", "END"];

/**
 * Admin-side live dashboard: run the game from a laptop while the projector shows the stage.
 * Shows what the audience can't — the answer key, live distribution, who's connected.
 */
export function LiveControl({ session, onFinished }: { session: SessionSummaryDto; onFinished: () => void }) {
  const { view, connection, error, command, kick } = useHostGame(session.code);
  const [confirm, setConfirm] = useState<HostCommand | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [busy, setBusy] = useState<HostCommand | null>(null);

  useEffect(() => {
    if (view?.phase === "FINISHED") onFinished();
  }, [view?.phase, onFinished]);

  const run = async (cmd: HostCommand) => {
    setBusy(cmd);
    const res = await command(cmd);
    setBusy(null);
    if (!res.ok) toast.error(ERROR_COPY[res.error.code]?.title ?? "Action failed", { description: res.error.message });
  };
  const request = (cmd: HostCommand) => (DANGEROUS.includes(cmd) ? setConfirm(cmd) : void run(cmd));

  if (error && !view) {
    return <p className="border border-danger/40 bg-danger-soft p-5">{error.message}</p>;
  }
  if (!view) {
    return (
      <div>
        <Skeleton className="h-12 w-72" />
        <div className="mt-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const phase = PHASES[view.phase];
  const primary = primaryCommand(view);
  const q = view.question;
  const totalVotes = Object.values(view.distribution).reduce((a, b) => a + b, 0);

  return (
    <div>
      {/* ------------------------------------------------------------ header */}
      <header className="flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={phase.tone} dot={phase.tone === "accent"}>
              {view.paused ? "Paused" : phase.label}
            </Badge>
            <span className={cn("label", connection === "live" ? "text-fg-3" : "text-warning")}>{connection === "live" ? "Connected" : "Reconnecting…"}</span>
          </div>
          <h1 className="mt-3 font-display text-h1">{view.quizTitle}</h1>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <span className="flex items-baseline gap-2">
              <span className="label text-fg-3">Code</span>
              <span className="numeric text-[2rem] font-extrabold leading-none text-accent">{view.code}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="label text-fg-3">Players</span>
              <span className="numeric text-[2rem] font-extrabold leading-none">{view.connectedCount}</span>
              {view.playerCount !== view.connectedCount && <span className="text-body-sm text-fg-3">({view.playerCount - view.connectedCount} offline)</span>}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(joinUrl(view.code)).then(() => toast.success("Join link copied"));
            }}
          >
            <Copy className="h-4 w-4" /> Copy join link
          </Button>
          <Button notch onClick={() => window.open(`/host/${view.code}`, `quizarena-${view.code}`)}>
            <ExternalLink className="h-4 w-4" /> Open projector view
          </Button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ left: what's happening */}
        <section className="border border-line bg-surface">
          {q && view.phase !== "FINISHED" ? (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
                <span className="label text-fg-3">
                  Question <span className="text-accent">{pad2(q.index + 1)}</span> / {pad2(q.total)} · {q.points} pts
                </span>
                <span className="numeric text-body font-bold">
                  {view.answeredCount}/{view.connectedCount} <span className="label text-fg-3">answered</span>
                </span>
              </div>
              <div className="flex gap-6 p-5">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-h2">{q.text}</h2>
                  <ul className="mt-5 flex flex-col gap-2">
                    {q.options.map((o, i) => {
                      const count = view.distribution[o.id] ?? 0;
                      const share = totalVotes ? count / totalVotes : 0;
                      const isCorrect = view.correctOptionIds?.includes(o.id);
                      const s = answerStyle(i);
                      return (
                        <li key={o.id} className={cn("relative flex items-center gap-3 overflow-hidden border p-2.5", isCorrect ? "border-success/60" : "border-line")}>
                          <motion.span className={cn("absolute inset-y-0 left-0 opacity-15", s.bg)} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.4 }} />
                          <span className={cn("relative grid h-8 w-8 shrink-0 place-items-center font-display font-extrabold text-answer-ink", s.bg)}>{s.letter}</span>
                          <span className="relative min-w-0 flex-1 text-body font-medium">{o.text}</span>
                          {isCorrect && (
                            <span className="label relative flex items-center gap-1 text-success">
                              <Check className="h-3.5 w-3.5" /> Answer
                            </span>
                          )}
                          <span className="numeric relative w-14 text-right text-body-lg font-bold">{count}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <Countdown timer={view.timer} active={view.phase === "QUESTION_ACTIVE"} variant="panel" />
                </div>
              </div>
            </>
          ) : view.phase === "FINISHED" ? (
            <div className="p-8 text-center">
              <p className="label text-fg-3">Game finished</p>
              <h2 className="mt-3 font-display text-h1">{view.results?.standings[0]?.nickname ?? "No winner"} wins</h2>
              <p className="mt-2 text-fg-2">Loading the full results…</p>
            </div>
          ) : (
            <div className="p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="label text-fg-2">{view.phase === "COUNTDOWN" ? "Starting…" : "In the lobby"}</h2>
                <span className="text-body-sm text-fg-3">{view.questionCount} questions ready</span>
              </div>
              {view.players.length === 0 ? (
                <p className="mt-6 border border-dashed border-line-strong p-8 text-center text-fg-3">
                  Waiting for players. Share the code <span className="numeric font-bold text-accent">{view.code}</span> or open the projector view.
                </p>
              ) : (
                <PlayerTable players={view.players} onKick={(p) => setKickTarget(p)} />
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ right: controls */}
        <aside className="flex flex-col gap-6">
          <div className="border border-line bg-surface p-5">
            <h2 className="label mb-4 text-fg-2">Controls</h2>
            {primary && (
              <Button size="lg" notch className="mb-3 w-full" loading={busy === primary} onClick={() => request(primary)}>
                {COMMAND_LABELS[primary]}
              </Button>
            )}
            <div className="grid grid-cols-3 gap-2">
              {HOST_COMMANDS.map((cmd) => {
                const enabled = view.availableCommands.includes(cmd);
                if (cmd === "PAUSE" && view.paused) return null;
                if (cmd === "RESUME" && !view.paused) return null;
                return (
                  <Button
                    key={cmd}
                    variant={cmd === "END" ? "outline" : "secondary"}
                    size="sm"
                    disabled={!enabled || busy !== null}
                    loading={busy === cmd}
                    onClick={() => request(cmd)}
                    className={cn("h-10 uppercase tracking-[0.06em]", cmd === "END" && "text-danger hover:border-danger")}
                  >
                    {cmd === "LEADERBOARD" ? "Board" : cmd.toLowerCase()}
                  </Button>
                );
              })}
            </div>
            <p className="mt-3 text-caption text-fg-3">Skip and End ask for confirmation. The projector also responds to Space, P, L, S and E.</p>
          </div>

          {view.leaderboard.length > 0 && view.phase !== "LOBBY" && (
            <div className="border border-line bg-surface p-5">
              <h2 className="label mb-4 text-fg-2">Leaderboard</h2>
              <Leaderboard entries={view.leaderboard} size="panel" />
            </div>
          )}

          {view.phase !== "LOBBY" && view.players.length > 0 && (
            <details className="border border-line bg-surface">
              <summary className="label cursor-pointer px-5 py-4 text-fg-2">Players ({view.players.length})</summary>
              <div className="px-5 pb-5">
                <PlayerTable players={view.players} onKick={(p) => setKickTarget(p)} />
              </div>
            </details>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "END" ? "End the game now?" : "Skip this question?"}
        description={confirm === "END" ? "Final results are calculated from the questions played so far. This can't be undone." : "Nobody scores on a skipped question."}
        confirmLabel={confirm === "END" ? "End game" : "Skip"}
        onConfirm={() => (confirm ? run(confirm) : undefined)}
      />
      <ConfirmDialog
        open={kickTarget !== null}
        onOpenChange={(o) => !o && setKickTarget(null)}
        title={`Remove ${kickTarget?.nickname}?`}
        description="They'll be disconnected and their nickname freed. They can rejoin if the game allows it."
        confirmLabel="Remove player"
        onConfirm={async () => {
          if (!kickTarget) return;
          const res = await kick(kickTarget.id);
          if (res && !res.ok) toast.error(res.error.message);
        }}
      />
    </div>
  );
}

function PlayerTable({ players, onKick }: { players: HostView["players"]; onKick: (p: { id: string; nickname: string }) => void }) {
  return (
    <ul className="mt-4 grid max-h-96 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2" aria-label="Players">
      {players.map((p) => (
        <li key={p.id} className="group flex items-center gap-2 border border-line px-3 py-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", p.connected ? "bg-success" : "bg-fg-3")} aria-label={p.connected ? "online" : "offline"} />
          <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{p.nickname}</span>
          <span className="numeric text-body-sm text-fg-3">{p.score}</span>
          <button
            aria-label={`Remove ${p.nickname}`}
            onClick={() => onKick(p)}
            className="text-fg-3 opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
          >
            <UserX className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
