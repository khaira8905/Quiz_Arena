import { NICKNAME_MAX, NICKNAME_MIN } from "./constants";

/**
 * Small, deliberately conservative blocklist. It is matched against a normalised form
 * (lowercase, leetspeak folded, separators removed) so trivial evasions are caught.
 * Organisers can disable filtering per quiz.
 */
const BLOCKED_FRAGMENTS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigg",
  "fag",
  "rape",
  "whore",
  "slut",
  "dick",
  "cock",
  "pussy",
  "nazi",
  "hitler",
  "retard",
  "asshole",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

const ALLOWED = /^[\p{L}\p{N} _.\-!?']+$/u;

export type NicknameError = "TOO_SHORT" | "TOO_LONG" | "INVALID_CHARACTERS" | "INAPPROPRIATE";

/** Collapses whitespace and trims; the stored display form. */
export function cleanNickname(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Comparison key used to detect duplicates: "Ada L" and "ada  l" collide. */
export function nicknameKey(nickname: string): string {
  return cleanNickname(nickname).toLocaleLowerCase();
}

function fold(nickname: string): string {
  return nicknameKey(nickname)
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^\p{L}]/gu, "");
}

export function validateNickname(raw: string, filterProfanity: boolean): NicknameError | null {
  const nickname = cleanNickname(raw);
  if ([...nickname].length < NICKNAME_MIN) return "TOO_SHORT";
  if ([...nickname].length > NICKNAME_MAX) return "TOO_LONG";
  if (!ALLOWED.test(nickname)) return "INVALID_CHARACTERS";
  if (filterProfanity) {
    const folded = fold(nickname);
    if (BLOCKED_FRAGMENTS.some((f) => folded.includes(f))) return "INAPPROPRIATE";
  }
  return null;
}
