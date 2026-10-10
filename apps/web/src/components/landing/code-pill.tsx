"use client";

import {
  GAME_CODE_DIGITS,
  GAME_CODE_PATTERN,
  GAME_CODE_PREFIX,
  normalizeGameCode,
} from "@quizarena/shared/constants";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { pokeServer } from "@/lib/server-wake";

/** Keeps just the six digits, whether someone types "482193", "482 193" or pastes "QA482193". */
export function digitsOf(raw: string): string {
  const s = normalizeGameCode(raw);
  return (s.startsWith(GAME_CODE_PREFIX) ? s.slice(GAME_CODE_PREFIX.length) : s)
    .replace(/\D/g, "")
    .slice(0, GAME_CODE_DIGITS);
}

/**
 * The landing page's game-PIN entry, shown three times down the page. A fixed "QA" tile and
 * six boxes; under the boxes is one ordinary text input (so typing, pasting, autofill and
 * screen readers all just work), drawn transparent with the boxes showing its value. The
 * arrow fills with the accent once all six digits are in, then opens /play with the PIN.
 */
export function CodePill({
  variant = "page",
  className,
}: {
  /** "band" sits on the dark contrast band; "page" everywhere else. */
  variant?: "page" | "band";
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [digits, setDigits] = useState("");
  const [focused, setFocused] = useState(false);
  const code = `${GAME_CODE_PREFIX}${digits}`;
  const complete = GAME_CODE_PATTERN.test(code);
  // Visitors on the landing page are about to play: start waking the game server now.
  useEffect(pokeServer, []);

  const band = variant === "band";
  const active = focused && !complete ? digits.length : -1;
  return (
    <form
      className={cn(
        "lp-pill shadow-[var(--lp-pill-shadow)] flex h-16 w-full max-w-[26rem] items-center gap-2 rounded-full border p-2 pl-2.5",
        // The real input is invisible, so the whole pill shows keyboard focus.
        "transition-[border-color,box-shadow] duration-200 focus-within:border-accent focus-within:ring-4 focus-within:ring-[var(--accent-soft)]",
        band
          ? "border-[var(--lp-band-line)] bg-[var(--lp-band-card)] text-[var(--lp-band-text)]"
          : "border-line bg-surface text-fg",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) router.push(`/play?game=${encodeURIComponent(code)}`);
      }}
    >
      <span
        aria-hidden
        className={cn(
          "numeric grid h-11 w-11 shrink-0 place-items-center rounded-full text-[13px] font-semibold tracking-wide",
          band ? "bg-[var(--lp-band-line)]" : "bg-sunken text-fg-2",
        )}
      >
        {GAME_CODE_PREFIX}
      </span>
      <div className="relative grid min-w-0 flex-1 grid-cols-6 gap-1 sm:gap-1.5">
        {Array.from({ length: GAME_CODE_DIGITS }, (_, i) => (
          <span
            key={i}
            aria-hidden
            data-active={i === active ? "" : undefined}
            className={cn(
              "lp-pill-box numeric flex h-11 items-center justify-center rounded-[10px] border text-lg font-semibold",
              band ? "border-[var(--lp-band-line)]" : "border-line",
            )}
          >
            {digits[i] ?? ""}
          </span>
        ))}
        <label htmlFor={id} className="sr-only">
          Game PIN: the 6 digits after QA on the big screen
        </label>
        <input
          ref={input}
          id={id}
          value={digits}
          onChange={(e) => setDigits(digitsOf(e.target.value))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          // Room for a pasted "QA 482 193"; digitsOf trims it back to six.
          maxLength={12}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
        />
      </div>
      <button
        type="submit"
        disabled={!complete}
        aria-label="Join game"
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          complete
            ? "bg-accent text-accent-ink hover:bg-[var(--lp-accent-hover)]"
            : band
              ? "bg-[var(--lp-band-line)] text-[var(--lp-band-muted)]"
              : "bg-elevated text-fg-3",
        )}
      >
        <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
    </form>
  );
}
