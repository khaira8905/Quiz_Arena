"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatNumber } from "@/lib/format";

/**
 * Counts from the previous value to the new one by writing straight to the DOM node —
 * no React re-render per frame, so dozens can run at once (leaderboards, stat tiles).
 */
export function AnimatedNumber({
  value,
  duration = 0.9,
  className,
  format = formatNumber,
  from,
}: {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
  from?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(from ?? value);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced || prev.current === value) {
      node.textContent = format(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (node.textContent = format(Math.round(v))),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, format, reduced]);

  return (
    <span ref={ref} className={className}>
      {format(from ?? value)}
    </span>
  );
}
