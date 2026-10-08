"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Captions,
  CaptionsOff,
  ImageOff,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "./index";

/**
 * VoxelStoryVideoCard: a story told in a short local video, with a voxel illustration that
 * stands in whenever the video can't play (missing file, unsupported format, network error,
 * data saver), so the story is never a broken box.
 *
 * - Media is local (`/public`), never hot-linked; every asset has a fallback.
 * - Chapters are buttons that seek, and double as a readable storyboard when there's no video.
 * - Captions (WebVTT) are on by default and can be toggled.
 * - Reduced motion: no autoplay, no floating voxels, no animated transitions.
 * - Works in light and dark themes through the design tokens.
 */

export interface StoryChapter {
  /** Start time in seconds. */
  time: number;
  label: string;
  /** One line shown in the storyboard fallback and as the chapter's description. */
  detail?: string;
}

export interface VoxelStoryVideoCardProps {
  title: string;
  description?: string;
  eyebrow?: string;
  /** Video sources, best first (e.g. WebM then MP4). Omit to show the voxel storyboard only. */
  sources?: { src: string; type: string }[];
  poster?: string;
  /** WebVTT captions. */
  captions?: string;
  chapters?: StoryChapter[];
  durationLabel?: string;
  /** Start playing (muted) when scrolled into view. Ignored with reduced motion. */
  autoPlayInView?: boolean;
  className?: string;
}

type MediaState = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

const FAMILY = [
  "var(--fam-engaged)",
  "var(--fam-understimulated)",
  "var(--fam-overloaded)",
  "var(--fam-depleted)",
  "var(--fam-social)",
];

/* ---------------------------------------------------------------------------------------------- */
/* Voxel illustration (pure SVG: always available, scales crisply, themed by tokens)               */
/* ---------------------------------------------------------------------------------------------- */

interface Voxel {
  x: number;
  y: number;
  z: number;
  color: string;
}

/** Isometric projection of a unit cube's three visible faces. */
function cubeFaces({ x, y, z }: Voxel, size: number) {
  const w = size;
  const h = size / 2;
  const cx = (x - y) * w;
  const cy = (x + y) * h - z * size;
  const top = `${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}`;
  const left = `${cx - w},${cy} ${cx},${cy + h} ${cx},${cy + h + size} ${cx - w},${cy + size}`;
  const right = `${cx + w},${cy} ${cx},${cy + h} ${cx},${cy + h + size} ${cx + w},${cy + size}`;
  return { top, left, right };
}

/** The story as voxels: five columns, one per beat, rising as engagement comes back. */
function storyVoxels(active: number): Voxel[] {
  const heights = [1, 2, 2, 3, 4];
  const voxels: Voxel[] = [];
  heights.forEach((h, i) => {
    for (let z = 0; z < h; z++) {
      voxels.push({
        x: i,
        y: 0,
        z,
        color: i <= active ? FAMILY[i % FAMILY.length]! : "var(--surface-3)",
      });
    }
  });
  // A floor, so it reads as a place rather than a chart.
  for (let x = -1; x <= 5; x++) {
    for (let y = 1; y <= 2; y++) voxels.push({ x, y, z: -1, color: "var(--surface-2)" });
  }
  // Painter's order: back to front, bottom to top.
  return voxels.sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);
}

