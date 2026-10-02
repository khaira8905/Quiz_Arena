"use client";

import { ERROR_COPY } from "@quizarena/shared/errors";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Spinner, StatusScreen } from "@/components/ui/misc";
import { usePlayerGame } from "@/lib/game/use-player-game";
import { unlockAudio } from "@/lib/sound";
import { PlayerGame } from "./player-game";

/** Player entry flow: code → nickname → game. Everything else is in <PlayerGame>. */
export function PlayArena({ initialCode }: { initialCode: string | null }) {
  const game = usePlayerGame(initialCode);
  const { step } = game;

  if (step.kind === "playing" && game.view) return <PlayerGame game={game} view={game.view} />;

  if (step.kind === "closed") {
    const copy = ERROR_COPY[step.code];
    return (
      <StatusScreen
        eyebrow={step.code === "REPLACED_BY_NEW_CONNECTION" ? "Seat moved" : "Disconnected"}
        title={copy?.title ?? "You left the arena"}
        description={step.message}
        tone="danger"
        action={<Button onClick={game.reset}>Join a game</Button>}
      />
    );
  }

  if (step.kind === "checking" || step.kind === "resuming" || step.kind === "playing") {
    return (
      <div className="arena-floor flex min-h-dvh flex-col items-center justify-center gap-5 px-6">
        <Spinner className="h-8 w-8" />
        <p className="label text-fg-2">
          {step.kind === "resuming"
            ? `Rejoining ${step.code}`
            : step.kind === "checking"
              ? `Finding arena ${step.code}`
              : "Entering the arena"}
        </p>
      </div>
    );
  }

  return (
    <main className="arena-floor flex min-h-dvh flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="QuizArena home">
          <Logo size="sm" />
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <AnimatePresence mode="wait">
          {step.kind === "code" ? (
            <CodeStep
              key="code"
              error={step.error}
              initial={step.attempted ?? ""}
              onSubmit={game.submitCode}
            />
          ) : (
            <NameStep
              key="name"
              title={step.game.quizTitle}
              code={step.game.code}
              error={step.kind === "name" ? step.error : undefined}
              pending={step.kind === "joining"}
              onSubmit={(n) => {
                unlockAudio();
                void game.join(n);
              }}
              onBack={game.reset}
            />
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

const stepMotion = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
};

function CodeStep({
  error,
  initial,
  onSubmit,
}: {
  error?: { code: string; message: string };
  initial: string;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState(initial);
  const clean = code.replace(/\s+/g, "").toUpperCase();
  const title = error
    ? (ERROR_COPY[error.code as keyof typeof ERROR_COPY]?.title ?? "Something's off")
    : null;

  return (
    <motion.form
      {...stepMotion}
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 4) onSubmit(clean);
      }}
      className="flex flex-col"
    >
      <p className="label text-accent">Step 1 of 2</p>
      <h1 className="mt-3 font-display text-h1">Enter the game code</h1>
      <p className="mt-2 text-body text-fg-2">It&apos;s on the big screen.</p>
      <label htmlFor="game-code" className="sr-only">
        Game code
      </label>
      <motion.input
        id="game-code"
        autoFocus
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={8}
        placeholder="QA0000"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        aria-invalid={!!error}
        aria-describedby={error ? "code-error" : undefined}
        animate={error ? { x: [0, -10, 8, -5, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
        className="numeric mt-8 h-20 w-full rounded-md border-2 border-line-strong bg-sunken text-center text-[2.75rem] font-extrabold tracking-[0.1em] text-fg placeholder:text-fg-3/40 focus:border-accent focus:outline-none aria-[invalid=true]:border-danger"
      />
      {error && (
        <div
          id="code-error"
          role="alert"
          className="mt-3 border-l-2 border-danger bg-danger-soft px-3 py-2"
        >
          <p className="text-body-sm font-semibold text-fg">{title}</p>
          <p className="text-body-sm text-fg-2">{error.message}</p>
        </div>
      )}
      <Button type="submit" size="xl" className="mt-6 w-full" disabled={clean.length < 4} notch>
        Continue <ArrowRight className="h-5 w-5" />
      </Button>
    </motion.form>
  );
}

function NameStep({
  title,
  code,
  error,
  pending,
  onSubmit,
  onBack,
}: {
  title: string;
  code: string;
  error?: { code: string; message: string };
  pending: boolean;
  onSubmit: (nickname: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const ok = name.trim().length >= 2;
  return (
    <motion.form
      {...stepMotion}
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !pending) onSubmit(name.trim());
      }}
      className="flex flex-col"
    >
      <p className="label text-accent">Step 2 of 2 · Arena {code}</p>
      <h1 className="mt-3 font-display text-h1">Pick your name</h1>
      <p className="mt-2 text-body text-fg-2">
        You&apos;re joining <span className="font-semibold text-fg">{title}</span>.
      </p>
      <label htmlFor="nickname" className="sr-only">
        Nickname
      </label>
      <motion.input
        id="nickname"
        autoFocus
        autoComplete="nickname"
        maxLength={20}
        placeholder="Your nickname"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? "name-error" : "name-hint"}
        animate={error ? { x: [0, -10, 8, -5, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
        className="mt-8 h-16 w-full rounded-md border-2 border-line-strong bg-sunken px-4 text-center font-display text-2xl font-bold text-fg placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:text-fg-3 focus:border-accent focus:outline-none aria-[invalid=true]:border-danger"
      />
      {error ? (
        <p
          id="name-error"
          role="alert"
          className="mt-3 border-l-2 border-danger bg-danger-soft px-3 py-2 text-body-sm text-fg"
        >
          {error.message}
        </p>
      ) : (
        <p id="name-hint" className="mt-3 text-center text-body-sm text-fg-3">
          2–20 characters. Everyone will see it on the big screen.
        </p>
      )}
      <Button
        type="submit"
        size="xl"
        className="mt-6 w-full"
        disabled={!ok}
        loading={pending}
        notch
      >
        Enter the arena <ArrowRight className="h-5 w-5" />
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="label mt-5 self-center text-fg-3 hover:text-fg"
      >
        Use a different code
      </button>
    </motion.form>
  );
}
