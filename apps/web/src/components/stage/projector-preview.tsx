"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** The stage is designed at 1080p and scales with the viewport, so the preview frames it there. */
const STAGE_W = 1920;
const STAGE_H = 1080;

export interface ProjectorPreviewHandle {
  refresh: () => void;
  fullscreen: () => void;
}

/**
 * Live projector preview: the real stage route in a muted, input-free frame, scaled to fit.
 * It connects on its own as a stage viewer, so it shows exactly what the projector shows
 * (the audience-safe view) and never anything from the control room.
 */
export const ProjectorPreview = forwardRef<
  ProjectorPreviewHandle,
  { code: string; className?: string }
>(function ProjectorPreview({ code, className }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [full, setFull] = useState(false);

  useImperativeHandle(ref, () => ({
    refresh: () => setGeneration((g) => g + 1),
    fullscreen: () => void box.current?.requestFullscreen().catch(() => {}),
  }));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale((entry?.contentRect.width ?? 0) / STAGE_W));
    ro.observe(el);
    const onFs = () => setFull(document.fullscreenElement === el);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      ro.disconnect();
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  return (
    <div
      ref={box}
      className={cn("relative w-full overflow-hidden bg-sunken", full && "bg-black", className)}
      style={full ? undefined : { aspectRatio: `${STAGE_W} / ${STAGE_H}` }}
    >
      <iframe
        key={generation}
        src={`/host/${encodeURIComponent(code)}/projector?preview=1`}
        title="Projector preview"
        tabIndex={-1}
        // Fullscreen: the frame becomes the real screen size, so the stage lays itself out
        // for that display (it is sized in viewport units) instead of being scaled up.
        width={full ? undefined : STAGE_W}
        height={full ? undefined : STAGE_H}
        className={cn(
          "pointer-events-none absolute left-0 top-0 border-0",
          full ? "h-full w-full" : "origin-top-left",
        )}
        style={
          full
            ? undefined
            : { transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }
        }
      />
    </div>
  );
});
