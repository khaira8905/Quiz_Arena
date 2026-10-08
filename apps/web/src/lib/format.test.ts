import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  displayHost,
  formatClock,
  formatNumber,
  formatPercent,
  formatSeconds,
  joinUrl,
  ordinal,
  pad2,
  timeAgo,
} from "./format";

describe("display formatting", () => {
  it("formats scores and counts", () => {
    expect(formatNumber(1350)).toBe("1,350");
    expect(pad2(4)).toBe("04");
    expect(pad2(12)).toBe("12");
    expect(formatPercent(0.614)).toBe("61%");
    expect(formatSeconds(1234)).toBe("1.2s");
    expect(formatSeconds(null)).toBe("—");
  });

  it("rounds the clock up, so 1 shows until the true zero", () => {
    expect(formatClock(20_000)).toBe("00:20");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-500)).toBe("00:00");
    expect(formatClock(75_000)).toBe("01:15");
  });

  it("writes ordinals for leaderboard places, including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });

  it("shows the join address without protocol or query", () => {
    expect(displayHost("https://quiz.example.com/play?game=QA123456")).toBe(
      "quiz.example.com/play",
    );
  });
});

describe("relative time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("speaks in minutes, hours and days, then falls back to a date", () => {
    expect(timeAgo("2026-10-08T11:59:30Z")).toBe("just now");
    expect(timeAgo("2026-10-08T11:55:00Z")).toBe("5 minutes ago");
    expect(timeAgo("2026-10-08T09:00:00Z")).toBe("3 hours ago");
    expect(timeAgo("2026-10-07T12:00:00Z")).toBe("yesterday");
    expect(timeAgo("2026-07-01T12:00:00Z")).toBe("Jul 1, 2026");
  });
});

describe("join link", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the public site URL without a doubled slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://quiz.example.com/");
    expect(joinUrl("QA123456")).toBe("https://quiz.example.com/play?game=QA123456");
  });
});
