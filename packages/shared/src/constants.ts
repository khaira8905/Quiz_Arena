/** Timer presets offered in the editor (seconds). Custom values are clamped to the bounds below. */
export const TIMER_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;
export const TIMER_MIN_SECONDS = 5;
export const TIMER_MAX_SECONDS = 300;
export const DEFAULT_TIMER_SECONDS = 20;

/** Point presets per question. 0 = practice question, 2000 = double points. */
export const POINT_PRESETS = [0, 500, 1000, 2000] as const;
export const DEFAULT_POINTS = 1000;
export const MAX_POINTS = 5000;

export const PARTICIPANT_LIMIT_DEFAULT = 200;
export const PARTICIPANT_LIMIT_MAX = 1000;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

export const QUESTION_TEXT_MAX = 280;
export const OPTION_TEXT_MAX = 120;
export const EXPLANATION_MAX = 500;
export const QUIZ_TITLE_MAX = 120;
export const QUIZ_DESCRIPTION_MAX = 1000;
export const MAX_QUESTIONS_PER_QUIZ = 100;

/** Game codes look like QA4821: fixed prefix + 4 digits. Easy to read aloud from a stage. */
export const GAME_CODE_PREFIX = "QA";
export const GAME_CODE_PATTERN = /^QA\d{4}$/;

/**
 * Grace window (ms) after the server deadline during which an answer still counts.
 * Covers network transit for an answer the player sent just before zero — the client
 * stops accepting input at its own zero, so this never extends the visible timer.
 */
export const ANSWER_GRACE_MS = 350;

/** Length of the "3-2-1" game-start sequence. */
export const START_COUNTDOWN_MS = 4_500;

/** How long a disconnected player is kept in the lobby before being removed. */
export const LOBBY_DISCONNECT_GRACE_MS = 30_000;

/** Answer option identity is never colour-only: every option also carries a letter and a key. */
export const ANSWER_LETTERS = ["A", "B", "C", "D"] as const;
