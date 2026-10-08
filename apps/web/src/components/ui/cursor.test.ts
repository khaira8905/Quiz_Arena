import { afterEach, describe, expect, it, vi } from "vitest";
import { cursorPreference } from "./cursor";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("cursor preference", () => {
  it("is on until someone switches it off, and remembers the choice", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(cursorPreference.get()).toBe(true);
    cursorPreference.set(false);
    expect(cursorPreference.get()).toBe(false);
    cursorPreference.set(true);
    expect(cursorPreference.get()).toBe(true);
  });

  it("tells subscribers about changes until they unsubscribe", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const heard = vi.fn();
    const stop = cursorPreference.subscribe(heard);
    cursorPreference.set(false);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    cursorPreference.set(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("falls back to on when storage is unavailable (private mode)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(cursorPreference.get()).toBe(true);
    expect(() => cursorPreference.set(false)).not.toThrow();
  });

  it("renders nothing on the server", () => {
    expect(cursorPreference.getServer()).toBe(false);
  });
});
