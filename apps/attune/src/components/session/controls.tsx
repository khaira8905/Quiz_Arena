"use client";

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Coffee,
  Compass,
  Flame,
  Repeat2,
  Shuffle,
  ThumbsDown,
} from "lucide-react";
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
  { action: "TOO_HARD", label: "Too hard", icon: ArrowDownToLine },
  { action: "EXPLAIN_DIFFERENTLY", label: "Explain differently", icon: Repeat2 },
  { action: "CHALLENGE_ME", label: "Challenge me", icon: Flame },
  { action: "EXPLORE", label: "Let me explore", icon: Compass },
  { action: "NOT_INTERESTED", label: "Not interested", icon: ThumbsDown },
  { action: "CHANGE_ACTIVITY", label: "Something else", icon: Shuffle },
  { action: "BREAK", label: "Take a break", icon: Coffee },
];

const MOODS: { feeling: Feeling; label: string }[] = [
  { feeling: "bored", label: "Bored" },
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
  return (
    <div className={cn("space-y-3", disabled && "pointer-events-none opacity-50")}>
      <div role="group" aria-label="Steer the session" className="flex flex-wrap gap-1.5">
        {CONTROLS.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            onClick={() => onEvent({ type: "control", action })}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="How are you feeling right now?"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-[12.5px] text-muted">I&apos;m feeling</span>
          {MOODS.map(({ feeling, label }) => (
            <button
              key={feeling}
              type="button"
              onClick={() =>
                onEvent({
                  type: "checkin",
                  feeling,
                  energy: feeling === "tired" ? 2 : energy,
                  timeBudgetMin,
                  partial: true,
                })
              }
              className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-ink-2 hover:border-ink hover:text-ink"
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Quick reaction" className="flex items-center gap-1">
          {REACTIONS.map(({ reaction, label }) => (
            <button
              key={reaction}
              type="button"
              onClick={() => onEvent({ type: "reaction", reaction })}
              className="rounded-lg px-2 py-1 text-[12.5px] text-muted hover:bg-surface-2 hover:text-ink"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
