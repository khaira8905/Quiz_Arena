"use client";

import { ERROR_COPY } from "@quizarena/shared/errors";
import type { HostCommand, HostView } from "@quizarena/shared/game";
import {
  Expand,
  Minimize,
  Pause,
  Play,
  SkipForward,
  Square,
  Trophy,
  Volume2,
  VolumeX,
  Lock,
  PanelBottomClose,
  PanelBottomOpen,
  SlidersHorizontal,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ArenaThemeProvider } from "@/components/arena/arena-theme";
import { ProjectorScreen } from "./projector-screen";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Kbd, Spinner, StatusScreen } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { COMMAND_LABELS, primaryCommand, useHostGame } from "@/lib/game/use-host-game";
import { useKeepServerAwake } from "@/lib/use-keep-server-awake";
import { play, setSoundEnabled, soundPreference, unlockAudio } from "@/lib/sound";

const PHASE_LABEL: Record<HostView["phase"], string> = {
  LOBBY: "Lobby",
  COUNTDOWN: "Starting",
  QUESTION_READING: "Reading",
  QUESTION_ACTIVE: "Question live",
  QUESTION_LOCKED: "Answers locked",
  ANSWER_DISTRIBUTION: "Showing answers",
  ANSWER_REVEAL: "Answer revealed",
  LEADERBOARD: "Leaderboard",
  FINISHED: "Finished",
};

/**
 * Projector / big-screen experience. The stage is everything the audience sees; host
 * controls live in a dock BELOW the stage (never on top of it) and disappear entirely in
 * projector mode, where the keyboard drives the game.
 */
