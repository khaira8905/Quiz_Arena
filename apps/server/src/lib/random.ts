import { randomBytes, randomInt } from "node:crypto";
import { GAME_CODE_DIGITS, GAME_CODE_PREFIX } from "@quizarena/shared";

export function generateGameCode(): string {
  return `${GAME_CODE_PREFIX}${randomInt(0, 10 ** GAME_CODE_DIGITS)
    .toString()
    .padStart(GAME_CODE_DIGITS, "0")}`;
}

/** Collision-resistant id for in-memory entities that are later persisted. */
export function newId(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

/** Fisher–Yates with a crypto RNG — predictable shuffles would leak answer positions. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
