"use client";

import {
  type ArenaAppearance,
  type MotionLevel,
  type TransitionPreset,
  type TypographyPreset,
  DEFAULT_APPEARANCE,
  arenaCssVariables,
  resolveArenaColors,
} from "@quizarena/shared/appearance";
import { createContext, useContext, useEffect, useMemo } from "react";
import { cn } from "@/lib/cn";

/**
 * Arena theming. One provider wraps every arena surface (projector, phone, previews) and
 * re-declares the design tokens as CSS variables on its element, so every component below
 * it re-themes through the cascade — no component knows which theme is active.
 */

const TYPOGRAPHY: Record<TypographyPreset, Record<string, string>> = {
  /** The QuizArena voice: Space Grotesk display and numerals over neutral Geist. */
  ARENA: {
    "--display-family": "var(--font-space-grotesk)",
    "--body-family": "var(--font-geist)",
    "--mono-family": "var(--font-geist-mono)",
  },
  /** Engineered and data-dense: heavy Geist display with mono details. Hackathons, tech talks. */
  TECHNICAL: {
    "--display-family": "var(--font-geist)",
    "--body-family": "var(--font-geist)",
    "--mono-family": "var(--font-geist-mono)",
  },
  /** One friendly humanist family throughout: classrooms and corporate events. */
  CLEAN: {
    "--display-family": "var(--font-jakarta)",
    "--body-family": "var(--font-jakarta)",
    "--mono-family": "var(--font-geist-mono)",
  },
};

export interface ArenaMotion {
  level: MotionLevel;
  /** Multiplier for entrance distances and celebratory scale; 0 disables flourish. */
  amplitude: number;
  /** Confetti particle multiplier; 0 means no confetti. */
  confetti: number;
  /** Whether the timer and big moments may pulse/shake. */
  emphasis: boolean;
}

const MOTION: Record<MotionLevel, ArenaMotion> = {
  SUBTLE: { level: "SUBTLE", amplitude: 0.4, confetti: 0, emphasis: false },
  NORMAL: { level: "NORMAL", amplitude: 1, confetti: 1, emphasis: true },
  HIGH: { level: "HIGH", amplitude: 1.6, confetti: 1.6, emphasis: true },
};

interface ArenaContextValue {
  appearance: ArenaAppearance;
  colors: ReturnType<typeof resolveArenaColors>;
  motion: ArenaMotion;
}

const ArenaContext = createContext<ArenaContextValue | null>(null);

function buildContext(appearance: ArenaAppearance): ArenaContextValue {
  return {
    appearance,
    colors: resolveArenaColors(appearance),
    motion: MOTION[appearance.motion],
  };
}

const DEFAULT_CONTEXT = buildContext(DEFAULT_APPEARANCE);

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Enter/exit motion for a screen change (question to question, phase to phase), following
 * the organiser's transition preset and scaled by animation intensity. `stage` distances are
 * viewport-relative for the projector; `phone` uses small fixed distances.
 */
export function screenTransition(
  preset: TransitionPreset,
  motion: ArenaMotion,
  surface: "stage" | "phone",
  reduced: boolean | null,
) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
    };
  }
  const d = motion.amplitude;
  const far = (stage: number, phone: number) =>
    surface === "stage" ? `${stage * d}vw` : phone * d;
  const transition = { duration: surface === "stage" ? 0.45 : 0.24, ease: EASE };
  const base = baseTransition(preset, far, d, transition);
  if (surface !== "stage" || d < 1) return base;
  // The stage adds focus: screens arrive out of a blur and leave through a closing wipe.
  return {
    ...base,
    initial: { ...base.initial, filter: "blur(10px)" },
    animate: { ...base.animate, filter: "blur(0px)", clipPath: "inset(0% 0% 0% 0%)" },
    exit: { ...base.exit, clipPath: "inset(0% 0% 100% 0%)" },
    transition: { ...transition, duration: 0.55 },
  };
}

function baseTransition(
  preset: TransitionPreset,
  far: (stage: number, phone: number) => string | number,
  d: number,
  transition: { duration: number; ease: typeof EASE },
): {
  initial: Record<string, string | number>;
  animate: Record<string, string | number>;
  exit: Record<string, string | number>;
  transition: { duration: number; ease: typeof EASE };
} {
  switch (preset) {
    case "RISE":
      return {
        initial: { opacity: 0, y: far(4, 18) },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: far(-2, -10) },
        transition,
      };
    case "FADE":
      return {
        initial: { opacity: 0, scale: 1 - 0.015 * d },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0 },
        transition,
      };
    case "SLIDE":
    default:
      return {
        initial: { opacity: 0, x: far(6, 28) },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: far(-6, -28) },
        transition,
      };
  }
}

/** The active arena (or the default arena outside any provider, e.g. admin screens). */
export function useArena(): ArenaContextValue {
  return useContext(ArenaContext) ?? DEFAULT_CONTEXT;
}

export function arenaStyle(appearance: ArenaAppearance): React.CSSProperties {
  const vars: Record<string, string> = {
    ...arenaCssVariables(appearance),
    ...TYPOGRAPHY[appearance.typography],
    "--arena-scheme": appearance.theme === "WHITE" ? "light" : "dark",
  };
  if (appearance.background === "IMAGE" && appearance.backgroundImageUrl) {
    vars["--arena-image"] = `url(${JSON.stringify(appearance.backgroundImageUrl)})`;
  }
  return vars as React.CSSProperties;
}

export function ArenaThemeProvider({
  appearance,
  children,
  className,
  page = false,
}: {
  appearance: ArenaAppearance | null | undefined;
  children: React.ReactNode;
  className?: string;
  /**
   * Full-page arenas also paint the document behind themselves (overscroll, safe areas,
   * the browser's theme colour) so a white arena never bounces onto a black page.
   */
  page?: boolean;
}) {
  // Every game snapshot carries a fresh appearance object; key on content so the context,
  // the inline style and the <html> tokens only change when the look actually changes.
  const key = JSON.stringify(appearance ?? DEFAULT_APPEARANCE);
  const a = useMemo(() => JSON.parse(key) as ArenaAppearance, [key]);
  const value = useMemo(() => buildContext(a), [a]);
  const style = useMemo(() => arenaStyle(a), [a]);
  const bg = value.colors.bg;

  useEffect(() => {
    if (!page) return;
    const html = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevMeta = meta?.content;
    // The tokens also go on <html> so portalled UI (dialogs, toasts) and the page behind
    // the arena (overscroll, safe areas) are themed too, not just this subtree.
    const vars = Object.entries(style as Record<string, string>);
    for (const [k, v] of vars) html.style.setProperty(k, v);
    html.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    if (meta) meta.content = bg;
    return () => {
      for (const [k] of vars) html.style.removeProperty(k);
      html.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
      if (meta && prevMeta) meta.content = prevMeta;
    };
  }, [page, bg, style]);

  return (
    <ArenaContext.Provider value={value}>
      <div
        className={cn("arena-scope", className)}
        style={style}
        data-arena-theme={a.theme}
        data-arena-bg={a.background}
        data-arena-motion={a.motion}
      >
        {children}
      </div>
    </ArenaContext.Provider>
  );
}
