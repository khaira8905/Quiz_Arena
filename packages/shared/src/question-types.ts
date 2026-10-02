/**
 * Question type registry. Adding a new type means adding an entry here (rules the
 * editor and API both enforce) plus a renderer on the web side — the engine itself
 * only deals with option ids, so choice-based types need no engine changes.
 */
export const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface QuestionTypeRules {
  label: string;
  description: string;
  minOptions: number;
  maxOptions: number;
  /** When set, option texts are fixed and not editable. */
  fixedOptions?: readonly string[];
  correctCount: "exactly-one";
}

export const QUESTION_TYPE_RULES: Record<QuestionType, QuestionTypeRules> = {
  MULTIPLE_CHOICE: {
    label: "Multiple choice",
    description: "Two to four options, one correct.",
    minOptions: 2,
    maxOptions: 4,
    correctCount: "exactly-one",
  },
  TRUE_FALSE: {
    label: "True / False",
    description: "A statement players judge as true or false.",
    minOptions: 2,
    maxOptions: 2,
    fixedOptions: ["True", "False"],
    correctCount: "exactly-one",
  },
};
