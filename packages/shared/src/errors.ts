/** Stable error codes shared by REST and socket responses. The UI maps these to copy. */
export const ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL",
  "INVALID_GAME_CODE",
  "GAME_ALREADY_STARTED",
  "GAME_ENDED",
  "NICKNAME_TAKEN",
  "NICKNAME_INVALID",
  "PARTICIPANT_LIMIT",
  "SESSION_EXPIRED",
  "ANSWER_TOO_LATE",
  "ANSWER_DUPLICATE",
  "ANSWER_INVALID",
  "QUESTION_NOT_ACTIVE",
  "COMMAND_NOT_ALLOWED",
  "QUIZ_EMPTY",
  "REPLACED_BY_NEW_CONNECTION",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export const ERROR_COPY: Record<ErrorCode, { title: string; message: string }> = {
  BAD_REQUEST: { title: "Something's off", message: "That request couldn't be processed." },
  UNAUTHORIZED: { title: "Sign in required", message: "Please sign in to continue." },
  FORBIDDEN: { title: "Not allowed", message: "You don't have access to this." },
  NOT_FOUND: { title: "Not found", message: "We couldn't find what you were looking for." },
  CONFLICT: { title: "Conflict", message: "That change conflicts with the current state." },
  RATE_LIMITED: { title: "Slow down", message: "Too many attempts. Try again in a moment." },
  INTERNAL: { title: "Server error", message: "Something went wrong on our side." },
  INVALID_GAME_CODE: {
    title: "No arena found",
    message: "Check the code on the big screen and try again.",
  },
  GAME_ALREADY_STARTED: {
    title: "Game in progress",
    message: "This game has already started and isn't accepting new players.",
  },
  GAME_ENDED: { title: "Game over", message: "This game has already finished." },
  NICKNAME_TAKEN: { title: "Name taken", message: "Someone in this arena already uses that name." },
  NICKNAME_INVALID: { title: "Pick another name", message: "That nickname isn't allowed." },
  PARTICIPANT_LIMIT: { title: "Arena full", message: "This game has reached its player limit." },
  SESSION_EXPIRED: {
    title: "Session expired",
    message: "Your seat expired. Join again with the code.",
  },
  ANSWER_TOO_LATE: { title: "Too late", message: "Time ran out before your answer arrived." },
  ANSWER_DUPLICATE: {
    title: "Already locked in",
    message: "You've already answered this question.",
  },
  ANSWER_INVALID: { title: "Invalid answer", message: "That answer isn't part of this question." },
  QUESTION_NOT_ACTIVE: { title: "Question closed", message: "This question is no longer open." },
  COMMAND_NOT_ALLOWED: { title: "Not now", message: "That action isn't available at this stage." },
  QUIZ_EMPTY: { title: "Empty quiz", message: "Add at least one question before going live." },
  REPLACED_BY_NEW_CONNECTION: {
    title: "Opened elsewhere",
    message: "You joined this game from another tab or device.",
  },
};
