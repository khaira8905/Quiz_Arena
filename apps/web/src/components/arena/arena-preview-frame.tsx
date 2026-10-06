"use client";

import { useEffect, useState } from "react";
import { ProjectorScreen } from "@/components/stage/projector-screen";
import { type Game, PlayerGame } from "@/components/play/player-game";
import {
  type ArenaPreviewState,
  type PreviewSurface,
  PREVIEW_MESSAGE,
  PREVIEW_READY,
  previewProjectorView,
  previewPlayerView,
} from "@/lib/arena-preview";
import { ArenaThemeProvider } from "./arena-theme";

/** A player handle that goes nowhere: the preview phone renders, it never plays. */
const PREVIEW_GAME: Game = {
  step: { kind: "playing" },
  view: null,
  connection: "online",
  pendingAnswer: null,
  submitCode: async () => {},
  join: async () => {},
  answer: async () => ({ ok: false, code: "QUESTION_NOT_ACTIVE", message: "Preview" }),
  leave: () => {},
  reset: () => {},
  retryConnection: () => {},
};

/** The question timer loops so the preview always shows a live countdown. */
const TIMER_LOOP_MS = 14_000;

/**
 * Inside the preview iframe: waits for the editor to post an arena state, then renders the
 * real projector or phone screen for it.
 */
export function ArenaPreviewFrame({ surface }: { surface: PreviewSurface }) {
  const [state, setState] = useState<ArenaPreviewState | null>(null);
  const [cycle, setCycle] = useState(() => Date.now());

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // From the editor that embeds this frame, or that opened it in its own window.
      const from = window.parent !== window ? window.parent : window.opener;
      if (e.origin !== window.location.origin || !from || e.source !== from) return;
      const data = e.data as { type?: string; state?: ArenaPreviewState } | null;
      if (data?.type === PREVIEW_MESSAGE && data.state) setState(data.state);
    };
    window.addEventListener("message", onMessage);
    const host = window.parent !== window ? window.parent : window.opener;
    host?.postMessage({ type: PREVIEW_READY }, window.location.origin);
    const loop = setInterval(() => setCycle(Date.now()), TIMER_LOOP_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(loop);
    };
  }, []);

  if (!state) return <div className="h-dvh bg-bg" />;

  if (surface === "phone") {
    return (
      <ArenaThemeProvider appearance={state.appearance} page>
        <PlayerGame game={PREVIEW_GAME} view={previewPlayerView(state, cycle)} />
      </ArenaThemeProvider>
    );
  }
  return (
    <ArenaThemeProvider appearance={state.appearance} page>
      <div className="arena-floor relative flex h-dvh flex-col overflow-hidden">
        <ProjectorScreen view={previewProjectorView(state, cycle)} sound={false} preview />
      </div>
    </ArenaThemeProvider>
  );
}
