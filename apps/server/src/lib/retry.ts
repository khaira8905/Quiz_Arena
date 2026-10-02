/**
 * Runs `fn`, retrying after each delay in `delaysMs` when it rejects. Used for writes that
 * must survive a database blip (a cold Neon compute, a pool timeout) without blocking the
 * game: the caller fires it and moves on.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  delaysMs: readonly number[],
  onRetry?: (err: unknown, attempt: number) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = delaysMs[attempt];
      if (delay === undefined) throw err;
      onRetry?.(err, attempt + 1);
      await new Promise((r) => setTimeout(r, delay).unref?.());
    }
  }
}
