import {
  DEFAULT_POINTS,
  EXPLANATION_MAX,
  MAX_POINTS,
  MAX_QUESTIONS_PER_QUIZ,
  OPTION_TEXT_MAX,
  QUESTION_TEXT_MAX,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
} from "./constants";
import { QUESTION_TYPE_RULES } from "./question-types";
import { type QuestionInput, questionIssues } from "./schemas";

/**
 * Question import from spreadsheets (CSV, Excel, Google Sheets). Organisers bring questions
 * in whatever shape they already have, so columns are matched by name, loosely: "Question",
 * "Option A" / "Answer 1" / "Choice 1", "Correct answer", "Time limit (sec)", "Points",
 * "Explanation", "Image URL". Kahoot's spreadsheet template is understood as-is.
 *
 * Rows are never silently dropped: each one either becomes a question (possibly with
 * issues the editor will flag, like a missing correct answer) or is listed as skipped with
 * a reason.
 */

export const IMPORT_MAX_ROWS = MAX_QUESTIONS_PER_QUIZ;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface ImportedQuestion {
  /** 1-based row number in the source file, for messages the organiser can act on. */
  row: number;
  question: QuestionInput;
  /** Things the organiser should fix (from questionIssues) plus import notes. */
  issues: string[];
}

export interface ImportSkip {
  row: number;
  reason: string;
}

export interface ImportResult {
  questions: ImportedQuestion[];
  skipped: ImportSkip[];
  /** How the columns were recognised, shown in the preview. */
  columns: string[];
}

/* ----------------------------------------------------------------------------- CSV */

/**
 * RFC 4180 CSV with the variants spreadsheets actually export: a BOM, CRLF line endings,
 * quoted fields with embedded newlines and doubled quotes, and semicolon or tab delimiters
 * (European Excel and copy-paste from Sheets).
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Spreadsheet cells (numbers, booleans, dates from Excel) as the text a person typed. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value).trim();
}

/* ------------------------------------------------------------------------- columns */

type Field =
  | "question"
  | "option1"
  | "option2"
  | "option3"
  | "option4"
  | "correct"
  | "time"
  | "points"
  | "explanation"
  | "image"
  | "type";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Normalised header prefixes per field. Prefix matching tolerates "Question - max 120 characters". */
const HEADERS: [Field, string[]][] = [
  ["correct", ["correctanswer", "correctoption", "correct", "answerkey", "key", "rightanswer"]],
  ["option1", ["optiona", "option1", "answera", "answer1", "choicea", "choice1", "a"]],
  ["option2", ["optionb", "option2", "answerb", "answer2", "choiceb", "choice2", "b"]],
  ["option3", ["optionc", "option3", "answerc", "answer3", "choicec", "choice3", "c"]],
  ["option4", ["optiond", "option4", "answerd", "answer4", "choiced", "choice4", "d"]],
  ["question", ["questiontext", "question", "prompt"]],
  ["time", ["timelimit", "timer", "time", "seconds", "duration"]],
  ["points", ["points", "score"]],
  ["explanation", ["explanation", "why", "feedback", "notes"]],
  ["image", ["imageurl", "image", "picture", "media"]],
  ["type", ["questiontype", "type"]],
];

/** Single letters only match a header that is exactly that letter. */
function fieldFor(header: string): Field | null {
  const h = norm(header);
  if (!h) return null;
  for (const [field, prefixes] of HEADERS) {
    for (const p of prefixes) {
      if (p.length === 1 ? h === p : h.startsWith(p)) return field;
    }
  }
  return null;
}

const FIELD_LABEL: Record<Field, string> = {
  question: "Question",
  option1: "Option A",
  option2: "Option B",
  option3: "Option C",
  option4: "Option D",
  correct: "Correct answer",
  time: "Time limit",
  points: "Points",
  explanation: "Explanation",
  image: "Image URL",
  type: "Type",
};

/** Without a recognisable header row, columns are read in the template's order. */
const POSITIONAL: Field[] = [
  "question",
  "option1",
  "option2",
  "option3",
  "option4",
  "correct",
  "time",
  "points",
  "explanation",
  "image",
];

