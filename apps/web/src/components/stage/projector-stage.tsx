"use client";

import { ERROR_COPY } from "@quizarena/shared/errors";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArenaThemeProvider } from "@/components/arena/arena-theme";
import { preloadImage } from "@/components/media/question-image";
import { buttonClasses } from "@/components/ui/button-classes";
import { Kbd, Spinner, StatusScreen } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { stagePrimaryCommand, useProjectorGame } from "@/lib/game/use-projector-game";
import { play, soundPreference, unlockAudio } from "@/lib/sound";
import { useKeepServerAwake } from "@/lib/use-keep-server-awake";
import { ProjectorScreen } from "./projector-screen";

const IDLE_MS = 2500;

/**
 * The projector window (/host/[code]/projector). Shows the stage and nothing else. The
 * control room drives the game; for single-screen setups the keyboard works here too
 * (Space continues, F toggles fullscreen). With `preview`, it's the muted, input-free copy
 * the control room embeds, so the host sees exactly what the room sees.
 */
export function ProjectorStage({ code, preview }: { code: string; preview: boolean }) {
  const { view, connection, error, command } = useProjectorGame(code);
  useKeepServerAwake();
  const soundOn = useSyncExternalStore(
    soundPreference.subscribe,
    soundPreference.get,
    soundPreference.getServer,
  );
  const sound = !preview && soundOn && !!view?.settings.soundEnabled;
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const lastPhase = useRef<string | null>(null);
  const busy = useRef(false);

  // The next question's image loads in the background while the room looks at the reveal.
  useEffect(() => preloadImage(view?.nextImageUrl), [view?.nextImageUrl]);

  // Phase-change sound cues (the countdown ticks itself).
  useEffect(() => {
    if (!view || view.phase === lastPhase.current) return;
    const first = lastPhase.current === null;
    lastPhase.current = view.phase;
    if (!sound || first) return;
    if (view.phase === "ANSWER_REVEAL") play("reveal");
    if (view.phase === "LEADERBOARD") play("leaderboard");
  }, [view, sound]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    unlockAudio();
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // The pointer hides when it stops moving: a projector shouldn't show a cursor.
  useEffect(() => {
    if (preview) return;
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "f") toggleFullscreen();
      else if (key === " " || key === "enter" || key === "arrowright") {
        e.preventDefault();
        unlockAudio();
        const next = stagePrimaryCommand(view);
        if (!next || busy.current) return;
        busy.current = true;
        void command(next).finally(() => (busy.current = false));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, view, command, toggleFullscreen]);

  if (error && !view) {
    const copy = {
      UNAUTHORIZED: {
        title: "Sign in to project",
        description: "The projector screen opens from the host's own browser.",
        href: `/admin/login?next=${encodeURIComponent(`/host/${code}/projector`)}`,
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
      title: ERROR_COPY[error.code]?.title ?? "Can't open the stage",
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
          preview ? undefined : (
            <Link href={copy.href} className={buttonClasses()}>
              {copy.cta}
            </Link>
          )
        }
      />
    );
  }

  if (!view) {
    return (
      <div className="arena-floor grid h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8" />
          <p className="label text-fg-3">Opening the stage</p>
        </div>
      </div>
    );
  }

  return (
    <ArenaThemeProvider appearance={view.settings.appearance} page>
      <div
        className={cn(
          "arena-floor flex h-dvh flex-col overflow-hidden",
          idle && !preview && "cursor-none",
        )}
        onClick={preview ? undefined : unlockAudio}
      >
        <ProjectorScreen view={view} sound={sound} />

        {!preview && (
          <AnimatePresence>
            {!fullscreen && !idle && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="fixed bottom-4 right-4 z-40 flex items-center gap-3 border border-line bg-elevated/95 px-3 py-2 text-body-sm text-fg-2"
              >
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className={buttonClasses({ size: "sm" })}
                >
                  Go fullscreen <Kbd onAccent>F</Kbd>
                </button>
                <span className="hidden sm:inline">
                  <Kbd>Space</Kbd> continues the game
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {connection === "reconnecting" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="status"
              className="fixed left-1/2 top-3 z-40 h-1 w-24 -translate-x-1/2 animate-pulse rounded-full bg-warning"
              aria-label="Reconnecting"
            />
          )}
        </AnimatePresence>
      </div>
    </ArenaThemeProvider>
  );
}
