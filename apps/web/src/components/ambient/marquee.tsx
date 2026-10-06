import { cn } from "@/lib/cn";

/**
 * An endless strip that drifts sideways with its edges faded out. The content is rendered
 * twice and the track moves by exactly one copy, so the loop is seamless. Hovering pauses
 * it; reduced motion stops it.
 */
export function Marquee({
  children,
  reverse,
  duration = 60,
  gap = 16,
  className,
  label,
}: {
  children: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  gap?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("mask-fade-x group/marquee overflow-hidden", className)}
      role={label ? "region" : undefined}
      aria-label={label}
    >
      <div
        className="marquee-track flex w-max animate-marquee group-hover/marquee:[animation-play-state:paused]"
        style={
          {
            gap,
            "--marquee-gap": `${gap}px`,
            "--marquee-duration": `${duration}s`,
            animationDirection: reverse ? "reverse" : undefined,
          } as React.CSSProperties
        }
      >
        <div className="flex shrink-0" style={{ gap }}>
          {children}
        </div>
        <div className="flex shrink-0" style={{ gap }} aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
