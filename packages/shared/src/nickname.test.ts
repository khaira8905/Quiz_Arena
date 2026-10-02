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
});
