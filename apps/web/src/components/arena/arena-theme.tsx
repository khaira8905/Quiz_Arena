"use client";

import {
  type ArenaAppearance,
  type MotionLevel,
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
  /** Wide geometric display over a neutral grotesk: the default arena voice. */
  ARENA: {
    "--display-family": "var(--font-sora)",
    "--body-family": "var(--font-geist)",
    "--mono-family": "var(--font-geist-mono)",
  },
  /** Squarer, engineered display with mono details: esports / hackathon energy. */
  TECHNICAL: {
    "--display-family": "var(--font-space-grotesk)",
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
  const a = appearance ?? DEFAULT_APPEARANCE;
  const value = useMemo(() => buildContext(a), [a]);
  const style = useMemo(() => arenaStyle(a), [a]);
  const bg = value.colors.bg;

  useEffect(() => {
    if (!page) return;
    const html = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prev = { bg: html.style.backgroundColor, meta: meta?.content };
    html.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    if (meta) meta.content = bg;
    return () => {
      html.style.backgroundColor = prev.bg;
      document.body.style.backgroundColor = "";
      if (meta && prev.meta) meta.content = prev.meta;
    };
  }, [page, bg]);

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
