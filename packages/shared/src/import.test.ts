import { describe, expect, it } from "vitest";
import { IMPORT_TEMPLATE_CSV, parseCsv, questionsFromRows } from "./import";
import { questionInputSchema } from "./schemas";

describe("CSV parsing", () => {
  it("handles quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,"b, c","line1\nline2",d\r\n"say ""hi""",2,,\r\n');
    expect(rows).toEqual([
      ["a", "b, c", "line1\nline2", "d"],
      ['say "hi"', "2", "", ""],
    ]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("q;a;b\nx;1;2")[1]).toEqual(["x", "1", "2"]);
    expect(parseCsv("q\ta\tb\nx\t1\t2")[1]).toEqual(["x", "1", "2"]);
  });
});

describe("question import", () => {
  it("imports the downloadable template cleanly", () => {
    const r = questionsFromRows(parseCsv(IMPORT_TEMPLATE_CSV));
    expect(r.skipped).toEqual([]);
    expect(r.questions).toHaveLength(3);
    for (const q of r.questions) {
      expect(q.issues).toEqual([]);
      expect(questionInputSchema.safeParse(q.question).success).toBe(true);
    }
    const [mc, tf, bits] = r.questions;
    expect(mc!.question.options[1]).toEqual({ text: "Jupiter", isCorrect: true });
    expect(mc!.question.timeLimitSec).toBe(20);
    expect(tf!.question.type).toBe("TRUE_FALSE");
    expect(tf!.question.options.map((o) => o.isCorrect)).toEqual([false, true]);
    expect(bits!.question.options[1]!.isCorrect).toBe(true); // matched by answer text "8"
    expect(bits!.question.points).toBe(2000);
  });

  it("understands Kahoot's spreadsheet template", () => {
    const rows = [
      ["Quiz template"],
      ["Add questions, at least two answer alternatives, time limit and choose correct answers."],
      [],
      [
        "",
        "Question - max 120 characters",
        "Answer 1 - max 75 characters",
        "Answer 2 - max 75 characters",
        "Answer 3 - max 75 characters",
        "Answer 4 - max 75 characters",
        "Time limit (sec) – 5, 10, 20, 30, 60, 90, 120, or 240 secs",
        "Correct answer(s) - choose at least one",
      ],
      [1, "Capital of France?", "Berlin", "Paris", "Rome", "", 20, 2],
      [2, "2 + 2 = ?", "3", "4", "", "", 240, "2,1"],
    ];
    const r = questionsFromRows(rows);
    expect(r.questions).toHaveLength(2);
    const [france, sum] = r.questions;
    expect(france!.question.options.map((o) => o.text)).toEqual(["Berlin", "Paris", "Rome"]);
    expect(france!.question.options[1]!.isCorrect).toBe(true);
    expect(france!.issues).toEqual([]);
    expect(sum!.question.timeLimitSec).toBe(240);
    expect(sum!.question.options[1]!.isCorrect).toBe(true);
    expect(sum!.issues.join(" ")).toMatch(/only the first was kept/);
  });

  it("reads headerless files in template order and flags what needs fixing", () => {
    const r = questionsFromRows([
      ["What is H2O?", "Water", "Salt", "", "", "A"],
      ["Missing answer?", "Yes", "No", "Maybe", "", ""],
      ["", "", "", "", "", ""],
      ["", "", "", "", "", "notes only"],
    ]);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]!.issues).toEqual([]);
    expect(r.questions[1]!.issues).toContain("Mark exactly one correct answer");
    expect(r.skipped).toEqual([{ row: 4, reason: "No question or answers in this row" }]);
  });

  it("clips over-long text, clamps timers and rejects unsafe image links", () => {
    const r = questionsFromRows([
      ["Question", "A", "B", "Correct", "Time", "Image URL"],
      ["x".repeat(400), "yes", "no", "A", "2", "javascript:alert(1)"],
    ]);
    const q = r.questions[0]!;
    expect(q.question.text).toHaveLength(280);
    expect(q.question.timeLimitSec).toBe(5);
    expect(q.question.imageUrl).toBeNull();
    expect(q.issues.join(" ")).toMatch(/shortened.*Timer adjusted.*Image skipped/);
    expect(questionInputSchema.safeParse(q.question).success).toBe(true);
  });

  it("caps an import at the per-quiz question limit", () => {
    const rows = [["Question", "A", "B", "Correct"]];
    for (let i = 0; i < 120; i++) rows.push([`Q${i}`, "1", "2", "A"]);
    const r = questionsFromRows(rows);
    expect(r.questions).toHaveLength(100);
    expect(r.skipped).toHaveLength(20);
  });
});