function findHeader(rows: string[][]): { index: number; map: Map<number, Field> } | null {
  // Templates (Kahoot's included) often put a title and instructions above the header.
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = new Map<number, Field>();
    rows[i]!.forEach((cell, col) => {
      const f = fieldFor(cell);
      if (f && ![...map.values()].includes(f)) map.set(col, f);
    });
    const fields = new Set(map.values());
    if (fields.has("question") && (fields.has("option1") || fields.has("option2"))) {
      return { index: i, map };
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------- rows */

const LETTERS = ["a", "b", "c", "d"];

/** "B", "2", "Option B", "b)", "answer 2" or the option's own text → option index. */
function correctIndex(raw: string, options: string[]): number | "multiple" | null {
  const value = raw.trim();
  if (!value) return null;
  const byText = options.findIndex((o) => o && o.toLowerCase() === value.toLowerCase());
  if (byText >= 0) return byText;
  // Kahoot allows several correct answers ("1,3"); QuizArena has exactly one.
  if (/^\s*\w\s*[,;/&]\s*\w/.test(value) && value.length <= 12) return "multiple";
  const token = norm(value).replace(/^(option|answer|choice)/, "");
  const letter = LETTERS.indexOf(token);
  if (letter >= 0 && letter < options.length) return letter;
  const n = Number(token);
  if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
  return null;
}

function clip(text: string, max: number, what: string, notes: string[]): string {
  if ([...text].length <= max) return text;
  notes.push(`${what} was shortened to ${max} characters`);
  return [...text].slice(0, max).join("");
}

const TRUE_WORDS = new Set(["true", "t", "yes"]);
const FALSE_WORDS = new Set(["false", "f", "no"]);

export function questionsFromRows(input: unknown[][]): ImportResult {
  const rows = input.map((r) => r.map(cellText));
  const header = findHeader(rows);
  const map = header?.map ?? new Map(POSITIONAL.map((f, i) => [i, f] as const));
  const start = header ? header.index + 1 : 0;
  const columns = [...new Set(map.values())].map((f) => FIELD_LABEL[f]);

  const questions: ImportedQuestion[] = [];
  const skipped: ImportSkip[] = [];

  for (let i = start; i < rows.length; i++) {
    const cells = rows[i]!;
    const rowNumber = i + 1;
    const get = (f: Field) => {
      for (const [col, field] of map) if (field === f) return cells[col] ?? "";
      return "";
    };
    if (cells.every((c) => !c)) continue; // blank line
    if (questions.length >= IMPORT_MAX_ROWS) {
      skipped.push({
        row: rowNumber,
        reason: `A quiz can have at most ${IMPORT_MAX_ROWS} questions`,
      });
      continue;
    }

    const notes: string[] = [];
    const text = clip(get("question"), QUESTION_TEXT_MAX, "Question", notes);
    const rawOptions = (["option1", "option2", "option3", "option4"] as const).map((f) => get(f));
    // Drop empty trailing options; keep the order the author wrote.
    while (rawOptions.length && !rawOptions[rawOptions.length - 1]) rawOptions.pop();
    if (!text && rawOptions.every((o) => !o)) {
      skipped.push({ row: rowNumber, reason: "No question or answers in this row" });
      continue;
    }

    const lower = rawOptions.map((o) => o.toLowerCase());
    const typeHint = norm(get("type"));
    const isTrueFalse =
      typeHint.startsWith("truefalse") ||
      typeHint === "tf" ||
      (lower.length === 2 &&
        ((TRUE_WORDS.has(lower[0]!) && FALSE_WORDS.has(lower[1]!)) ||
          (FALSE_WORDS.has(lower[0]!) && TRUE_WORDS.has(lower[1]!))));

    let options: string[];
    let correct = correctIndex(get("correct"), rawOptions);
    if (isTrueFalse) {
      // Normalise to the fixed True/False order and remap the correct answer.
      const fixed = QUESTION_TYPE_RULES.TRUE_FALSE.fixedOptions!;
      const c = get("correct").toLowerCase();
      const pickedText =
        typeof correct === "number" ? (rawOptions[correct] ?? "").toLowerCase() : c;
      correct = TRUE_WORDS.has(pickedText) ? 0 : FALSE_WORDS.has(pickedText) ? 1 : correct;
      options = [...fixed];
    } else {
      if (rawOptions.length > QUESTION_TYPE_RULES.MULTIPLE_CHOICE.maxOptions) {
        notes.push("Only the first 4 answers were kept");
      }
      options = rawOptions
        .slice(0, QUESTION_TYPE_RULES.MULTIPLE_CHOICE.maxOptions)
        .map((o, k) => clip(o, OPTION_TEXT_MAX, `Answer ${"ABCD"[k]}`, notes));
      while (options.length < QUESTION_TYPE_RULES.MULTIPLE_CHOICE.minOptions) options.push("");
    }

    if (correct === "multiple") {
      notes.push("Several correct answers were listed; only the first was kept");
      correct = correctIndex(get("correct").split(/[,;/&]/)[0] ?? "", rawOptions);
      if (correct === "multiple") correct = null;
    } else if (correct === null && get("correct")) {
      notes.push(`Couldn't match the correct answer "${get("correct")}" to an option`);
    }

    const timeRaw = get("time").replace(/[^0-9.]/g, "");
    let timeLimitSec: number | null = null;
    if (timeRaw) {
      const t = Math.round(Number(timeRaw));
      if (Number.isFinite(t) && t > 0) {
        timeLimitSec = Math.min(TIMER_MAX_SECONDS, Math.max(TIMER_MIN_SECONDS, t));
        if (timeLimitSec !== t) notes.push(`Timer adjusted to ${timeLimitSec}s`);
      }
    }

    const pointsRaw = get("points").replace(/[^0-9]/g, "");
    let points = DEFAULT_POINTS;
    if (pointsRaw) points = Math.min(MAX_POINTS, Math.max(0, Number(pointsRaw)));

    const image = get("image");
    const imageUrl = /^https:\/\/\S+$/i.test(image) ? image : null;
    if (image && !imageUrl) notes.push("Image skipped: it must be an https:// link");

    const question: QuestionInput = {
      type: isTrueFalse ? "TRUE_FALSE" : "MULTIPLE_CHOICE",
      text,
      imageUrl,
      imageAssetId: null,
      imageFit: "CONTAIN",
      imagePosition: "CENTER",
      timeLimitSec,
      points,
      explanation: clip(get("explanation"), EXPLANATION_MAX, "Explanation", notes),
      randomizeAnswers: false,
      options: options.map((o, k) => ({ text: o, isCorrect: k === correct })),
    };
    questions.push({
      row: rowNumber,
      question,
      issues: [...questionIssues(question), ...notes],
    });
  }

  return { questions, skipped, columns };
}

/** A starter file organisers can download, fill in and import. */
export const IMPORT_TEMPLATE_CSV = [
  "Question,Option A,Option B,Option C,Option D,Correct answer,Time limit (sec),Points,Explanation,Image URL",
  'Which planet has the shortest day?,Mercury,Jupiter,Saturn,Neptune,B,20,1000,"Jupiter spins once every 9 hours 56 minutes.",',
  "The Great Wall of China is visible from space with the naked eye.,True,False,,,False,15,1000,It is far too narrow to see from orbit.,",
  "How many bits are in a byte?,4,8,16,32,8,20,2000,,",
].join("\r\n");
