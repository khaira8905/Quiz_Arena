/**
 * Answer identity. Each option has three redundant signals — colour, letter and keyboard
 * key — so nobody depends on colour alone. `ink` is the readable text colour on that fill
 * (black or white, chosen per arena theme). Class names are spelled out in full so
 * Tailwind's scanner picks them up.
 */
export const ANSWER_STYLES = [
  {
    letter: "A",
    key: "1",
    name: "Flare",
    bg: "bg-a1",
    text: "text-a1",
    border: "border-a1",
    ring: "ring-a1",
    ink: "text-ink1",
    inkBg: "bg-ink1",
    meter: "bg-ink1/22",
    fill: "var(--answer-1)",
  },
  {
    letter: "B",
    key: "2",
    name: "Ion",
    bg: "bg-a2",
    text: "text-a2",
    border: "border-a2",
    ring: "ring-a2",
    ink: "text-ink2",
    inkBg: "bg-ink2",
    meter: "bg-ink2/22",
    fill: "var(--answer-2)",
  },
  {
    letter: "C",
    key: "3",
    name: "Sol",
    bg: "bg-a3",
    text: "text-a3",
    border: "border-a3",
    ring: "ring-a3",
    ink: "text-ink3",
    inkBg: "bg-ink3",
    meter: "bg-ink3/22",
    fill: "var(--answer-3)",
  },
  {
    letter: "D",
    key: "4",
    name: "Nova",
    bg: "bg-a4",
    text: "text-a4",
    border: "border-a4",
    ring: "ring-a4",
    ink: "text-ink4",
    inkBg: "bg-ink4",
    meter: "bg-ink4/22",
    fill: "var(--answer-4)",
  },
] as const;

export type AnswerStyle = (typeof ANSWER_STYLES)[number];

export const answerStyle = (index: number): AnswerStyle =>
  ANSWER_STYLES[index % ANSWER_STYLES.length]!;
