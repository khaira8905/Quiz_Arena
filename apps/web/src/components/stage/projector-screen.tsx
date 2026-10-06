"use client";

import type { ProjectorView } from "@quizarena/shared/game";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/brand/logo";
import { JoinPanel, PlayerCounter, Roster } from "@/components/game/lobby";
import { Leaderboard } from "@/components/game/leaderboard";
import { StageQuestion } from "@/components/game/stage-question";
import { StartSequence } from "@/components/game/start-sequence";
import { cn } from "@/lib/cn";
import { PodiumCeremony } from "./podium-ceremony";
import { EASE } from "@/lib/motion";
import { Procession } from "@/components/ambient/procession";
import { pad2 } from "@/lib/format";
import { Curtain } from "./curtain";

const QUESTION_PHASES: ProjectorView["phase"][] = [
  "QUESTION_READING",
  "QUESTION_ACTIVE",
  "QUESTION_LOCKED",
  "ANSWER_DISTRIBUTION",
  "ANSWER_REVEAL",
];

/**
 * The stage: everything the audience sees on the projector, and nothing else — no
 * controls, connection details or host-only data. It renders the server's audience-safe
 * ProjectorView, and the projector window, the host's live preview and the admin's arena
 * preview all render this same component, so what the host previews is what the room sees.
 */
export function ProjectorScreen({
  view,
  sound,
  preview = false,
}: {
  view: ProjectorView;
  sound: boolean;
  /** The host's or editor's copy: never plays audio. */
  preview?: boolean;
}) {
  const { eventName, logoUrl, projectorLayout } = view.settings.appearance;
  const inQuestion = QUESTION_PHASES.includes(view.phase);
  // MINIMAL drops the top strip while a question is on screen: nothing but the question.
  const showStrip = !(projectorLayout === "MINIMAL" && inQuestion);
  // Scene changes the curtain announces: each new question, the standings, the finale.
  const scene = inQuestion ? `q-${view.question?.id}` : view.phase;
  const sceneTitle = inQuestion
    ? view.question
      ? `Question ${pad2(view.question.index + 1)}`
      : null
    : view.phase === "LEADERBOARD"
      ? "Standings"
      : view.phase === "FINISHED"
        ? "Final results"
        : null;
  return (
    <>
      {/* ------------------------------------------------------------ top strip */}
      {showStrip && (
        <header className="flex h-[7vh] min-h-12 shrink-0 items-center justify-between gap-[2vw] border-b border-line px-[3vw]">
          <div className="flex min-w-0 items-center gap-[1.5vw]">
            <Logo
              size="sm"
              className="[&_svg]:h-[3vh] [&_svg]:w-[3vh] [&_span]:text-[clamp(0.9rem,1.4vw,2.5rem)]"
            />
            <span className="h-[2.5vh] w-px bg-line-strong" />
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- organiser-supplied logo URL
              <img
                src={logoUrl}
                alt=""
                className="h-[3.6vh] max-h-14 w-auto max-w-[12vw] shrink-0 object-contain"
              />
            )}
            <span className="truncate text-[clamp(0.85rem,1.2vw,2.25rem)] font-medium text-fg-2">
              {eventName && <span className="font-semibold text-fg">{eventName} · </span>}
              {view.quizTitle}
            </span>
          </div>
          <div className="flex items-center gap-[2vw]">
            {view.phase !== "LOBBY" && (
              <span className="flex items-baseline gap-[0.6vw]">
                <span className="label text-[clamp(0.75rem,0.85vw,1.6rem)] text-fg-3">Join</span>
                <span className="numeric text-[clamp(1rem,1.6vw,3rem)] font-extrabold text-accent">
                  {view.code}
                </span>
              </span>
            )}
            <span className="flex items-baseline gap-[0.6vw]">
              <span className="numeric text-[clamp(1rem,1.6vw,3rem)] font-extrabold">
                {view.playerCount}
              </span>
              <span className="label text-[clamp(0.75rem,0.85vw,1.6rem)] text-fg-3">
                {view.playerCount === 1 ? "Player" : "Players"}
              </span>
            </span>
          </div>
        </header>
      )}

      {/* ------------------------------------------------------------ stage */}
      <main
        className={cn("relative min-h-0 flex-1 px-[3vw]", showStrip ? "py-[3.5vh]" : "py-[4.5vh]")}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={inQuestion ? "question" : view.phase}
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Stage view={view} sound={sound} preview={preview} />
          </motion.div>
        </AnimatePresence>
      </main>
      <Curtain scene={scene} title={sceneTitle} />
    </>
  );
}

