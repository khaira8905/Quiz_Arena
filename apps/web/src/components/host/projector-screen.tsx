"use client";

import type { HostView } from "@quizarena/shared/game";
import { AnimatePresence, motion } from "motion/react";
import { Logo } from "@/components/brand/logo";
import { JoinPanel, PlayerCounter, Roster } from "@/components/game/lobby";
import { Leaderboard } from "@/components/game/leaderboard";
import { StageQuestion } from "@/components/game/stage-question";
import { StartSequence } from "@/components/game/start-sequence";
import { WinnerScreen } from "@/components/game/winner-screen";
import { cn } from "@/lib/cn";

/**
 * Everything the audience sees on the projector: the top strip and the stage. Pure
 * presentation over a HostView, so the live arena and the admin's arena preview render
 * exactly the same thing.
 */
export function ProjectorScreen({
  view,
  connection,
  sound,
}: {
  view: HostView;
  connection: string;
  sound: boolean;
}) {
  const { eventName, logoUrl } = view.settings.appearance;
  return (
    <>
      {/* ------------------------------------------------------------ top strip */}
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
              <span className="label text-[clamp(0.6rem,0.85vw,1.6rem)] text-fg-3">Join</span>
              <span className="numeric text-[clamp(1rem,1.6vw,3rem)] font-extrabold text-accent">
                {view.code}
              </span>
            </span>
          )}
          <span className="flex items-baseline gap-[0.6vw]">
            <span className="numeric text-[clamp(1rem,1.6vw,3rem)] font-extrabold">
              {view.connectedCount}
            </span>
            <span className="label text-[clamp(0.6rem,0.85vw,1.6rem)] text-fg-3">Online</span>
          </span>
          <ConnectionDot state={connection} />
        </div>
      </header>

      {/* ------------------------------------------------------------ stage */}
      <main className="relative min-h-0 flex-1 px-[3vw] py-[3.5vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={
              view.phase === "QUESTION_ACTIVE" ||
              view.phase === "QUESTION_LOCKED" ||
              view.phase === "ANSWER_REVEAL"
                ? "question"
                : view.phase
            }
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Stage view={view} sound={sound} />
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}

function Stage({ view, sound }: { view: HostView; sound: boolean }) {
  switch (view.phase) {
    case "LOBBY":
      return (
        <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-[4vw]">
          <JoinPanel code={view.code} />
          <div className="flex min-h-0 flex-col gap-[3vh] border-l border-line pl-[4vw]">
            <div className="flex items-end justify-between">
              <PlayerCounter count={view.playerCount} />
              {view.playerCount === 0 && (
                <span className="label animate-pulse text-[clamp(0.7rem,1vw,2rem)] text-fg-3">
                  Waiting for players
                </span>
              )}
            </div>
            <div className="tick-rule" />
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <Roster players={view.players} />
            </div>
          </div>
        </div>
      );
    case "COUNTDOWN":
      return (
        <StartSequence
          endsAt={view.countdownEndsAt ?? 0}
          playerCount={view.playerCount}
          sound={sound}
        />
      );
    case "QUESTION_ACTIVE":
    case "QUESTION_LOCKED":
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
          explanation={view.settings.showCorrectAnswers ? view.explanation : null}
          sound={sound}
        />
      ) : null;
    case "LEADERBOARD":
      return (
        <div className="mx-auto flex h-full max-w-[75vw] flex-col overflow-hidden">
          <div className="mb-[3vh] flex items-end justify-between">
            <h1 className="font-display text-[clamp(2rem,4vw,8rem)] font-extrabold uppercase leading-none tracking-[-0.04em]">
              Leaderboard
            </h1>
            {view.question && (
              <span className="label text-[clamp(0.75rem,1vw,2rem)] text-fg-3">
                After question {view.question.index + 1} of {view.question.total}
              </span>
            )}
          </div>
          <Leaderboard entries={view.leaderboard} />
        </div>
      );
    case "FINISHED":
      return view.results ? (
        <WinnerScreen results={view.results} quizTitle={view.quizTitle} sound={sound} />
      ) : null;
  }
}

function ConnectionDot({ state }: { state: string }) {
  const label =
    state === "live"
      ? "Connected"
      : state === "reconnecting"
        ? "Reconnecting"
        : state === "failed"
          ? "Disconnected"
          : "Connecting";
  return (
    <span className="flex items-center gap-[0.5vw]" title={label}>
      <span
        className={cn(
          "h-[1vh] min-h-2 w-[1vh] min-w-2 rounded-full",
          state === "live"
            ? "animate-live-pulse bg-accent"
            : state === "reconnecting"
              ? "bg-warning"
              : "bg-danger",
        )}
      />
      <span className="label hidden text-[clamp(0.6rem,0.85vw,1.6rem)] text-fg-3 xl:inline">
        {label}
      </span>
    </span>
  );
}
