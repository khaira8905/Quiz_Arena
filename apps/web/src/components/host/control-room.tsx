"use client";

import { ERROR_COPY } from "@quizarena/shared/errors";
import type { HostCommand, HostView } from "@quizarena/shared/game";
import type { LiveSettingsPatch } from "@quizarena/shared/schemas";
import {
  Copy,
  Expand,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Square,
  Timer,
  Trophy,
  BarChart3,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Leaderboard } from "@/components/game/leaderboard";
import {
  ProjectorPreview,
  type ProjectorPreviewHandle,
} from "@/components/stage/projector-preview";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Kbd, Spinner, StatusScreen } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/cn";
import { displayHost, joinUrl, pad2 } from "@/lib/format";
import {
  COMMAND_LABELS,
  PHASE_LABELS,
  primaryCommand,
  useHostGame,
} from "@/lib/game/use-host-game";
import { useKeepServerAwake } from "@/lib/use-keep-server-awake";
import {
  LobbySettings,
  nextPodiumStep,
  PlayerList,
  PodiumControls,
  podiumLabel,
  QuestionPanel,
  StatusPanel,
} from "./control-panels";
import { EASE } from "@/lib/motion";

const CONFIRM: HostCommand[] = ["SKIP", "END"];
const PRIMARY_SETTLE_MS = 900;

/** The main button's wording, where the generic command name would mislead. */
function primaryLabel(view: HostView, cmd: HostCommand) {
  if (cmd === "NEXT" && view.questionIndex + 1 >= view.questionCount) return "Finish quiz";
  return COMMAND_LABELS[cmd];
}

/** Every connected player has answered (the server locks the question early then). */
function everyoneAnswered(view: HostView) {
  return view.connectedCount > 0 && view.answeredCount >= view.connectedCount;
}

/**
 * The host laptop: the control room. Everything the audience must not see lives here —
 * the answer key, live answer split, player status, controls — next to a live preview of
 * the real projector stage. The stage itself runs in its own window (/host/[code]/projector).
 */
