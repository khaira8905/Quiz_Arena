import { z } from "zod";
import { HEX_COLOR, colorDistance, contrastRatio, inkFor } from "./color";

/**
 * Arena appearance: everything an organiser can customise about how the projector and
 * phones look. Stored per quiz, frozen into each live session with the rest of the quiz.
 *
 * The theme token tables below are the single source of truth: the web app turns them
 * into CSS variables, the server uses them to validate custom colours, and the admin
 * preview renders from the same values.
 */

/**
 * Exactly two themes, one per side of the day/night switch:
 *   BLACK: black and orange. Dark, cinematic, competitive.
 *   WHITE: white and blue. Bright, clean, fast.
 * (A third "Blue" theme existed before; stored arenas that used it read as BLACK.)
 */
export const ARENA_THEMES = ["BLACK", "WHITE"] as const;
export const BACKGROUND_STYLES = ["GRID", "BEAMS", "PLAIN", "IMAGE"] as const;
export const TYPOGRAPHY_PRESETS = ["ARENA", "TECHNICAL", "CLEAN"] as const;
export const MOTION_LEVELS = ["SUBTLE", "NORMAL", "HIGH"] as const;
export const TIMER_STYLES = ["CIRCULAR", "DIGITAL", "PROGRESS", "MINIMAL"] as const;
export const TRANSITION_PRESETS = ["SLIDE", "RISE", "FADE"] as const;
export const PROJECTOR_LAYOUTS = ["STANDARD", "WIDE", "MINIMAL"] as const;
export const PARTICIPANT_LAYOUTS = ["STANDARD", "COMPACT"] as const;

export type ArenaTheme = (typeof ARENA_THEMES)[number];
export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number];
export type TypographyPreset = (typeof TYPOGRAPHY_PRESETS)[number];
export type MotionLevel = (typeof MOTION_LEVELS)[number];
export type TimerStyle = (typeof TIMER_STYLES)[number];
export type TransitionPreset = (typeof TRANSITION_PRESETS)[number];
export type ProjectorLayout = (typeof PROJECTOR_LAYOUTS)[number];
export type ParticipantLayout = (typeof PARTICIPANT_LAYOUTS)[number];

export interface ThemeTokens {
  label: string;
  description: string;
  bg: string;
  surface: string;
  elevated: string;
  sunken: string;
  line: string;
  lineStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  /** Flare / Ion / Sol / Nova equivalents, always paired with letters A–D. */
  answers: readonly [string, string, string, string];
  /** Colour of the arena-floor grid and stage light. */
  floor: string;
  glow: string;
  /** 3D lighting: the rim light on raised faces, and the shadow they cast. */
  light3d: string;
  shadow3d: string;
  /** Which side of the day/night switch this theme is. */
  scheme: "dark" | "light";
}

export const THEME_TOKENS: Record<ArenaTheme, ThemeTokens> = {
  BLACK: {
    label: "Black + Orange",
    description: "Night. Dark, cinematic and competitive. Built for auditoriums and projectors.",
    bg: "#09090b",
    surface: "#121215",
    elevated: "#1b1b20",
    sunken: "#050506",
    line: "#26262d",
    lineStrong: "#3b3b45",
    text: "#f7f4ef",
    textSecondary: "#b6b0a7",
    textMuted: "#948e85",
    // Orange is the signal colour: used sparingly, for what matters right now.
    accent: "#ff7a1a",
    success: "#2fd98a",
    warning: "#ffd23f",
    danger: "#ff5468",
    answers: ["#ff5c5c", "#3db4ff", "#ffd23f", "#a879ff"],
    floor: "#26262d",
    glow: "#ff7a1a",
    light3d: "rgb(255 170 100 / 0.16)",
    shadow3d: "rgb(0 0 0 / 0.72)",
    scheme: "dark",
  },
  WHITE: {
    label: "White + Blue",
    description: "Day. Bright, clean and fast. Reads best in lit rooms and on daylight screens.",
    bg: "#f5f7fb",
    surface: "#ffffff",
    elevated: "#ffffff",
    sunken: "#ecf0f7",
    line: "#dce2ee",
    lineStrong: "#c1cadb",
    text: "#0a0f1f",
    textSecondary: "#384157",
    textMuted: "#566077",
    accent: "#1940dc",
    // Darker than typical "light theme" status colours: small badge text must clear 4.5:1
    // on white and on its own tinted badge background.
    success: "#066b3a",
    warning: "#8a5000",
    danger: "#b01e2b",
    answers: ["#ff5233", "#0a8cff", "#ffb000", "#8a3ffc"],
    floor: "#dce2ee",
    glow: "#1940dc",
    light3d: "rgb(255 255 255 / 0.95)",
    shadow3d: "rgb(16 32 96 / 0.18)",
    scheme: "light",
  },
};