function Stage({
  view,
  sound,
  preview,
}: {
  view: ProjectorView;
  sound: boolean;
  preview: boolean;
}) {
  switch (view.phase) {
    case "LOBBY":
      return <StageLobby view={view} />;
    case "COUNTDOWN":
      return (
        <StartSequence
          endsAt={view.countdownEndsAt ?? 0}
          playerCount={view.playerCount}
          sound={sound}
        />
      );
    case "QUESTION_READING":
    case "QUESTION_ACTIVE":
    case "QUESTION_LOCKED":
    case "ANSWER_DISTRIBUTION":
    case "ANSWER_REVEAL":
      return view.question ? (
        <StageQuestion
          question={view.question}
          phase={view.phase}
          timer={view.timer}
          answeredCount={view.answeredCount}
          playerCount={view.playerCount}
          distribution={view.distribution}
          correctOptionIds={view.correctOptionIds}
          showStats={view.settings.showAnswerStats}
          showCorrect={view.settings.showCorrectAnswers}
          explanation={view.explanation}
          media={view.media}
          mediaAudio={!preview}
          readingEndsAt={view.readingEndsAt}
          serverTime={view.serverTime}
          sound={sound}
        />
      ) : null;
    case "LEADERBOARD":
      return (
        <div className="mx-auto flex h-full max-w-[75vw] flex-col overflow-hidden">
          <div className="mb-[3vh] flex items-end justify-between">
            <h1 className="font-display text-[clamp(2rem,4vw,8rem)] font-bold leading-none tracking-[-0.04em]">
              Leaderboard
            </h1>
            {view.question && (
              <span className="label text-[clamp(0.75rem,1vw,2rem)] text-fg-3">
                After question {view.question.index + 1} of {view.question.total}
              </span>
            )}
          </div>
          <Leaderboard entries={view.leaderboard ?? []} />
        </div>
      );
    case "FINISHED":
      return view.results ? (
        <PodiumCeremony
          results={view.results}
          quizTitle={view.quizTitle}
          step={view.podiumStep ?? "COMPLETE"}
          sound={sound}
        />
      ) : null;
  }
}

function StageLobby({ view }: { view: ProjectorView }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex h-full flex-col">
      <div className="stage-drift grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-[4vw]">
        <h1 className="sr-only">
          {view.quizTitle}: join with game PIN {view.code}
        </h1>
        <div className="flex min-h-0 flex-col">
          <motion.p
            initial={reduced ? false : { opacity: 0, y: "-2vh" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE.emphasis }}
            aria-hidden
            className="font-display text-[clamp(2rem,4.2vw,9rem)] font-bold leading-[0.92] tracking-[-0.045em]"
          >
            Join the
            <br />
            <span className="text-accent">arena</span>
          </motion.p>
          <div className="min-h-0 flex-1">
            <JoinPanel code={view.code} coverImageUrl={view.coverImageUrl} />
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-[3vh] border-l border-line pl-[4vw]">
          <div className="flex items-end justify-between">
            <PlayerCounter count={view.playerCount} />
            {view.playerCount === 0 && (
              <span className="label animate-pulse text-[clamp(0.75rem,1vw,2rem)] text-fg-3">
                Waiting for players
              </span>
            )}
          </div>
          <div className="tick-rule" />
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <Roster players={view.lobbyPlayers} total={view.playerCount} />
          </div>
        </div>
      </div>
      {/* A competitor walks onto the floor for each player who joins. */}
      <Procession players={view.lobbyPlayers} className="mt-[1vh] h-[12vh] shrink-0" />
    </div>
  );
}
