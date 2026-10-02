import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors";
import { LoginThrottle, PasswordGate } from "../src/lib/login-guard";

describe("login guard", () => {
  it("locks an account after five failures, whatever IP they come from", () => {
    const t = new LoginThrottle();
    const now = Date.now();
    for (let i = 0; i < 4; i++) t.failed("ada@x.dev", now);
    expect(() => t.assertAllowed("ada@x.dev", now)).not.toThrow();
    t.failed("ada@x.dev", now);
    expect(() => t.assertAllowed("ada@x.dev", now)).toThrow(AppError);
    expect(() => t.assertAllowed("ada@x.dev", now + 16 * 60_000)).not.toThrow();
    expect(() => t.assertAllowed("grace@x.dev", now)).not.toThrow();
  });

  it("a successful sign-in clears the failure count", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 4; i++) t.failed("ada@x.dev");
    t.succeeded("ada@x.dev");
    t.failed("ada@x.dev");
    expect(() => t.assertAllowed("ada@x.dev")).not.toThrow();
  });

  it("runs at most two hashes at once and refuses beyond a short queue", async () => {
    const gate = new PasswordGate(2, 1);
    let running = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const job = () =>
      gate.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise<void>((r) => release.push(r));
        running--;
      });
    const a = job();
    const b = job();
    const c = job(); // queued
    await expect(job()).rejects.toMatchObject({ code: "RATE_LIMITED" });
    while (release.length) {
      release.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all([a, b, c]);
    expect(peak).toBe(2);
  });
});
