/**
 * Per-socket token bucket. A real player produces a handful of events per question; anything
 * far above that is a script, so excess events are rejected without touching the engine.
 */
export class TokenBucket {
  private tokens: number;
  private updated = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
  }

  take(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.updated) / 1000) * this.refillPerSecond);
    this.updated = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
