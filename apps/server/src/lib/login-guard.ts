import { AppError } from "./errors";

/**
 * bcrypt is deliberately slow, and on a small instance a burst of login attempts would starve
 * the event loop that runs every live game. Password hashing therefore goes through a tiny
 * semaphore: a couple at a time, a short queue, and anything beyond that is refused (429)
 * instead of queued. This holds no matter which IP the requests claim to come from.
 */
export class PasswordGate {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly concurrency = 2,
    private readonly maxQueue = 8,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.queue.length >= this.maxQueue)
        throw new AppError("RATE_LIMITED", "The server is busy. Try again in a moment.");
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

/**
 * Per-account failed-login throttle: 5 wrong passwords in 15 minutes locks that email for
 * 15 minutes. Keyed by account rather than IP, so spoofed or rotating addresses don't reset it.
 */
export class LoginThrottle {
  private readonly entries = new Map<
    string,
    { failures: number; since: number; lockedUntil: number }
  >();

  assertAllowed(email: string, now = Date.now()) {
    const e = this.entries.get(email);
    if (e && e.lockedUntil > now) {
      const minutes = Math.ceil((e.lockedUntil - now) / 60_000);
      throw new AppError(
        "RATE_LIMITED",
        `Too many failed sign-ins for this account. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }
  }

  failed(email: string, now = Date.now()) {
    let e = this.entries.get(email);
    if (!e || now - e.since > WINDOW_MS) e = { failures: 0, since: now, lockedUntil: 0 };
    e.failures += 1;
    if (e.failures >= MAX_FAILURES) e.lockedUntil = now + LOCK_MS;
    this.entries.delete(email);
    this.entries.set(email, e);
    // Map iteration is insertion order: drop the stalest entries first.
    while (this.entries.size > MAX_TRACKED) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  succeeded(email: string) {
    this.entries.delete(email);
  }
}
