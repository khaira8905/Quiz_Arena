"use client";

import type { ImageFit, ImagePosition } from "@quizarena/shared/media";
import { useState } from "react";
import { cn } from "@/lib/cn";

const POSITION: Record<ImagePosition, string> = {
  CENTER: "object-center",
  TOP: "object-top",
  BOTTOM: "object-bottom",
};

/**
 * A question image in a fixed frame: the frame never changes size, so text and answers
 * never jump when the image arrives. A blurred placeholder shows first, then the image
 * fades in. `fit` and `position` are the organiser's framing choices.
 */
export function QuestionImage({
  src,
  fit = "CONTAIN",
  position = "CENTER",
  placeholder,
  srcSet,
  sizes,
  alt = "",
  className,
  rounded = true,
}: {
  src: string;
  fit?: ImageFit;
  position?: ImagePosition;
  placeholder?: string | null;
  srcSet?: string;
  sizes?: string;
  alt?: string;
  className?: string;
  rounded?: boolean;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = loaded === src;
  return (
    <div
      className={cn(
        "relative overflow-hidden border border-line-strong bg-sunken",
        rounded && "rounded-lg",
        className,
      )}
    >
      {placeholder && !ready && (
        <div
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center blur-xl"
          style={{ backgroundImage: `url("${placeholder}")` }}
        />
      )}
      {!placeholder && !ready && failed !== src && (
        <div aria-hidden className="absolute inset-0 animate-pulse bg-line/40" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- storage/CDN or organiser URLs */}
      <img
        key={src}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        decoding="async"
        onLoad={() => setLoaded(src)}
        onError={() => setFailed(src)}
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-500 ease-out",
          fit === "COVER" ? "object-cover" : "object-contain",
          POSITION[position],
          ready ? "opacity-100" : "opacity-0",
        )}
      />
      {failed === src && (
        <p className="absolute inset-0 grid place-items-center p-3 text-center text-body-sm text-fg-3">
          Image unavailable
        </p>
      )}
    </div>
  );
}

/** Warms the browser cache for an image that will be needed soon (the next question). */
export function preloadImage(src: string | null | undefined) {
  if (!src || typeof window === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}