/** The theme on the other side of the day/night switch. */
export const otherTheme = (t: ArenaTheme): ArenaTheme => (t === "BLACK" ? "WHITE" : "BLACK");

const optionalUrl = z
  .union([
    z.url({ protocol: /^https$/, error: "Use an https:// link" }).max(2048),
    z.literal(""),
    z.null(),
  ])
  .transform((v) => (v ? v : null));

const hex = z
  .string()
  .regex(HEX_COLOR, "Use a hex colour like #3355ff")
  .transform((h) => h.toLowerCase());

const appearanceShape = z.object({
  theme: z.enum(ARENA_THEMES).default("BLACK"),
  background: z.enum(BACKGROUND_STYLES).default("GRID"),
  backgroundImageUrl: optionalUrl.default(null),
  accent: hex.nullable().default(null),
  answerColors: z.tuple([hex, hex, hex, hex]).nullable().default(null),
  typography: z.enum(TYPOGRAPHY_PRESETS).default("ARENA"),
  motion: z.enum(MOTION_LEVELS).default("NORMAL"),
  timerStyle: z.enum(TIMER_STYLES).default("CIRCULAR"),
  transition: z.enum(TRANSITION_PRESETS).default("SLIDE"),
  leaderboardAnimation: z.boolean().default(true),
  projectorLayout: z.enum(PROJECTOR_LAYOUTS).default("STANDARD"),
  participantLayout: z.enum(PARTICIPANT_LAYOUTS).default("STANDARD"),
  eventName: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(60))
    .default(""),
  logoUrl: optionalUrl.default(null),
});

export type ArenaAppearance = z.infer<typeof appearanceShape>;

/** Readability limits for custom colours. Organisers can customise, not break, the arena. */
export const ACCENT_MIN_CONTRAST = 3;
export const ANSWER_MIN_INK_CONTRAST = 4.5;
export const ANSWER_MIN_BG_CONTRAST = 1.3;
export const ANSWER_MIN_DISTANCE = 70;

export function appearanceIssues(a: ArenaAppearance): { path: string; message: string }[] {
  const t = THEME_TOKENS[a.theme];
  const issues: { path: string; message: string }[] = [];
  if (a.accent && contrastRatio(a.accent, t.bg) < ACCENT_MIN_CONTRAST) {
    issues.push({
      path: "accent",
      message: `This accent is too close to the ${t.label.toLowerCase()} background to read.`,
    });
  }
  if (a.answerColors) {
    a.answerColors.forEach((c, i) => {
      const letter = "ABCD"[i];
      if (contrastRatio(c, inkFor(c)) < ANSWER_MIN_INK_CONTRAST) {
        issues.push({
          path: `answerColors.${i}`,
          message: `Answer ${letter}: text won't be readable on this colour.`,
        });
      } else if (contrastRatio(c, t.bg) < ANSWER_MIN_BG_CONTRAST) {
        issues.push({
          path: `answerColors.${i}`,
          message: `Answer ${letter} blends into the background.`,
        });
      }
    });
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        if (colorDistance(a.answerColors[i]!, a.answerColors[j]!) < ANSWER_MIN_DISTANCE) {
          issues.push({
            path: `answerColors.${j}`,
            message: `Answers ${"ABCD"[i]} and ${"ABCD"[j]} are too similar to tell apart.`,
          });
        }
  }
  if (a.background === "IMAGE" && !a.backgroundImageUrl) {
    issues.push({
      path: "backgroundImageUrl",
      message: "Add an image URL or pick another background.",
    });
  }
  return issues;
}

