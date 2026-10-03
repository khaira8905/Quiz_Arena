import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { isServerWaking, withWake } from "./server-wake";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("server wake-up", () => {
  it("treats proxy/network failures as waking, real errors as real", () => {
    expect(isServerWaking(new ApiError(504, "INTERNAL", "timeout"))).toBe(true);
    expect(isServerWaking(new ApiError(0, "INTERNAL", "offline"))).toBe(true);
    expect(isServerWaking(new ApiError(401, "UNAUTHORIZED", "no"))).toBe(false);
    expect(isServerWaking(new ApiError(404, "INVALID_GAME_CODE", "no"))).toBe(false);
    // A proxy 500 (no API error body) is waking; the API's own 500 is a real error.
    expect(isServerWaking(new ApiError(500, "INTERNAL", "proxy"))).toBe(true);
    expect(isServerWaking(new ApiError(500, "INTERNAL", "bug", undefined, true))).toBe(false);
  });

  it("retries while the server wakes and reports the wait once", async () => {
    let calls = 0;
    const onWaiting = vi.fn();
    const result = withWake(
      async () => {
        calls++;
        if (calls < 4) throw new ApiError(502, "INTERNAL", "bad gateway");
        return "awake";
      },
      { onWaiting },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toBe("awake");
    expect(calls).toBe(4);
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it("does not retry real errors, and gives up after the budget", async () => {
    await expect(
      withWake(async () => {
        throw new ApiError(404, "INVALID_GAME_CODE", "nope");
      }),
    ).rejects.toMatchObject({ status: 404 });

    const slow = withWake(
      async () => {
        throw new ApiError(503, "INTERNAL", "down");
      },
      { budgetMs: 5_000 },
    );
    const settled = expect(slow).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
  });
});
