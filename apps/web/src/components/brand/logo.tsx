import { cn } from "@/lib/cn";

/**
 * The QuizArena mark: an arena seen from above — a notched ring (the crowd) around a
 * solid core (the stage). Monochrome-friendly; the core takes the accent.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path
        d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25L16 2.5Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M16 9.5 21.6 12.75v6.5L16 22.5l-5.6-3.25v-6.5L16 9.5Z" fill="var(--accent)" />
      <path d="M27.7 9.25 24 11.4" stroke="var(--background)" strokeWidth="3" />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const mark = { sm: 22, md: 28, lg: 44 }[size];
  const text = { sm: "text-[15px]", md: "text-[19px]", lg: "text-[30px]" }[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-fg", className)} aria-label="QuizArena">
      <LogoMark size={mark} />
      <span className={cn("font-display font-extrabold tracking-[-0.04em] leading-none", text)}>
        QUIZ<span className="text-accent">ARENA</span>
      </span>
    </span>
  );
}
