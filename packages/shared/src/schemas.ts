import { z } from "zod";
import {
  DEFAULT_POINTS,
  DEFAULT_TIMER_SECONDS,
  EXPLANATION_MAX,
  GAME_CODE_PATTERN,
  MAX_POINTS,
  NICKNAME_MAX,
  OPTION_TEXT_MAX,
  PARTICIPANT_LIMIT_DEFAULT,
  PARTICIPANT_LIMIT_MAX,
  QUESTION_TEXT_MAX,
  QUIZ_DESCRIPTION_MAX,
  QUIZ_TITLE_MAX,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
} from "./constants";
import { HOST_COMMANDS } from "./game";
import { QUESTION_TYPES, QUESTION_TYPE_RULES } from "./question-types";
import { SCORING_MODES } from "./scoring";

/** Collapses control characters and trims — stored text is always plain text. */
const plainText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max));

const imageUrl = z
  .union([z.url({ protocol: /^https?$/ }).max(2048), z.literal(""), z.null()])
  .transform((v) => (v ? v : null));

const cuid = z.string().min(1).max(64);

/* ------------------------------------------------------------------ auth */

export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  name: plainText(80).pipe(z.string().min(1)),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const profileUpdateSchema = z
  .object({
    name: plainText(80).pipe(z.string().min(1)).optional(),
    currentPassword: z.string().max(200).optional(),
    newPassword: z.string().min(10, "Use at least 10 characters").max(200).optional(),
  })
  .refine((v) => !v.newPassword || !!v.currentPassword, {
    message: "Current password is required to set a new one",
    path: ["currentPassword"],
  });
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/* ------------------------------------------------------------------ quizzes */

export const timerSeconds = z.number().int().min(TIMER_MIN_SECONDS).max(TIMER_MAX_SECONDS);

export const quizSettingsSchema = z.object({
  defaultTimerSec: timerSeconds.default(DEFAULT_TIMER_SECONDS),
  scoringMode: z.enum(SCORING_MODES).default("SPEED"),
  streakBonus: z.boolean().default(true),
  randomizeQuestions: z.boolean().default(false),
  randomizeAnswers: z.boolean().default(false),
  showLeaderboard: z.boolean().default(true),
  showCorrectAnswers: z.boolean().default(true),
  showAnswerStats: z.boolean().default(true),
  allowLateJoin: z.boolean().default(false),
  participantLimit: z
    .number()
    .int()
    .min(2)
    .max(PARTICIPANT_LIMIT_MAX)
    .default(PARTICIPANT_LIMIT_DEFAULT),
  soundEnabled: z.boolean().default(true),
  nicknameFilter: z.boolean().default(true),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const quizCreateSchema = z.object({
  title: plainText(QUIZ_TITLE_MAX).pipe(z.string().min(1, "Give your quiz a title")),
  description: plainText(QUIZ_DESCRIPTION_MAX).optional().default(""),
});
export type QuizCreateInput = z.infer<typeof quizCreateSchema>;

export const quizUpdateSchema = quizSettingsSchema.partial().extend({
  title: plainText(QUIZ_TITLE_MAX).pipe(z.string().min(1, "Give your quiz a title")).optional(),
  description: plainText(QUIZ_DESCRIPTION_MAX).optional(),
  coverImageUrl: imageUrl.optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});
export type QuizUpdateInput = z.infer<typeof quizUpdateSchema>;

/* ------------------------------------------------------------------ questions */

export const optionInputSchema = z.object({
  text: plainText(OPTION_TEXT_MAX),
  isCorrect: z.boolean(),
});

const questionBase = z.object({
  type: z.enum(QUESTION_TYPES),
  text: plainText(QUESTION_TEXT_MAX),
  imageUrl: imageUrl.optional().default(null),
  timeLimitSec: timerSeconds.nullable().optional().default(null),
  points: z.number().int().min(0).max(MAX_POINTS).default(DEFAULT_POINTS),
  explanation: plainText(EXPLANATION_MAX).optional().default(""),
  randomizeAnswers: z.boolean().default(false),
  options: z.array(optionInputSchema).min(2).max(4),
});

/**
 * Drafts may be incomplete (empty text, no correct answer yet) so the editor can autosave
 * freely. Structural rules (option counts per type) always apply. Completeness is checked
 * separately by `questionIssues` before a quiz can be published or played.
 */
export const questionInputSchema = questionBase.superRefine((q, ctx) => {
  const rules = QUESTION_TYPE_RULES[q.type];
  if (q.options.length < rules.minOptions || q.options.length > rules.maxOptions) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: `${rules.label} questions need ${rules.minOptions}–${rules.maxOptions} options`,
    });
  }
  if (q.options.filter((o) => o.isCorrect).length > 1) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Only one option can be correct" });
  }
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionUpdateSchema = questionBase.partial();
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

export const reorderSchema = z.object({
  questionIds: z.array(cuid).min(1).max(500),
});

/** Human-readable problems that block a question from going live. */
export function questionIssues(q: {
  type: (typeof QUESTION_TYPES)[number];
  text: string;
  options: { text: string; isCorrect: boolean }[];
}): string[] {
  const issues: string[] = [];
  const rules = QUESTION_TYPE_RULES[q.type];
  if (!q.text.trim()) issues.push("Question text is empty");
  if (q.options.length < rules.minOptions)
    issues.push(`Needs at least ${rules.minOptions} options`);
  if (q.options.some((o) => !o.text.trim())) issues.push("Every option needs text");
  if (q.options.filter((o) => o.isCorrect).length !== 1)
    issues.push("Mark exactly one correct answer");
  return issues;
}

/* ------------------------------------------------------------------ sessions */

export const sessionCreateSchema = z.object({ quizId: cuid });

export const gameCodeSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(GAME_CODE_PATTERN, "Game codes look like QA4821"));

/* ------------------------------------------------------------------ socket payloads */

export const joinPayloadSchema = z.object({
  code: gameCodeSchema,
  nickname: z.string().max(NICKNAME_MAX * 4),
});

export const reconnectPayloadSchema = z.object({
  code: gameCodeSchema,
  token: z.string().min(16).max(128),
});

export const answerPayloadSchema = z.object({
  questionId: cuid,
  optionId: cuid,
});

export const hostAttachSchema = z.object({ code: gameCodeSchema });

export const hostCommandSchema = z.object({
  code: gameCodeSchema,
  command: z.enum(HOST_COMMANDS),
});

export const hostKickSchema = z.object({ code: gameCodeSchema, participantId: cuid });
