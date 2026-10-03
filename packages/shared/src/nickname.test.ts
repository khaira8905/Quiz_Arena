import { describe, expect, it } from "vitest";
import { cleanNickname, nicknameKey, validateNickname } from "./nickname";

describe("nicknames", () => {
  it("normalises whitespace", () => {
    expect(cleanNickname("  Ada   Lovelace ")).toBe("Ada Lovelace");
  });

  it("treats case and spacing variants as duplicates", () => {
    expect(nicknameKey("ADA  lovelace")).toBe(nicknameKey("ada lovelace"));
  });

  it("enforces length and characters", () => {
    expect(validateNickname("a", true)).toBe("TOO_SHORT");
    expect(validateNickname("x".repeat(21), true)).toBe("TOO_LONG");
    expect(validateNickname("<script>", true)).toBe("INVALID_CHARACTERS");
    expect(validateNickname("Grace_H.", true)).toBeNull();
    expect(validateNickname("Zoë", true)).toBeNull();
  });

  it("catches simple evasions when filtering is on", () => {
    expect(validateNickname("sh1t-lord", true)).toBe("INAPPROPRIATE");
    expect(validateNickname("sh1t-lord", false)).toBeNull();
  });

  it("accepts names in scripts that need combining marks", () => {
    expect(validateNickname("प्रिया", true)).toBeNull();
    expect(validateNickname("สมชาย", true)).toBeNull();
    expect(validateNickname("அருண்", true)).toBeNull();
  });

  it("rejects names that render as nothing or as noise", () => {
    expect(validateNickname("\u3164\u3164", true)).toBe("TOO_SHORT");
    expect(validateNickname("!!", true)).toBe("INVALID_CHARACTERS");
    expect(validateNickname("Ad\u0301\u0302\u0303\u0304a", true)).toBe("INVALID_CHARACTERS");
  });

  it("treats invisible characters and lookalike letters as the same name", () => {
    expect(nicknameKey("Ada\u3164")).toBe(nicknameKey("Ada"));
    expect(nicknameKey("A\u200bda")).toBe(nicknameKey("Ada"));
    expect(nicknameKey("Аda")).toBe(nicknameKey("Ada")); // Cyrillic А
    expect(cleanNickname("Анна")).toBe("Анна"); // display form is untouched
  });

  it("sees through lookalike letters when filtering", () => {
    expect(validateNickname("fuсk", true)).toBe("INAPPROPRIATE"); // Cyrillic с
  });
});