export function HostControlRoom({ code }: { code: string }) {
  const { view, connection, error, command, kick, updateSettings } = useHostGame(code);
  useKeepServerAwake();
  const preview = useRef<ProjectorPreviewHandle>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [confirm, setConfirm] = useState<HostCommand | null>(null);
  const [busy, setBusy] = useState<HostCommand | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: string; nickname: string } | null>(null);

  const lastOwnCommandAt = useRef(0);
  const run = useCallback(
    async (cmd: HostCommand, amount?: number) => {
      lastOwnCommandAt.current = Date.now();
      setBusy(cmd);
      const res = await command(cmd, amount);
      lastOwnCommandAt.current = Date.now();
      setBusy(null);
      if (!res.ok)
        toast.error(ERROR_COPY[res.error.code]?.title ?? "Action failed", {
          description: res.error.message,
        });
    },
    [command],
  );

  const request = useCallback(
    (cmd: HostCommand) => {
      if (!view?.availableCommands.includes(cmd)) return;
      if (CONFIRM.includes(cmd)) setConfirm(cmd);
      else void run(cmd);
    },
    [view, run],
  );

  // The main button sometimes changes by itself (the reading countdown starts the timer,
  // everyone answering locks the question). A press that lands just as that happens would
  // trigger a step the host never saw, so presses are ignored for a moment after a change
  // this screen didn't cause.
  const currentPrimary = view ? primaryCommand(view) : null;
  const previousPrimary = useRef<HostCommand | null>(null);
  const autoChangedAt = useRef(0);
  useEffect(() => {
    const before = previousPrimary.current;
    previousPrimary.current = currentPrimary;
    const ownStep = Date.now() - lastOwnCommandAt.current < 2000;
    if (before && currentPrimary && before !== currentPrimary && !ownStep)
      autoChangedAt.current = Date.now();
  }, [currentPrimary]);
  const pressPrimary = useCallback(
    (cmd: HostCommand) => {
      if (Date.now() - autoChangedAt.current < PRIMARY_SETTLE_MS) return;
      request(cmd);
    },
    [request],
  );

  const changeSettings = useCallback(
    async (patch: LiveSettingsPatch) => {
      const res = await updateSettings(patch);
      if (!res.ok) toast.error(res.error.message);
    },
    [updateSettings],
  );

  const openProjector = useCallback(() => {
    const url = `/host/${encodeURIComponent(code)}/projector`;
    const win = window.open(url, `qa-projector-${code}`);
    if (!win)
      toast("Your browser blocked the new window", {
        description: "Allow pop-ups for this site, or open the projector link manually.",
        action: { label: "Copy link", onClick: () => void copy(`${location.origin}${url}`) },
      });
  }, [code]);

  // Keyboard: the laptop drives the game without hunting for buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || kickTarget || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, select, [role=dialog]")
      )
        return;
      const key = e.key.toLowerCase();
      const onControl =
        e.target instanceof HTMLElement && !!e.target.closest("button, a, [role=button]");
      if ((key === " " || key === "enter") && onControl) return;
      if (key === " " || key === "enter" || key === "arrowright") {
        e.preventDefault();
        const primary = primaryCommand(view);
        if (primary && !busy) pressPrimary(primary);
      } else if (key === "p") request(view?.paused ? "RESUME" : "PAUSE");
      else if (key === "l") request("LEADERBOARD");
      else if (key === "s") request("SKIP");
      else if (key === "e") request("END");
      else if (key === "o") openProjector();
      else if (key === "f") preview.current?.fullscreen();
      else if (key === "v") setShowPreview((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, busy, confirm, kickTarget, request, pressPrimary, openProjector]);

  if (error && !view) return <AttachError code={code} error={error} />;
  if (!view) {
    return (
      <div className="grid h-dvh place-items-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8" />
          <p className="label text-fg-3">Opening the control room for {code}</p>
        </div>
      </div>
    );
  }

  const primary = primaryCommand(view);
  const q = view.question;
  const lobby = view.phase === "LOBBY";
  const finished = view.phase === "FINISHED";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      {/* ------------------------------------------------------------ top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
          <Link href="/admin" aria-label="Dashboard">
            <Logo size="sm" />
          </Link>
          <span className="h-5 w-px bg-line-strong" />
          <Badge tone={finished ? "neutral" : "accent"} dot={!finished}>
            {finished ? "Ended" : "Live"}
          </Badge>
          <span className="min-w-0 max-w-[24ch] truncate font-semibold">{view.quizTitle}</span>
          <span className="flex items-baseline gap-2">
            <span className="label text-fg-3">PIN</span>
            <span className="numeric text-h3 font-extrabold text-accent">{view.code}</span>
          </span>
          {q && !lobby && !finished && (
            <span className="label text-fg-3">
              Q <span className="text-fg">{pad2(q.index + 1)}</span> / {pad2(q.total)}
            </span>
          )}
          <span
            className={cn(
              "label flex items-center gap-1.5",
              connection === "live" ? "text-fg-3" : "text-warning",
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connection === "live" ? "bg-success" : "animate-pulse bg-warning",
              )}
            />
            {connection === "live" ? "Connected" : "Reconnecting…"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPreview ? "Hide projector" : "View projector"}
            </Button>
            <Button variant="secondary" size="sm" onClick={openProjector}>
              <ExternalLink className="h-4 w-4" /> Open projector <Kbd>O</Kbd>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowPreview(true);
                requestAnimationFrame(() => preview.current?.fullscreen());
              }}
            >
              <Expand className="h-4 w-4" /> Fullscreen <Kbd>F</Kbd>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
        {/* ------------------------------------------------------------ main */}
        <div className="flex min-w-0 flex-col gap-5">
          <StatusPanel view={view} />

          {/* controls */}
          <section className="border border-line bg-surface p-5" aria-label="Game controls">
            <div className="flex flex-wrap items-center gap-3">
              {finished ? (
                <Button
                  size="xl"
                  notch
                  className="min-w-72"
                  disabled={!primary}
                  loading={busy === "PODIUM_NEXT"}
                  onClick={() => primary && pressPrimary(primary)}
                >
                  {podiumLabel(nextPodiumStep(view))}
                  {primary && <Kbd onAccent>Space</Kbd>}
                </Button>
              ) : primary ? (
                <Button
                  size="xl"
                  notch
                  className="min-w-72"
                  loading={busy === primary}
                  onClick={() => pressPrimary(primary)}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={primary}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="inline-flex items-center gap-3"
                    >
                      {primaryLabel(view, primary)} <ArrowRight className="h-5 w-5" />
                    </motion.span>
                  </AnimatePresence>
                  <Kbd onAccent>Space</Kbd>
                </Button>
              ) : (
                <Button size="xl" notch disabled className="min-w-72">
                  {lobby ? "Start game · waiting for players" : PHASE_LABELS[view.phase]}
                </Button>
              )}
              <p className="text-body-sm text-fg-3">{nextHint(view)}</p>
            </div>

            {!lobby && !finished && (
              <>
                <ControlGroup label="Flow">
                  <Control
                    cmd="OPEN_ANSWERS"
                    view={view}
                    busy={busy}
                    onRun={request}
                    icon={Timer}
                  />
                  <Control cmd="LOCK" view={view} busy={busy} onRun={request} icon={Lock} />
                  <Control
                    cmd="SHOW_STATS"
                    view={view}
                    busy={busy}
                    onRun={request}
                    icon={BarChart3}
                  />
                  <Control
                    cmd="REVEAL"
                    view={view}
                    busy={busy}
                    onRun={request}
                    icon={CheckCircle2}
                  />
                  <Control
                    cmd="LEADERBOARD"
                    view={view}
                    busy={busy}
                    onRun={request}
                    icon={Trophy}
                    k="L"
                  />
                  <Control cmd="NEXT" view={view} busy={busy} onRun={request} icon={ArrowRight} />
                  <Control
                    cmd="SKIP"
                    view={view}
                    busy={busy}
                    onRun={request}
                    icon={SkipForward}
                    k="S"
                  />
                </ControlGroup>
                <ControlGroup label="Timer">
                  <Control
                    cmd={view.paused ? "RESUME" : "PAUSE"}
                    view={view}
                    busy={busy}
                    onRun={request}
                    icon={view.paused ? Play : Pause}
                    k="P"
                  />
                  {[-5, 5, 10].map((n) => (
                    <Button
                      key={n}
                      variant="secondary"
                      size="md"
                      disabled={!view.availableCommands.includes("ADJUST_TIMER") || busy !== null}
                      onClick={() => void run("ADJUST_TIMER", n)}
                      className="numeric min-w-16"
                      aria-label={`${n > 0 ? "Add" : "Remove"} ${Math.abs(n)} seconds`}
                    >
                      {n > 0 ? `+${n}` : `−${-n}`}s
                    </Button>
                  ))}
                </ControlGroup>
              </>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(joinUrl(view.code), "Join link copied")}
              >
                <Copy className="h-4 w-4" /> Copy join link
              </Button>
              {finished ? (
                <Link
                  href={`/admin/sessions/${view.sessionId}`}
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                >
                  <Square className="h-4 w-4" /> End session &amp; view results
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!view.availableCommands.includes("END")}
                  onClick={() => request("END")}
                  className="text-danger hover:border-danger"
                >
                  <Square className="h-4 w-4" /> End game <Kbd>E</Kbd>
                </Button>
              )}
            </div>
          </section>

          {finished && (
            <PodiumControls
              view={view}
              busy={busy !== null}
              onNext={() => request("PODIUM_NEXT")}
            />
          )}

          {lobby ? (
            <>
              <JoinCard view={view} />
              <LobbySettings view={view} onChange={(p) => void changeSettings(p)} />
            </>
          ) : finished ? (
            view.results && (
              <section className="border border-line bg-surface p-5">
                <h2 className="label mb-4 text-fg-2">Final standings</h2>
                <Leaderboard
                  size="panel"
                  entries={view.results.standings
                    .slice(0, 20)
                    .map((s) => ({ ...s, previousRank: null, lastPoints: 0 }))}
                />
              </section>
            )
          ) : (
            <QuestionPanel view={view} onMedia={(cmd) => void run(cmd)} />
          )}
        </div>

        {/* ------------------------------------------------------------ side */}
        <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-20">
          <AnimatePresence initial={false}>
            {showPreview && (
              <motion.section
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE.out }}
                className="overflow-hidden border border-line bg-surface"
                aria-label="Projector preview"
              >
                <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <h2 className="label flex items-center gap-2 text-fg-2">
                    <span className="h-2 w-2 animate-live-pulse rounded-full bg-accent" /> On the
                    projector
                  </h2>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Refresh preview"
                      title="Refresh preview"
                      onClick={() => preview.current?.refresh()}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Fullscreen preview"
                      title="Fullscreen (F)"
                      onClick={() => preview.current?.fullscreen()}
                    >
                      <Expand className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Open projector window"
                      title="Open projector (O)"
                      onClick={openProjector}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <ProjectorPreview ref={preview} code={view.code} />
              </motion.section>
            )}
          </AnimatePresence>

          {!lobby && !finished && view.leaderboard.length > 0 && (
            <section className="border border-line bg-surface p-4">
              <h2 className="label mb-3 text-fg-2">Leaderboard</h2>
              <Leaderboard entries={view.leaderboard.slice(0, 8)} size="panel" />
            </section>
          )}

          <section className="border border-line bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="label text-fg-2">Players</h2>
              <span className="numeric text-body-sm text-fg-3">
                {view.connectedCount}/{view.playerCount} online
              </span>
            </div>
            <PlayerList players={view.players} phase={view.phase} onKick={setKickTarget} />
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "END" ? "End the game now?" : "Skip this question?"}
        description={
          confirm === "END"
            ? "Final results are calculated from the questions played so far. This can't be undone."
            : "Nobody scores on a skipped question. The next question opens immediately."
        }
        confirmLabel={confirm === "END" ? "End game" : "Skip question"}
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

