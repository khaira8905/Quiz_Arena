import { ERROR_COPY, type ErrorCode } from "@quizarena/shared";

const STATUS: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 400,
  NICKNAME_INVALID: 400,
  ANSWER_INVALID: 400,
  QUIZ_EMPTY: 400,
  UNAUTHORIZED: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_GAME_CODE: 404,
  CONFLICT: 409,
  NICKNAME_TAKEN: 409,
  ANSWER_DUPLICATE: 409,
  COMMAND_NOT_ALLOWED: 409,
  COMMAND_OUT_OF_DATE: 409,
  GAME_ALREADY_STARTED: 409,
  GAME_ENDED: 410,
  ANSWER_TOO_LATE: 409,
  QUESTION_NOT_ACTIVE: 409,
  PARTICIPANT_LIMIT: 409,
  RATE_LIMITED: 429,
  MEDIA_UNAVAILABLE: 503,
  UNSUPPORTED_MEDIA: 415,
  FILE_TOO_LARGE: 413,
  GOOGLE_NOT_CONNECTED: 409,
};

/** An expected, user-facing failure. Anything else is treated as an internal error. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_COPY[code].message);
    this.status = STATUS[code] ?? 500;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