export function VoxelScene({
  active = 4,
  animate = true,
  className,
  label = "A voxel illustration of five steps rising: engagement coming back.",
}: {
  active?: number;
  animate?: boolean;
  className?: string;
  label?: string;
}) {
  const size = 22;
  const voxels = storyVoxels(active);
  return (
    <svg viewBox="-150 -150 300 210" role="img" aria-label={label} className={className}>
      <defs>
        <radialGradient id="voxel-glow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="-150" y="-150" width="300" height="210" fill="url(#voxel-glow)" />
      <g transform="translate(-40 10)">
        {voxels.map((v, i) => {
          const f = cubeFaces(v, size);
          const floating = animate && v.z >= 0;
          return (
            <g
              key={`${v.x}-${v.y}-${v.z}-${i}`}
              className={floating ? "voxel-float" : undefined}
              style={
                floating
                  ? { animationDelay: `${(v.x * 0.35 + v.z * 0.12).toFixed(2)}s` }
                  : undefined
              }
            >
              <polygon points={f.left} fill={v.color} style={{ filter: "brightness(0.82)" }} />
              <polygon points={f.right} fill={v.color} style={{ filter: "brightness(0.68)" }} />
              <polygon points={f.top} fill={v.color} />
              <polygon
                points={f.top}
                fill="none"
                stroke="var(--bg)"
                strokeOpacity="0.35"
                strokeWidth="0.75"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Card                                                                                            */
/* ---------------------------------------------------------------------------------------------- */

/** Show or hide the first text track (a DOM side effect, kept outside render). */
function setTrackMode(video: HTMLVideoElement | null, mode: TextTrackMode) {
  const track = video?.textTracks?.[0];
  if (track) track.mode = mode;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VoxelStoryVideoCard({
  title,
  description,
  eyebrow = "Story",
  sources = [],
  poster,
  captions,
  chapters = [],
  durationLabel,
  autoPlayInView = false,
  className,
}: VoxelStoryVideoCardProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const [state, setState] = useState<MediaState>(sources.length ? "idle" : "error");
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [posterFailed, setPosterFailed] = useState(!poster);
  const [lightMode, setLightMode] = useState(false);

  // Data saver / Light mode: don't start a download nobody asked for.
  useEffect(() => {
    const read = () => setLightMode(document.documentElement.dataset.mode !== "full");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    return () => obs.disconnect();
  }, []);

  // Media can fail before React hydrates and attaches its error listeners: check the elements'
  // real state once mounted, so a missing file still lands on the fallback.
  const posterRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (v && (v.error || v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) {
      setState("error");
    }
    const img = posterRef.current;
    if (img && img.complete && img.naturalWidth === 0) setPosterFailed(true);
  }, []);

  const chapterIndex = chapters.reduce((acc, c, i) => (time >= c.time ? i : acc), 0);
  const hasVideo = sources.length > 0 && state !== "error";

  const play = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    setStarted(true);
    setState("loading");
    try {
      await v.play();
    } catch {
      // Autoplay policy or a decode failure: leave it paused with controls, not broken.
      setState(v.error ? "error" : "paused");
    }
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) void play();
    else v.pause();
  };

  const seek = (seconds: number) => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    v.currentTime = seconds;
    setTime(seconds);
    if (v.paused) void play();
  };

  // Optional: start muted when the card scrolls into view (never with reduced motion or Light).
  useEffect(() => {
    if (!autoPlayInView || reduceMotion || lightMode || !hasVideo || started) return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void play();
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoPlayInView, reduceMotion, lightMode, hasVideo, started, play]);

  // Keep the captions track in sync with the toggle.
  useEffect(() => {
    setTrackMode(videoRef.current, captionsOn ? "showing" : "hidden");
  }, [captionsOn, started]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hasVideo || !started) return;
    if (e.key === "k" || (e.key === " " && e.target === e.currentTarget)) {
      e.preventDefault();
      toggle();
    } else if (e.key === "m") {
      setMuted((m) => !m);
    } else if (e.key === "c") {
      setCaptionsOn((c) => !c);
    }
  };

  const showOverlay = !started || state === "ended" || state === "error";

  return (
    <article
      ref={cardRef}
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden rounded-3xl border border-line bg-surface shadow-soft",
        className,
      )}
    >
      {/* Stage */}
      <div
        className="relative aspect-video w-full overflow-hidden bg-surface-2"
        onKeyDown={onKeyDown}
        tabIndex={hasVideo && started ? 0 : -1}
        aria-label={
          hasVideo && started
            ? `${title} video. Press K to play or pause, M to mute, C for captions.`
            : undefined
        }
      >
        {sources.length > 0 && (
          <video
            ref={videoRef}
            className={cn("absolute inset-0 size-full object-cover", !started && "opacity-0")}
            poster={posterFailed ? undefined : poster}
            preload={lightMode ? "none" : "metadata"}
            muted={muted}
            playsInline
            controls={started && state !== "error"}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onWaiting={() => setState("loading")}
            onPlaying={() => setState("playing")}
            onPause={(e) => !e.currentTarget.ended && setState("paused")}
            onEnded={() => setState("ended")}
            onError={() => setState("error")}
          >
            {sources.map((s) => (
              <source
                key={s.src}
                src={s.src}
                type={s.type}
                // The last source failing means no format worked.
                onError={s === sources[sources.length - 1] ? () => setState("error") : undefined}
              />
            ))}
            {captions && (
              <track kind="captions" src={captions} srcLang="en" label="English" default />
            )}
          </video>
        )}

        {/* Poster or voxel illustration (also the failure fallback) */}
        <AnimatePresence>
          {showOverlay && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.25 }}
              className="absolute inset-0"
            >
              {!posterFailed && state !== "error" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local poster with an onError fallback
                <img
                  ref={posterRef}
                  src={poster}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setPosterFailed(true)}
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <VoxelScene
                    active={state === "error" ? 4 : chapterIndex}
                    animate
                    className="h-[88%] w-auto"
                  />
                </div>
              )}
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
                aria-hidden
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary action */}
        {showOverlay && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
            {state === "error" ? (
              <p className="flex items-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-[13px] text-white">
                <ImageOff className="size-4 shrink-0" aria-hidden />
                {sources.length ? "The video can't play here." : "Video not included."} Here&apos;s
                the story in {chapters.length || "a few"} steps instead.
              </p>
            ) : (
              <motion.button
                type="button"
                onClick={() => (state === "ended" ? seek(0) : void play())}
                // MotionConfig turns these into instant changes under reduced motion.
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-[15px] font-semibold text-black shadow-lg focus-visible:outline-white"
              >
                {state === "ended" ? (
                  <RotateCcw className="size-5" aria-hidden />
                ) : (
                  <Play className="size-5 fill-current" aria-hidden />
                )}
                {state === "ended" ? "Watch again" : "Play the story"}
                <span className="sr-only">: {title}</span>
              </motion.button>
            )}
            {durationLabel && state !== "error" && (
              <span className="rounded-lg bg-black/60 px-2 py-1 font-mono text-[12px] text-white">
                {durationLabel}
              </span>
            )}
          </div>
        )}

        {/* Buffering */}
        {started && state === "loading" && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            role="status"
          >
            <LoaderCircle
              className="size-8 animate-spin text-white drop-shadow motion-reduce:animate-none"
              aria-hidden
            />
            <span className="sr-only">Loading video…</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-caption text-muted">{eyebrow}</p>
            <h3 id={headingId} className="mt-1 type-h3 text-ink">
              {title}
            </h3>
            {description && <p className="mt-1 type-body text-ink-2">{description}</p>}
          </div>
          {hasVideo && started && (
            <div className="flex items-center gap-1">
              <IconButton label={state === "playing" ? "Pause" : "Play"} onClick={toggle}>
                {state === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}
              </IconButton>
              <IconButton
                label={muted ? "Unmute" : "Mute"}
                onClick={() => setMuted((m) => !m)}
                pressed={!muted}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </IconButton>
              {captions && (
                <IconButton
                  label={captionsOn ? "Hide captions" : "Show captions"}
                  onClick={() => setCaptionsOn((c) => !c)}
                  pressed={captionsOn}
                >
                  {captionsOn ? (
                    <Captions className="size-4" />
                  ) : (
                    <CaptionsOff className="size-4" />
                  )}
                </IconButton>
              )}
            </div>
          )}
        </div>

        {chapters.length > 0 && (
          <ol className="mt-4 grid gap-2 sm:grid-cols-5" aria-label="Chapters">
            {chapters.map((c, i) => {
              const current = hasVideo && started && i === chapterIndex;
              const past = hasVideo && started && i < chapterIndex;
              return (
                <li key={c.label}>
                  <button
                    type="button"
                    onClick={() => seek(c.time)}
                    disabled={!hasVideo}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "group relative h-full w-full overflow-hidden rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
                      current ? "border-ink bg-surface-2" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-2.5 shrink-0 rounded-[3px]"
                        style={{ background: FAMILY[i % FAMILY.length] }}
                      />
                      <span className="type-small font-medium text-ink">{c.label}</span>
                      {hasVideo && (
                        <span className="ml-auto font-mono text-[11px] text-muted">
                          {formatTime(c.time)}
                        </span>
                      )}
                    </span>
                    {c.detail && (
                      <span className="mt-1 block type-small text-muted">{c.detail}</span>
                    )}
                    {/* Progress through the current chapter */}
                    {(current || past) && (
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent"
                        style={{
                          transform: `scaleX(${
                            past
                              ? 1
                              : Math.min(
                                  1,
                                  (time - c.time) /
                                    Math.max(0.1, (chapters[i + 1]?.time ?? duration) - c.time),
                                )
                          })`,
                        }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </article>
  );
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="flex size-9 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  );
}
