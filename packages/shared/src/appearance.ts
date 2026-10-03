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

export const ARENA_THEMES = ["BLACK", "BLUE", "WHITE"] as const;
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
}

export const THEME_TOKENS: Record<ArenaTheme, ThemeTokens> = {
  BLACK: {
    label: "Black",
    description: "Cinematic and high contrast. Built for dark auditoriums and projectors.",
    bg: "#07080c",
    surface: "#0f1118",
    elevated: "#171a24",
    sunken: "#050609",
    line: "#222632",
    lineStrong: "#353b4b",
    text: "#f2f4f8",
    textSecondary: "#a2a9ba",
    textMuted: "#80879a",
    accent: "#c6ff34",
    success: "#2be38b",
    warning: "#ffb224",
    danger: "#ff4d5e",
    answers: ["#ff5a3c", "#2bb3ff", "#ffc93c", "#c25bff"],
    floor: "#222632",
    glow: "#c6ff34",
  },
  BLUE: {
    label: "Blue",
    description: "Electric and competitive. A deep-navy stage with a cyan signal colour.",
    bg: "#06102b",
    surface: "#0c1a3f",
    elevated: "#13245a",
    sunken: "#040b1f",
    line: "#1b2d63",
    lineStrong: "#2b4386",
    text: "#eef3ff",
    textSecondary: "#aebddf",
    textMuted: "#8a9ccc",
    accent: "#45d8ff",
    success: "#3ee39c",
    warning: "#ffb733",
    danger: "#ff6270",
    answers: ["#ff6250", "#ffb733", "#3ee39c", "#b591ff"],
    floor: "#1b2d63",
    glow: "#45d8ff",
  },
  WHITE: {
    label: "White",
    description: "Bright and clean. Reads best in lit classrooms and on daylight screens.",
    bg: "#f4f5f9",
    surface: "#ffffff",
    elevated: "#ffffff",
    sunken: "#eceef4",
    line: "#dde1eb",
    lineStrong: "#c2c8d8",
    text: "#0c0e16",
    textSecondary: "#3d4457",
    textMuted: "#5b6377",
    accent: "#2443ff",
    // Darker than typical "light theme" status colours: small badge text must clear 4.5:1
    // on white and on its own tinted badge background.
    success: "#066b3a",
    warning: "#8a5000",
    danger: "#b01e2b",
    answers: ["#ff5233", "#2560f0", "#ffb000", "#8a3ffc"],
    floor: "#dde1eb",
    glow: "#2443ff",
  },
};

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
  const merged = { ...DEFAULT_APPEARANCE, ...(typeof stored === "object" && stored ? stored : {}) };
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
  };
  c.answers.forEach((color, i) => {
    vars[`--answer-${i + 1}`] = color;
    vars[`--answer-ink-${i + 1}`] = c.answerInks[i]!;
  });
  // Public aliases.
  Object.assign(vars, {
    "--arena-bg": c.bg,
    "--arena-surface": c.surface,
    "--arena-border": c.line,
    "--arena-text": c.text,
    "--arena-muted": c.textMuted,
    "--arena-accent": c.accent,
    "--arena-success": c.success,
    "--arena-danger": c.danger,
    "--arena-answer-1": c.answers[0],
    "--arena-answer-2": c.answers[1],
    "--arena-answer-3": c.answers[2],
    "--arena-answer-4": c.answers[3],
  });
  return vars;
}
