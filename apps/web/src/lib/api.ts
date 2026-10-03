import type { ApiErrorBody, ErrorCode } from "@quizarena/shared/errors";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    /** True when the API itself answered with an error body (vs. a proxy or network failure). */
    readonly fromApi = false,
  ) {
    super(message);
  }
}

/**
 * Same-origin fetch to `/api/*` (proxied to the API server by next.config rewrites), so the
 * httpOnly session cookie is sent automatically and never touched by JavaScript.
 */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "INTERNAL", "Can't reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? (res.status >= 500 ? "INTERNAL" : "BAD_REQUEST"),
      err?.message ??
        (res.status >= 500 ? "The server is unavailable right now." : "Request failed."),
      err?.details,
      !!err,
    );
  }
  return body as T;
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
