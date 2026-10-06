"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Leans its content toward the pointer in 3D: rotateX follows the pointer's height,
 * rotateY its side, at most `max` degrees, with a highlight that tracks the pointer and a
 * shadow that shifts away from it. Settles back flat when the pointer leaves.
 *
 * Mouse and pen only; nothing at all on touch or with reduced motion. The pointer handler
 * writes four CSS variables once per frame (no React state, no re-render); the CSS does
 * the rest (see .tilt in globals.css).
 */
export function Tilt({
  children,
  max = 5,
  className,
  innerClassName,
  glare = true,
}: {
  children: React.ReactNode;
  /** Largest lean in degrees. Keep it small: 2–6. */
  max?: number;
  className?: string;
  innerClassName?: string;
  /** The moving highlight (off for media whose own colours should stay untouched). */
  glare?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const set = (x: number, y: number, active: boolean) => {
    const node = el.current;
    if (!node) return;
    node.style.setProperty("--tilt-rx", `${(-y * max).toFixed(2)}deg`);
    node.style.setProperty("--tilt-ry", `${(x * max).toFixed(2)}deg`);
    node.style.setProperty("--tilt-gx", `${((x + 1) * 50).toFixed(1)}%`);
    node.style.setProperty("--tilt-gy", `${((y + 1) * 50).toFixed(1)}%`);
    // The pointer is the light: the shadow falls away from it.
    node.style.setProperty("--tilt-sx", `${(-x * 10).toFixed(1)}px`);
    node.style.setProperty("--tilt-sy", `${(14 - y * 8).toFixed(1)}px`);
    node.toggleAttribute("data-tilting", active);
  };

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    // -1…1 from the centre.
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => set(x, y, true));
  };
  const onLeave = () => {
    cancelAnimationFrame(frame.current);
    set(0, 0, false);
  };

  return (
    <div ref={el} className={cn("tilt", className)} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className={cn("tilt-inner", innerClassName)}>
        {children}
        {glare && <span aria-hidden className="tilt-glare" />}
      </div>
    </div>
  );
}