export function HostArena({ code }: { code: string }) {
  const { view, connection, error, command } = useHostGame(code);
  useKeepServerAwake();
  const [dock, setDock] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const soundOn = useSyncExternalStore(
    soundPreference.subscribe,
    soundPreference.get,
    soundPreference.getServer,
  );
  const [confirm, setConfirm] = useState<HostCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const lastPhase = useRef<string | null>(null);

  const sound = soundOn && !!view?.settings.soundEnabled;

  const run = useCallback(
    async (cmd: HostCommand) => {
      unlockAudio();
      setBusy(true);
      const res = await command(cmd);
      setBusy(false);
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
      if (cmd === "END" || cmd === "SKIP") setConfirm(cmd);
      else void run(cmd);
    },
    [view, run],
  );

  // Phase-change sound cues.
  useEffect(() => {
    if (!view || view.phase === lastPhase.current) return;
    lastPhase.current = view.phase;
    if (!sound) return;
    if (view.phase === "ANSWER_REVEAL") play("reveal");
    if (view.phase === "LEADERBOARD") play("leaderboard");
  }, [view, sound]);

  // Fullscreen state follows the browser (Esc exits fullscreen).
  useEffect(() => {
    const onChange = () => {
      const fs = !!document.fullscreenElement;
      setFullscreen(fs);
      setDock(!fs);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    unlockAudio();
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement.requestFullscreen().then(
        () =>
          toast("Projector mode", {
            description: "Space: continue · P: pause · L: leaderboard · H: controls · Esc: exit",
          }),
        () => toast.error("Fullscreen isn't available in this browser"),
      );
  }, []);

  // Keyboard control — the primary way to drive the game in projector mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=dialog]"))
        return;
      const key = e.key.toLowerCase();
      // Space/Enter on a focused button or link activate that control, not the primary
      // command (tabbing to "Pause" and pressing Enter must pause).
      const onControl =
        e.target instanceof HTMLElement && !!e.target.closest("button, a, [role=button]");
      if ((key === " " || key === "enter") && onControl) return;
      if (key === " " || key === "enter" || key === "arrowright") {
        e.preventDefault();
        const primary = primaryCommand(view);
        if (primary && !busy) request(primary);
      } else if (key === "p") request(view?.paused ? "RESUME" : "PAUSE");
      else if (key === "l") request("LEADERBOARD");
      else if (key === "s") request("SKIP");
      else if (key === "e") request("END");
      else if (key === "f") toggleFullscreen();
      else if (key === "h") setDock((d) => !d);
      else if (key === "m") {
        setSoundEnabled(!soundOn);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, busy, confirm, request, toggleFullscreen, soundOn]);

  if (error && !view) {
    const copy = {
      UNAUTHORIZED: {
        title: "Sign in to host",
        description: "The projector view is only available to the game's host.",
        href: `/admin/login?next=${encodeURIComponent(`/host/${code}`)}`,
        cta: "Sign in",
      },
      FORBIDDEN: {
        title: "This isn't your game",
        description: "Only the organiser who opened this arena can project it.",
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
      title: "Can't open the arena",
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

  if (!view) {
    return (
      <div className="arena-floor grid h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8" />
          <p className="label text-fg-3">Opening game {code}</p>
        </div>
      </div>
    );
  }

  const primary = primaryCommand(view);

  return (
    <ArenaThemeProvider appearance={view.settings.appearance} page>
      <div className="arena-floor flex h-dvh flex-col overflow-hidden" onClick={unlockAudio}>
        <ProjectorScreen view={view} connection={connection} sound={sound} />

        {/* ------------------------------------------------------------ control dock (outside the stage) */}
        <AnimatePresence initial={false}>
          {dock && (
            <motion.footer
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 overflow-hidden border-t border-line-strong bg-surface"
              aria-label="Host controls"
              // A mouse click shouldn't leave focus on a dock button, or the projector's
              // Space key would press it again instead of continuing the game.
              onPointerUp={(e) => {
                if (e.pointerType === "mouse" && document.activeElement instanceof HTMLElement)
                  document.activeElement.blur();
              }}
            >
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="mr-2 min-w-36">
                  <div className="label text-fg-3">Phase</div>
                  <div className="mt-1 flex items-center gap-2 text-body font-semibold">
                    {view.paused ? (
                      <span className="text-warning">Paused</span>
                    ) : (
                      PHASE_LABEL[view.phase]
                    )}
                  </div>
                </div>
                {primary && (
                  <Button
                    size="lg"
                    onClick={() => request(primary)}
                    loading={busy}
                    notch
                    className="min-w-48"
                  >
                    {COMMAND_LABELS[primary]} <Kbd onAccent>Space</Kbd>
                  </Button>
                )}
                {!primary && view.phase === "LOBBY" && (
                  <Button size="lg" notch disabled className="min-w-48">
                    Start game · waiting for players
                  </Button>
                )}
                <DockButton
                  cmd={view.paused ? "RESUME" : "PAUSE"}
                  view={view}
                  onRun={request}
                  icon={view.paused ? Play : Pause}
                  k="P"
                />
                <DockButton cmd="LOCK" view={view} onRun={request} icon={Lock} />
                <DockButton cmd="SKIP" view={view} onRun={request} icon={SkipForward} k="S" />
                <DockButton cmd="LEADERBOARD" view={view} onRun={request} icon={Trophy} k="L" />
                <DockButton cmd="END" view={view} onRun={request} icon={Square} k="E" danger />
                <div className="ml-auto flex items-center gap-1">
                  <Link
                    href={`/admin/sessions/${view.sessionId}`}
                    target="_blank"
                    className={buttonClasses({
                      variant: "ghost",
                      size: "sm",
                      className: "hidden md:block",
                    })}
                  >
                    <SlidersHorizontal className="h-4 w-4" /> Control panel
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={soundOn ? "Mute sound (M)" : "Unmute sound (M)"}
                    title={
                      !view.settings.soundEnabled ? "Sound is off in quiz settings" : undefined
                    }
                    onClick={() => {
                      unlockAudio();
                      setSoundEnabled(!soundOn);
                    }}
                  >
                    {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Hide controls (H)"
                    onClick={() => setDock(false)}
                  >
                    <PanelBottomClose className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={toggleFullscreen}>
                    {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}{" "}
                    {fullscreen ? "Exit projector" : "Projector mode"}
                  </Button>
                </div>
              </div>
            </motion.footer>
          )}
        </AnimatePresence>
        {!dock && !fullscreen && (
          <button
            onClick={() => setDock(true)}
            aria-label="Show controls (H)"
            className="fixed bottom-3 right-3 rounded-sm border border-line bg-surface/80 p-2 text-fg-3 hover:text-fg"
          >
            <PanelBottomOpen className="h-4 w-4" />
          </button>
        )}

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

        <AnimatePresence>
          {connection === "reconnecting" && (
            <motion.div
              initial={{ y: -40 }}
              animate={{ y: 0 }}
              exit={{ y: -40 }}
              className="fixed left-1/2 top-3 z-40 -translate-x-1/2 border border-warning/50 bg-elevated px-4 py-2 text-body-sm text-warning"
            >
              Connection lost — reconnecting…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ArenaThemeProvider>
  );
}

function DockButton({
  cmd,
  view,
  onRun,
  icon: Icon,
  k,
  danger,
}: {
  cmd: HostCommand;
  view: HostView;
  onRun: (c: HostCommand) => void;
  icon: React.ComponentType<{ className?: string }>;
  k?: string;
  danger?: boolean;
}) {
  // Only show what this phase allows: a lobby or finished screen has no "Pause" to offer.
  // The primary command already has its own big button, so it isn't repeated here.
  if (!view.availableCommands.includes(cmd) || cmd === primaryCommand(view)) return null;
  return (
    <Button
      variant="secondary"
      size="md"
      onClick={() => onRun(cmd)}
      className={cn(danger && "hover:border-danger hover:text-danger")}
    >
      <Icon className="h-4 w-4" /> {COMMAND_LABELS[cmd]} {k && <Kbd>{k}</Kbd>}
    </Button>
  );
}
