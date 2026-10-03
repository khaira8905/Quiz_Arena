import { QUESTION_TEXT_MAX, OPTION_TEXT_MAX } from "@quizarena/shared/constants";
import { describe, expect, it } from "vitest";
import { answerScale, questionScale } from "./text-fit";

describe("text fit", () => {
  it("keeps short text at full size and steps long text down", () => {
    expect(questionScale("What is 2 + 2?")).toBe(1);
    expect(questionScale("x".repeat(QUESTION_TEXT_MAX))).toBeLessThan(0.7);
    expect(answerScale(["Yes", "No"])).toBe(1);
    expect(answerScale(["a", "x".repeat(OPTION_TEXT_MAX)])).toBeLessThan(0.7);
  });

  it("never grows text and is monotonic in length", () => {
    let last = 1;
    for (let n = 0; n <= QUESTION_TEXT_MAX; n += 10) {
      const s = questionScale("x".repeat(n));
      expect(s).toBeLessThanOrEqual(last);
      last = s;
    }
  });
});