export const arenaAppearanceSchema = appearanceShape.superRefine((a, ctx) => {
  for (const issue of appearanceIssues(a)) {
    ctx.addIssue({ code: "custom", path: issue.path.split("."), message: issue.message });
  }
});

export const DEFAULT_APPEARANCE: ArenaAppearance = appearanceShape.parse({});

/** Tolerant read for stored values: anything missing or invalid falls back to defaults. */
export function resolveAppearance(stored: unknown): ArenaAppearance {
  const merged: Record<string, unknown> = {
    ...DEFAULT_APPEARANCE,
    ...(typeof stored === "object" && stored ? stored : {}),
  };
  // The retired Blue theme was a dark one: it becomes Black + Orange.
  if (merged.theme === "BLUE") merged.theme = "BLACK";
  const parsed = arenaAppearanceSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
}

export interface ResolvedArenaColors extends ThemeTokens {
  accentInk: string;
  answerInks: [string, string, string, string];
}

/** Theme tokens with the organiser's overrides applied, plus computed text-on-fill colours. */
export function resolveArenaColors(a: ArenaAppearance): ResolvedArenaColors {
  const base = THEME_TOKENS[a.theme];
  const accent = a.accent ?? base.accent;
  const answers = (a.answerColors ?? base.answers) as [string, string, string, string];
  return {
    ...base,
    accent,
    glow: a.accent ?? base.glow,
    answers,
    accentInk: inkFor(accent),
    answerInks: answers.map(inkFor) as [string, string, string, string],
  };
}

/**
 * CSS custom properties for an arena surface. The semantic names (--background, --accent…)
 * are what every component already uses, so re-declaring them on a wrapper re-themes the
 * whole subtree; the --arena-* aliases are the documented public token names.
 */
export function arenaCssVariables(a: ArenaAppearance): Record<string, string> {
  const c = resolveArenaColors(a);
  const vars: Record<string, string> = {
    "--background": c.bg,
    "--surface": c.surface,
    "--surface-elevated": c.elevated,
    "--surface-sunken": c.sunken,
    "--line": c.line,
    "--line-strong": c.lineStrong,
    "--text-primary": c.text,
    "--text-secondary": c.textSecondary,
    "--text-muted": c.textMuted,
    "--text-inverse": c.bg,
    "--accent": c.accent,
    "--accent-strong": `color-mix(in oklab, ${c.accent} 85%, ${c.text})`,
    "--accent-soft": `color-mix(in oklab, ${c.accent} 14%, transparent)`,
    "--accent-ink": c.accentInk,
    "--focus-ring": c.accent,
    "--success": c.success,
    "--success-soft": `color-mix(in oklab, ${c.success} 16%, transparent)`,
    "--warning": c.warning,
    "--warning-soft": `color-mix(in oklab, ${c.warning} 16%, transparent)`,
    "--danger": c.danger,
    "--danger-soft": `color-mix(in oklab, ${c.danger} 16%, transparent)`,
    "--arena-floor": c.floor,
    "--arena-glow": c.glow,
    "--arena-3d-light": c.light3d,
    "--arena-3d-shadow": c.shadow3d,
  };
  c.answers.forEach((color, i) => {
    vars[`--answer-${i + 1}`] = color;
    vars[`--answer-ink-${i + 1}`] = c.answerInks[i]!;
  });
  // Public aliases.
  Object.assign(vars, {
    "--arena-bg": c.bg,
    "--arena-surface": c.surface,
    "--arena-surface-2": c.elevated,
    "--arena-border": c.line,
    "--arena-text": c.text,
    "--arena-muted": c.textMuted,
    "--arena-accent": c.accent,
    "--arena-accent-soft": `color-mix(in oklab, ${c.accent} 14%, transparent)`,
    "--arena-shadow": c.shadow3d,
    "--arena-success": c.success,
    "--arena-danger": c.danger,
    "--arena-answer-1": c.answers[0],
    "--arena-answer-2": c.answers[1],
    "--arena-answer-3": c.answers[2],
    "--arena-answer-4": c.answers[3],
  });
  return vars;
}
