"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Coffee,
  Compass,
  Flame,
  Meh,
  Repeat2,
  Shuffle,
  ThumbsDown,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ControlAction, Feeling, LearnerEventInput, Reaction } from "@attune/engine";
import { cn } from "../ui";

/**
 * Human control. Every control is a hard constraint on the next decision and evidence for the
 * state engine. "Too easy" always means harder; "Explain differently" always means a new angle.
 */

const CONTROLS: {
  action: ControlAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { action: "TOO_EASY", label: "Too easy", icon: ArrowUpToLine },
  { action: "TOO_HARD", label: "Too difficult", icon: ArrowDownToLine },
  { action: "EXPLAIN_DIFFERENTLY", label: "Explain differently", icon: Repeat2 },
  { action: "CHALLENGE_ME", label: "Give me a challenge", icon: Flame },
  { action: "EXPLORE", label: "Let me explore", icon: Compass },
  { action: "NOT_INTERESTED", label: "Not interested", icon: ThumbsDown },
  { action: "CHANGE_ACTIVITY", label: "Something else", icon: Shuffle },
  { action: "BREAK", label: "Take a break", icon: Coffee },
];

const MOODS: { feeling: Feeling; label: string }[] = [
  { feeling: "confused", label: "Confused" },
  { feeling: "overwhelmed", label: "Overwhelmed" },
  { feeling: "tired", label: "Tired" },
  { feeling: "curious", label: "Curious" },
  { feeling: "alone", label: "On my own" },
  { feeling: "motivated", label: "Good" },
];

const REACTIONS: { reaction: Reaction; label: string }[] = [
  { reaction: "aha", label: "Aha!" },
  { reaction: "fun", label: "Fun" },
  { reaction: "meh", label: "Meh" },
  { reaction: "lost", label: "Lost" },
];

const HEARD: Record<string, string> = {
  bored: "Heard: you're bored. Re-reading your state…",
  TOO_EASY: "Heard: too easy. The next one will be harder.",
  TOO_HARD: "Heard: too difficult. Stepping down and adding support.",
  EXPLAIN_DIFFERENTLY: "Heard: explain differently. Switching how it's shown.",
  CHALLENGE_ME: "Heard: give me a challenge. Raising the stakes.",
  EXPLORE: "Heard: let me explore. Opening a curiosity path.",
  NOT_INTERESTED: "Heard: not interested. Changing the angle.",
  CHANGE_ACTIVITY: "Heard: something else. Picking a different kind of activity.",
  BREAK: "Heard: take a break.",
};

const press = { whileTap: { scale: 0.96 }, transition: { duration: 0.1 } } as const;

export function ControlBar({
  onEvent,
  energy,
  timeBudgetMin,
  disabled,
}: {
  onEvent: (input: LearnerEventInput) => void;
  energy: number;
  timeBudgetMin: number;
  disabled?: boolean;
}) {
  const [heard, setHeard] = useState<{ key: string; n: number } | null>(null);
  useEffect(() => {
    if (!heard) return;
    const t = setTimeout(() => setHeard(null), 3500);
    return () => clearTimeout(t);
  }, [heard]);
  const fire = (input: LearnerEventInput, key: string) => {
    onEvent(input);
    setHeard((h) => ({ key, n: (h?.n ?? 0) + 1 }));
  };
  const mood = (feeling: Feeling) => ({
    type: "checkin" as const,
    feeling,
    energy: feeling === "tired" ? 2 : energy,
    timeBudgetMin,
    partial: true,
  });

  return (
    <div className={cn("space-y-3", disabled && "pointer-events-none opacity-50")}>
      <div role="group" aria-label="Steer the session" className="flex flex-wrap gap-1.5">
        <motion.button
          {...press}
          type="button"
          onClick={() => fire(mood("bored"), "bored")}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink bg-ink px-3 text-[13px] font-medium text-inverse transition-opacity hover:opacity-90"
        >
          <Meh className="size-3.5" aria-hidden />
          I&apos;m bored
        </motion.button>
        {CONTROLS.map(({ action, label, icon: Icon }) => (
          <motion.button
            key={action}
            {...press}
            type="button"
            onClick={() => fire({ type: "control", action }, action)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </motion.button>
        ))}
      </div>
      <div aria-live="polite" className="min-h-5">
        <AnimatePresence mode="wait">
          {heard && (
            <motion.p
              key={heard.n}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="type-small text-accent"
            >
              {HEARD[heard.key] ?? "Noted. It counts as evidence for the next decision."}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="How are you feeling right now?"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-[12.5px] text-muted">I&apos;m feeling</span>
          {MOODS.map(({ feeling, label }) => (
            <motion.button
              key={feeling}
              {...press}
              type="button"
              onClick={() => fire(mood(feeling), feeling)}
              className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-ink-2 hover:border-ink hover:text-ink"
            >
              {label}
            </motion.button>
          ))}
        </div>
        <div role="group" aria-label="Quick reaction" className="flex items-center gap-1">
          {REACTIONS.map(({ reaction, label }) => (
            <motion.button
              key={reaction}
              {...press}
              type="button"
              onClick={() => fire({ type: "reaction", reaction }, reaction)}
              className="rounded-lg px-2 py-1 text-[12.5px] text-muted hover:bg-surface-2 hover:text-ink"
            >
              {label}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
