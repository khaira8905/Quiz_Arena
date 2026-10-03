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

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Letters (any script, with their combining marks: Devanagari, Thai…), digits, a little punctuation. */
const ALLOWED = /^[\p{L}\p{M}\p{N} _.\-!?']+$/u;
/** Must contain something visible to read on the projector. */
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** Stacked combining marks ("zalgo" text) smear over neighbouring names on the projector. */
const MARK_PILEUP = /\p{M}{4,}/u;

/**
 * Characters that render as nothing (or reorder text) but would make "Ada" and "Ada\u200b"
 * different names: zero-width and bidi controls, word joiners, BOM, and Hangul fillers,
 * which count as letters in Unicode but draw as blank space.
 */
const INVISIBLE =
  /[\u00ad\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufeff\uffa0]|\u034f|\u17b4|\u17b5/gu;

/**
 * Latin lookalikes from Cyrillic and Greek. Folded only for comparison (duplicate check and
 * blocklist), never for display, so a real "Анна" still shows as written.
 */
const CONFUSABLE: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  ё: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  ї: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  ԛ: "q",
  ԝ: "w",
  ү: "y",
  һ: "h",
  α: "a",
  β: "b",
  ε: "e",
  η: "n",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  ω: "w",
  ɡ: "g",
  ı: "i",
};

export type NicknameError = "TOO_SHORT" | "TOO_LONG" | "INVALID_CHARACTERS" | "INAPPROPRIATE";

/** Collapses whitespace and trims; the stored display form. */
export function cleanNickname(raw: string): string {
  return raw.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** Comparison key used to detect duplicates: "Ada L", "ada  l" and "Аda L" (Cyrillic А) collide. */
export function nicknameKey(nickname: string): string {
  return [...cleanNickname(nickname).toLocaleLowerCase()].map((c) => CONFUSABLE[c] ?? c).join("");
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
  if (!ALLOWED.test(nickname) || !HAS_LETTER_OR_DIGIT.test(nickname) || MARK_PILEUP.test(nickname))
    return "INVALID_CHARACTERS";
  if (filterProfanity) {
    const folded = fold(nickname);
    if (BLOCKED_FRAGMENTS.some((f) => folded.includes(f))) return "INAPPROPRIATE";
  }
  return null;
}
