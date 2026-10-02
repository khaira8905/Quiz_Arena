"use client";

import { ERROR_COPY } from "@quizarena/shared/errors";
import type { PlayerView } from "@quizarena/shared/game";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Crown,
  Flame,
  LogOut,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Confetti } from "@/components/game/confetti";
import { CountdownBar } from "@/components/game/countdown";
import { Leaderboard } from "@/components/game/leaderboard";
import { PhoneAnswerButton, type TileState } from "@/components/game/answer-tile";
import { answerStyle } from "@/components/game/answer-style";
import { StartSequence } from "@/components/game/start-sequence";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { ordinal, pad2 } from "@/lib/format";
import type { usePlayerGame } from "@/lib/game/use-player-game";
import { play, setSoundEnabled, soundPreference, unlockAudio } from "@/lib/sound";

export type Game = ReturnType<typeof usePlayerGame>;

/**
 * The phone in a player's hand. One job per screen; the answer grid owns the viewport
 * during a question so a thumb can hit any option without looking.
 */
export function PlayerGame({ game, view }: { game: Game; view: PlayerView }) {
  const soundOn = useSyncExternalStore(
    soundPreference.subscribe,
    soundPreference.get,
    soundPreference.getServer,
  );
  const [leaving, setLeaving] = useState(false);
  const sound = soundOn && view.soundEnabled;

  // Reveal / finish cues.
  const lastPhase = useRef(view.phase);
  useEffect(() => {
    if (view.phase === lastPhase.current) return;
    lastPhase.current = view.phase;
    if (!sound) return;
    if (view.phase === "ANSWER_REVEAL" && view.result)
      play(view.result.correct ? "correct" : "wrong");
    if (view.phase === "FINISHED") play(view.me.rank === 1 ? "winner" : "leaderboard");
  }, [view.phase, view.result, view.me.rank, sound]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg" onClick={unlockAudio}>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-body-lg font-bold leading-tight">
            {view.me.nickname}
          </p>
          <p className="label mt-0.5 text-fg-3">Arena {view.code}</p>
        </div>
        <div className="text-right">
          <AnimatedNumber
            value={view.me.score}
            className="numeric block text-xl font-extrabold leading-none"
          />
          <span className="label text-fg-3">
            {view.me.rank ? `${ordinal(view.me.rank)} of ${view.playerCount}` : "Score"}
          </span>
        </div>
        <button
          aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
          onClick={() => {
            unlockAudio();
            setSoundEnabled(!soundOn);
          }}
          className="grid h-9 w-9 place-items-center text-fg-3 hover:text-fg"
        >
          {sound ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
        </button>
      </header>

      <AnimatePresence>
        {game.connection !== "online" && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="shrink-0 overflow-hidden bg-warning-soft"
            role="status"
          >
            <div className="flex items-center gap-2 px-4 py-2 text-body-sm text-warning">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                {game.connection === "offline"
                  ? "You're offline."
                  : "Reconnecting… your seat and score are saved."}
              </span>
              {game.connection === "offline" && (
                <button className="font-semibold underline" onClick={game.retryConnection}>
                  Retry
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={screenKey(view)}
            className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {view.phase === "LOBBY" && <LobbyScreen view={view} onLeave={() => setLeaving(true)} />}
            {view.phase === "COUNTDOWN" && view.countdownEndsAt && (
              <StartSequence
                endsAt={view.countdownEndsAt}
                playerCount={view.playerCount}
                variant="phone"
                sound={sound}
              />
            )}
            {(view.phase === "QUESTION_ACTIVE" || view.phase === "QUESTION_LOCKED") && (
              <QuestionScreen game={game} view={view} sound={sound} />
            )}
            {view.phase === "ANSWER_REVEAL" && <RevealScreen view={view} />}
            {view.phase === "LEADERBOARD" && <RankScreen view={view} />}
            {view.phase === "FINISHED" && <FinalScreen view={view} onDone={game.leave} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave the arena?"
        description="Your nickname will be released."
        confirmLabel="Leave"
        onConfirm={game.leave}
      />
    </div>
  );
}

const screenKey = (v: PlayerView) =>
  v.phase === "QUESTION_ACTIVE" || v.phase === "QUESTION_LOCKED"
    ? `q-${v.question?.id}`
    : `${v.phase}-${v.question?.id ?? ""}`;

/* ============================================================================ lobby */

function LobbyScreen({ view, onLeave }: { view: PlayerView; onLeave: () => void }) {
  const reduced = useReducedMotion();
  return (
    <div className="arena-floor flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="relative grid h-40 w-40 place-items-center">
        {!reduced &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border border-accent/50"
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
            />
          ))}
        <span className="grid h-20 w-20 place-items-center bg-accent text-accent-ink notch">
          <Check className="h-10 w-10" strokeWidth={3} />
        </span>
      </div>
      <p className="label mt-8 text-accent">You&apos;re in</p>
      <h1 className="mt-3 break-words font-display text-[2.5rem] font-extrabold leading-none tracking-[-0.04em]">
        {view.me.nickname}
      </h1>
      <p className="mt-4 max-w-xs text-body-lg text-fg-2">
        Find your name on the big screen. The host will start soon.
      </p>
      <p className="mt-8 flex items-baseline gap-2">
        <AnimatedNumber value={view.playerCount} className="numeric text-3xl font-extrabold" />
        <span className="label text-fg-3">
          {view.playerCount === 1 ? "player" : "players"} in the arena
        </span>
      </p>
      <button
        onClick={onLeave}
        className="label mt-10 flex items-center gap-1.5 text-fg-3 hover:text-fg"
      >
        <LogOut className="h-3.5 w-3.5" /> Leave
      </button>
    </div>
  );
}

/* ============================================================================ question */

function QuestionScreen({ game, view, sound }: { game: Game; view: PlayerView; sound: boolean }) {
  const q = view.question!;
  const locked = view.phase === "QUESTION_LOCKED" || view.paused;
  const chosen = view.myAnswerId ?? game.pendingAnswer;
  const [expanded, setExpanded] = useState(false);

  const submit = async (optionId: string) => {
    if (chosen || locked) return;
    if (sound) play("select");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(15);
    const res = await game.answer(optionId);
    if (!res.ok)
      toast.error(ERROR_COPY[res.code]?.title ?? "Not accepted", { description: res.message });
  };

  // Desktop players: 1–4 or A–D.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const i =
        ["1", "2", "3", "4"].indexOf(k) !== -1 ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
      const option = q.options[i];
      if (option) void submit(option.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const state = (id: string): TileState =>
    chosen ? (id === chosen ? "selected" : "dimmed") : locked ? "dimmed" : "idle";

  return (
    <div className="flex flex-1 flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <div className="flex items-center gap-3 px-1">
        <span className="numeric shrink-0 text-body-lg font-extrabold text-accent">
          Q{pad2(q.index + 1)}
          <span className="text-fg-3">/{pad2(q.total)}</span>
        </span>
        <div className="flex-1">
          <CountdownBar timer={view.timer} active={view.phase === "QUESTION_ACTIVE"} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className={cn(
          "px-1 text-left font-display text-lg font-bold leading-snug tracking-[-0.015em]",
          !expanded && "line-clamp-3",
        )}
      >
        {q.text}
      </button>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-2.5",
          q.options.length > 2 ? "grid-cols-2 grid-rows-2" : "grid-cols-1 grid-rows-2",
        )}
      >
        {q.options.map((o, i) => (
          <PhoneAnswerButton
            key={o.id}
            index={i}
            text={o.text}
            state={state(o.id)}
            disabled={!!chosen || locked}
            onPress={() => void submit(o.id)}
          />
        ))}
      </div>

      <AnimatePresence>
        {(chosen || locked) && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 py-1 text-center text-body font-semibold"
            role="status"
          >
            {view.paused ? (
              <>
                <Clock className="h-4 w-4 text-warning" /> Paused by the host
              </>
            ) : chosen ? (
              <>
                <Check className="h-4 w-4 text-accent" /> Locked in —{" "}
                {view.phase === "QUESTION_LOCKED"
                  ? "waiting for the reveal"
                  : "waiting for the others"}
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-danger" /> Time&apos;s up
              </>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================================ reveal */

function RevealScreen({ view }: { view: PlayerView }) {
  const reduced = useReducedMotion();
  const r = view.result;
  const q = view.question;
  const correctIds = new Set(view.correctOptionIds ?? []);
  const outcome = !r?.answered ? "none" : r.correct ? "correct" : "wrong";

  const tone = {
    correct: "bg-success text-inverse",
    wrong: "bg-danger text-white",
    none: "bg-elevated text-fg",
  }[outcome];
  const heading = { correct: "Correct", wrong: "Not quite", none: "No answer" }[outcome];

  const tileState = (id: string): TileState => {
    if (correctIds.has(id)) return "correct";
    if (id === r?.optionId) return "wrong";
    return "dimmed";
  };

  return (
    <div className="flex flex-1 flex-col">
      <motion.section
        className={cn("flex flex-col items-center justify-center px-6 py-8 text-center", tone)}
        initial={reduced ? false : { scale: 0.9, opacity: 0 }}
        animate={
          outcome === "wrong" && !reduced
            ? { x: [0, -12, 10, -6, 0], opacity: 1, scale: 1 }
            : { scale: 1, opacity: 1 }
        }
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        aria-live="assertive"
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-black/15">
          {outcome === "correct" ? (
            <Check className="h-8 w-8" strokeWidth={3} />
          ) : outcome === "wrong" ? (
            <X className="h-8 w-8" strokeWidth={3} />
          ) : (
            <Clock className="h-7 w-7" />
          )}
        </span>
        <h1 className="mt-4 font-display text-[2.75rem] font-extrabold uppercase leading-none tracking-[-0.04em]">
          {heading}
        </h1>
        {outcome === "correct" && r && (
          <motion.p
            initial={reduced ? false : { y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="numeric mt-3 text-3xl font-extrabold"
          >
            +<AnimatedNumber value={r.points} from={0} duration={0.8} />
          </motion.p>
        )}
        {outcome !== "correct" && (
          <p className="mt-2 text-body-lg opacity-85">
            {outcome === "none"
              ? "Time ran out before you answered."
              : "Shake it off — next one's yours."}
          </p>
        )}
      </motion.section>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-b border-line px-4 py-4">
        {r && r.streak >= 2 && (
          <span className="flex items-center gap-1.5 font-display text-body-lg font-bold text-warning">
            <Flame className="h-5 w-5" /> {r.streak} in a row
          </span>
        )}
        {r?.rank && (
          <span className="flex items-center gap-1.5 font-display text-body-lg font-bold">
            {ordinal(r.rank)} place
            {r.previousRank && r.previousRank !== r.rank && (
              <span
                className={cn(
                  "flex items-center text-body-sm",
                  r.previousRank > r.rank ? "text-success" : "text-danger",
                )}
              >
                {r.previousRank > r.rank ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
                {Math.abs(r.previousRank - r.rank)}
              </span>
            )}
          </span>
        )}
      </div>

      {q && view.correctOptionIds && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {q.options.map((o, i) => (
            <div
              key={o.id}
              className={cn(
                "flex items-center gap-3 border-2 p-2.5",
                tileState(o.id) === "correct"
                  ? "border-success bg-success-soft"
                  : tileState(o.id) === "wrong"
                    ? "border-danger/60 bg-danger-soft"
                    : "border-line opacity-50",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center font-display font-extrabold",
                  answerStyle(i).bg,
                  answerStyle(i).ink,
                )}
              >
                {answerStyle(i).letter}
              </span>
              <span className="min-w-0 flex-1 text-body font-medium">{o.text}</span>
              {tileState(o.id) === "correct" && (
                <Check className="h-5 w-5 text-success" aria-label="Correct answer" />
              )}
              {tileState(o.id) === "wrong" && (
                <X className="h-5 w-5 text-danger" aria-label="Your answer" />
              )}
            </div>
          ))}
          {view.explanation && (
            <p className="mt-2 border-l-2 border-accent px-3 py-1 text-body-sm text-fg-2">
              {view.explanation}
            </p>
          )}
        </div>
      )}
      {!view.correctOptionIds && (
        <p className="p-6 text-center text-body text-fg-3">Eyes on the big screen.</p>
      )}
    </div>
  );
}

/* ============================================================================ leaderboard */

function RankScreen({ view }: { view: PlayerView }) {
  const r = view.result;
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
      <p className="label text-center text-fg-3">Your position</p>
      <p className="numeric mt-2 text-center text-[5rem] font-extrabold leading-none">
        {view.me.rank ? ordinal(view.me.rank) : "—"}
        {r?.previousRank && view.me.rank && r.previousRank !== view.me.rank && (
          <span
            className={cn(
              "ml-2 inline-flex items-center text-2xl",
              r.previousRank > view.me.rank ? "text-success" : "text-danger",
            )}
          >
            {r.previousRank > view.me.rank ? (
              <ArrowUp className="h-6 w-6" />
            ) : (
              <ArrowDown className="h-6 w-6" />
            )}
          </span>
        )}
      </p>
      <p className="mt-1 text-center text-body text-fg-2">of {view.playerCount} players</p>
      {view.leaderboard && (
        <div className="mt-8">
          <p className="label mb-3 text-fg-3">Top {view.leaderboard.length}</p>
          <Leaderboard entries={view.leaderboard} size="phone" highlightId={view.me.id} />
        </div>
      )}
    </div>
  );
}

/* ============================================================================ final */

function FinalScreen({ view, onDone }: { view: PlayerView; onDone: () => void }) {
  const rank = view.me.rank;
  const podium = rank !== null && rank <= 3;
  const title = rank === 1 ? "Champion" : podium ? "On the podium" : "Game over";

  return (
    <div className="arena-floor flex flex-1 flex-col overflow-y-auto px-5 py-8 text-center">
      <Confetti
        fire={podium ? "final" : null}
        intensity={rank === 1 ? 1 : 0.5}
        origin={{ x: 0.5, y: 0.3 }}
      />
      <p className="label text-accent">{title}</p>
      <motion.p
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="numeric mt-3 text-[6rem] font-extrabold leading-none"
      >
        {rank === 1 && <Crown className="mx-auto mb-2 h-12 w-12 text-accent" />}
        {rank ? ordinal(rank) : "—"}
      </motion.p>
      <p className="mt-2 text-body-lg text-fg-2">of {view.playerCount} players</p>
      <dl className="mx-auto mt-8 grid w-full max-w-sm grid-cols-2 gap-px bg-line">
        <div className="bg-surface p-4">
          <dt className="label text-fg-3">Score</dt>
          <dd className="numeric mt-2 text-3xl font-extrabold">
            <AnimatedNumber value={view.me.score} from={0} />
          </dd>
        </div>
        <div className="bg-surface p-4">
          <dt className="label text-fg-3">Correct</dt>
          <dd className="numeric mt-2 text-3xl font-extrabold">{view.me.correctCount}</dd>
        </div>
      </dl>
      {view.leaderboard && (
        <div className="mx-auto mt-8 w-full max-w-sm text-left">
          <p className="label mb-3 text-fg-3">Final top {view.leaderboard.length}</p>
          <Leaderboard
            entries={view.leaderboard.map((e) => ({ ...e, previousRank: null, lastPoints: 0 }))}
            size="phone"
            highlightId={view.me.id}
          />
        </div>
      )}
      <Button size="lg" variant="secondary" className="mx-auto mt-10" onClick={onDone}>
        Join another game
      </Button>
    </div>
  );
}