function copy(text: string, done = "Copied") {
  return navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error("Couldn't copy — select and copy it manually"),
  );
}

function nextHint(view: HostView): string {
  switch (view.phase) {
    case "LOBBY":
      return view.playerCount
        ? `${view.playerCount} ${view.playerCount === 1 ? "player" : "players"} ready.`
        : "Share the PIN — the projector shows the QR code.";
    case "QUESTION_READING":
      return view.settings.readingMode === "MANUAL"
        ? "Players are reading. Start the timer when the room is ready."
        : "Players are reading. The timer starts on its own, or start it now.";
    case "QUESTION_ACTIVE":
      return view.settings.readingMode === "TIMED"
        ? "The reading time is over and the timer is running. Answers lock on their own when time runs out or everyone has answered."
        : "Answers are open. They lock on their own when time runs out or everyone has answered.";
    case "QUESTION_LOCKED":
      return everyoneAnswered(view)
        ? "Everyone has answered, so answers locked early. Show the answers, or reveal the correct one."
        : "Time's up. Show the answers, or reveal the correct one.";
    case "ANSWER_DISTRIBUTION":
      return "The room sees what everyone chose. Reveal when ready.";
    case "ANSWER_REVEAL":
      return view.questionIndex + 1 >= view.questionCount
        ? "That was the last question. Finish to start the podium."
        : "Scores are in.";
    case "LEADERBOARD":
      return "Move on when the room is ready.";
    case "FINISHED":
      return "Reveal the podium one place at a time.";
    default:
      return "";
  }
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="label mb-2 text-fg-3">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Control({
  cmd,
  view,
  busy,
  onRun,
  icon: Icon,
  k,
}: {
  cmd: HostCommand;
  view: HostView;
  busy: HostCommand | null;
  onRun: (c: HostCommand) => void;
  icon: React.ComponentType<{ className?: string }>;
  k?: string;
}) {
  // Every control keeps its place (no layout jumps between phases); unavailable ones dim.
  const enabled = view.availableCommands.includes(cmd);
  return (
    <Button
      variant="secondary"
      size="md"
      disabled={!enabled || busy !== null}
      loading={busy === cmd}
      onClick={() => onRun(cmd)}
      className={cn(cmd === primaryCommand(view) && enabled && "border-accent text-accent")}
    >
      <Icon className="h-4 w-4" /> {COMMAND_LABELS[cmd]} {k && <Kbd>{k}</Kbd>}
    </Button>
  );
}

function JoinCard({ view }: { view: HostView }) {
  const url = joinUrl(view.code);
  return (
    <section className="flex flex-wrap items-center gap-x-10 gap-y-4 border border-line bg-surface p-5">
      <div>
        <div className="label text-fg-3">Players join at</div>
        <div className="mt-1 font-display text-h3 font-bold">
          {displayHost(url.replace(/\/play.*/, "/play"))}
        </div>
      </div>
      <div>
        <div className="label text-fg-3">Game PIN</div>
        <div className="numeric mt-1 text-[2.25rem] font-extrabold leading-none text-accent">
          {view.code}
        </div>
      </div>
      <p className="max-w-xs text-body-sm text-fg-3">
        The QR code is on the projector. {view.questionCount} questions are ready.
      </p>
    </section>
  );
}

function AttachError({ code, error }: { code: string; error: { code: string; message: string } }) {
  const copy = {
    UNAUTHORIZED: {
      title: "Sign in to host",
      description: "The control room is only available to the game's host.",
      href: `/admin/login?next=${encodeURIComponent(`/host/${code}`)}`,
      cta: "Sign in",
    },
    FORBIDDEN: {
      title: "This isn't your game",
      description: "Only the organiser who opened this arena can run it.",
      href: "/admin",
      cta: "Go to dashboard",
    },
    INVALID_GAME_CODE: {
      title: "Game not found",
      description: `No live game uses ${code}. It may have ended or the server restarted.`,
      href: "/admin/sessions",
      cta: "View sessions",
    },
  }[error.code as "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_GAME_CODE"] ?? {
    title: "Can't open the control room",
    description: error.message,
    href: "/admin",
    cta: "Back to dashboard",
  };
  return (
    <StatusScreen
      eyebrow={`Game ${code}`}
      title={copy.title}
      description={copy.description}
      tone="danger"
      action={
        <Link href={copy.href} className={buttonClasses()}>
          {copy.cta}
        </Link>
      }
    />
  );
}
