"use client";

import type { QuestionVideo } from "@quizarena/shared/media";
import { VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The question video on the stage. No controls: the server decides what it does. It plays
 * while `playing` (the question is being read or answered) and pauses on any other phase;
 * a new `epoch` (the host pressed Replay) restarts it; `sound` is the host's unmute.
 * `audio` is false for previews, which never make a sound.
 */
export function StageVideo({
  video,
  playing,
  epoch,
  sound,
  audio,
  className,
}: {
  video: QuestionVideo;
  playing: boolean;
  epoch: number;
  sound: boolean;
  audio: boolean;
  className?: string;
}) {
  const el = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(false);
  // Browsers only allow sound after someone has interacted with the page.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const wantSound = audio && sound;
  const lastEpoch = useRef(epoch);

  useEffect(() => {
    const v = el.current;
    if (!v) return;
    if (epoch !== lastEpoch.current) {
      lastEpoch.current = epoch;
      v.currentTime = 0;
    }
    v.muted = !wantSound;
    if (!playing) {
      v.pause();
      return;
    }
    v.play().then(
      () => setSoundBlocked(false),
      () => {
        if (!v.muted) {
          // Unmuted autoplay refused: keep the picture going, silently.
          setSoundBlocked(true);
          v.muted = true;
          void v.play().catch(() => {});
        }
      },
    );
  }, [playing, epoch, wantSound]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-line-strong bg-black",
        className,
      )}
    >
      <video
        ref={el}
        key={video.url}
        src={video.url}
        poster={video.posterUrl ?? undefined}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-contain"
        aria-label="Question video"
      />
      {buffering && playing && !failed && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[0.5vh] animate-pulse bg-accent/70"
        />
      )}
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-3 text-center text-[clamp(0.9rem,1.1vw,2rem)] text-fg-3">
          Video unavailable
        </p>
      )}
      {soundBlocked && wantSound && (
        // Shown on the projector only (audio is false in previews), for whoever is at it.
        <span className="absolute right-[1vw] top-[1vw] inline-flex items-center gap-2 rounded-sm bg-black/75 px-3 py-1.5 text-[clamp(0.75rem,0.9vw,1.6rem)] text-white">
          <VolumeX className="h-[1.2em] w-[1.2em]" aria-hidden /> Click this window once to allow
          sound
        </span>
      )}
    </div>
  );
}

let warm: HTMLVideoElement | null = null;
/**
 * Starts buffering the next question's video in the background (the stage only, from the
 * reveal on), so it starts instantly when the question opens.
 */
export function preloadVideo(src: string | null | undefined) {
  if (typeof document === "undefined") return;
  if (warm && warm.src !== new URL(src ?? "", location.href).href) {
    warm.removeAttribute("src");
    warm.load();
    warm = null;
  }
  if (!src || warm) return;
  warm = document.createElement("video");
  warm.muted = true;
  warm.preload = "auto";
  warm.src = src;
}
