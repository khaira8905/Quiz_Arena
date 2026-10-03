import { isApiError } from "./api";
import { REALTIME_URL } from "./socket";

/**
 * Free hosting puts the game server to sleep after ~15 idle minutes; the first request then
 * takes 20-60s while it boots, and the proxy in front of it answers 502/503/504 meanwhile.
 * Those failures mean "wait", not "broken", so callers retry through them while telling the
 * user what is happening.
 */
const WAKING_STATUSES = new Set([0, 502, 503, 504]);

export function isServerWaking(err: unknown): boolean {
  if (!isApiError(err)) return false;
  // Any 5xx that didn't come from the API's own error format is the proxy reporting an
  // unreachable upstream (Next answers 500 locally, Vercel 502/504).
  return WAKING_STATUSES.has(err.status) || (err.status >= 500 && !err.fromApi);
}

/** How long to keep trying before admitting the server is down. */
export const WAKE_BUDGET_MS = 90_000;
export const WAKE_RETRY_MS = 3_000;
/** Retry count for TanStack Query that roughly matches WAKE_BUDGET_MS. */
export const WAKE_RETRIES = Math.ceil(WAKE_BUDGET_MS / WAKE_RETRY_MS);

/**
 * Runs `fn`, retrying while the server is waking. `onWaiting` fires once the first attempt
 * has failed that way, so the UI can switch to a "waking up" message.
 */
export async function withWake<T>(
  fn: () => Promise<T>,
  { onWaiting, budgetMs = WAKE_BUDGET_MS }: { onWaiting?: () => void; budgetMs?: number } = {},
): Promise<T> {
  const started = Date.now();
  let notified = false;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isServerWaking(err) || Date.now() - started > budgetMs) throw err;
      if (!notified) {
        notified = true;
        onWaiting?.();
      }
      await new Promise((r) => setTimeout(r, WAKE_RETRY_MS));
    }
  }
}

/**
 * Starts waking the game server without waiting for it: pages people open just before
 * playing (landing, join, sign-in) call this so the server is up by the time it's needed.
 */
export function pokeServer() {
  try {
    void fetch(`${REALTIME_URL.replace(/\/$/, "")}/health`, {
      mode: "no-cors",
      cache: "no-store",
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}
