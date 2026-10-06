"use client";

import type { TimerState } from "@quizarena/shared/game";
import { useEffect, useState } from "react";
import { serverNow } from "./clock";

/**
 * Remaining milliseconds for a server timer, re-rendering only when the displayed second
 * changes (plus a fine-grained progress value for rings/bars via `fine`).
 */
export function useCountdown(
  timer: TimerState | null,
  active: boolean,
  opts: { fine?: boolean } = {},
) {
  const compute = () => {
    if (!timer) return 0;
    if (timer.paused || !active) return timer.remainingMs;
    return Math.max(0, timer.deadline - serverNow());
  };
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    let raf = 0;
    let lastKey = -1;
    const loop = () => {
      const ms = compute();
      // Coarse mode: update once per displayed second. Fine mode: ~every frame.
      const key = opts.fine ? Math.round(ms / 50) : Math.ceil(ms / 1000);
      if (key !== lastKey) {
        lastKey = key;
        setRemaining(ms);
      }
      if (ms > 0 && active && timer && !timer.paused) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.deadline, timer?.paused, timer?.remainingMs, active, opts.fine]);

  const total = timer?.durationMs ?? 1;
  return {
    remaining,
    seconds: Math.ceil(remaining / 1000),
    progress: Math.min(1, Math.max(0, remaining / total)),
  };
}

/** Urgency level drives the countdown's escalating motion: 0 calm → 4 expired. */
/**
 * Finer-grained tension for motion (colour still follows urgencyFor): calm · 10s · 5s · 3s ·
 * 2s · 1s · zero. Purely presentational; the server's clock decides when time is up.
 */
export function tensionFor(seconds: number, active: boolean): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (!active) return 0;
  if (seconds <= 0) return 6;
  if (seconds <= 1) return 5;
  if (seconds <= 2) return 4;
  if (seconds <= 3) return 3;
  if (seconds <= 5) return 2;
  if (seconds <= 10) return 1;
  return 0;
}

export function urgencyFor(seconds: number, active: boolean): 0 | 1 | 2 | 3 | 4 {
  if (!active) return 0;
  if (seconds <= 0) return 4;
  if (seconds <= 1) return 3;
  if (seconds <= 3) return 2;
  if (seconds <= 5) return 1;
  return 0;
}
