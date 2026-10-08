import type { Frame } from "@attune/engine";

/**
 * Turns what the learner typed (or said) in the check-in into a few keywords, on the device.
 * The free text itself is never stored or sent; only the keywords become part of the model,
 * and the learner sees exactly which ones were picked up and can remove them.
 */

const INTEREST_WORDS: Record<Frame, string[]> = {
  cricket: ["cricket", "ipl", "t20", "wicket", "auction", "kohli", "batting", "bowling", "match"],
  music: [
    "music",
    "song",
    "songs",
    "spotify",
    "track",
    "band",
    "guitar",
    "piano",
    "concert",
    "beat",
    "producer",
  ],
  gaming: [
    "game",
    "games",
    "gaming",
    "valorant",
    "minecraft",
    "bgmi",
    "xbox",
    "playstation",
    "ps5",
    "steam",
    "xp",
  ],
  startups: [
    "startup",
    "startups",
    "business",
    "money",
    "invest",
    "investing",
    "stocks",
    "shark tank",
    "founder",
    "brand",
  ],
  space: [
    "space",
    "moon",
    "rocket",
    "isro",
    "nasa",
    "planet",
    "planets",
    "stars",
    "galaxy",
    "astronomy",
    "fold",
    "folding",
  ],
};

export interface Intake {
  interests: Frame[];
  /** Plain-language list of what was picked up, shown back to the learner. */
  heard: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function readIntake(...texts: string[]): Intake {
  const text = texts.join(" ").toLowerCase();
  const interests: Frame[] = [];
  const heard: string[] = [];
  for (const [frame, words] of Object.entries(INTEREST_WORDS) as [Frame, string[]][]) {
    const hit = words.find((w) => new RegExp(`\\b${escape(w)}\\b`).test(text));
    if (hit) {
      interests.push(frame);
      heard.push(hit === frame ? frame : `${frame} (“${hit}”)`);
    }
  }
  return { interests, heard };
}

export type GoalKind = "assignment" | "catch-up" | "test" | "open";

export function readGoal(text: string): { kind: GoalKind; label: string } {
  const t = text.toLowerCase();
  if (/\b(catch|missed|behind|absent)\b/.test(t))
    return { kind: "catch-up", label: "Catch up on exponents & logs" };
  if (/\b(test|exam|quiz|revise|revision)\b/.test(t))
    return { kind: "test", label: "Revise for a test" };
  if (/\b(log|logs|logarithm|exponent|exponents|assignment|worksheet|homework)\b/.test(t)) {
    return { kind: "assignment", label: text.trim().slice(0, 60) || "Logs assignment" };
  }
  return { kind: "open", label: text.trim().slice(0, 60) || "Exponents & logarithms" };
}
