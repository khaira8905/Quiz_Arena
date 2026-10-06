"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * A scene with depth: children marked `data-depth` (via style `--d`, in px) shift as the
 * pointer moves, as if a camera panned toward it: nearer layers (bigger |d|) move more.
 * One smoothed pair of CSS variables on the scene drives every layer (see .parallax in
 * globals.css). Pointer devices only; still with reduced motion.
 */
export function ParallaxScene({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div";
} & React.HTMLAttributes<HTMLElement>) {
  const el = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const aim = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let frame = 0;
    const tick = () => {
      cur.x += (aim.x - cur.x) * 0.08;
      cur.y += (aim.y - cur.y) * 0.08;
      node.style.setProperty("--px", cur.x.toFixed(4));
      node.style.setProperty("--py", cur.y.toFixed(4));
      frame =
        Math.abs(aim.x - cur.x) + Math.abs(aim.y - cur.y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      aim.x = (e.clientX / innerWidth) * 2 - 1;
      aim.y = (e.clientY / innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <Tag ref={el as never} className={cn("parallax", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** One layer of a ParallaxScene. Negative depth moves against the pointer (camera pan). */
export function Layer({
  depth,
  className,
  children,
}: {
  depth: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-depth className={className} style={{ "--d": depth } as React.CSSProperties}>
      {children}
    </div>
  );
}
