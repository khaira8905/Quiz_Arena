/**
 * Answer identity. Each option has three redundant signals — colour, letter and keyboard
 * key — so nobody depends on colour alone. Class names are spelled out in full so
 * Tailwind's scanner picks them up.
 */
export const ANSWER_STYLES = [
  { letter: "A", key: "1", name: "Flare", bg: "bg-a1", text: "text-a1", border: "border-a1", ring: "ring-a1", fill: "var(--answer-1)" },
  { letter: "B", key: "2", name: "Ion", bg: "bg-a2", text: "text-a2", border: "border-a2", ring: "ring-a2", fill: "var(--answer-2)" },
  { letter: "C", key: "3", name: "Sol", bg: "bg-a3", text: "text-a3", border: "border-a3", ring: "ring-a3", fill: "var(--answer-3)" },
  { letter: "D", key: "4", name: "Nova", bg: "bg-a4", text: "text-a4", border: "border-a4", ring: "ring-a4", fill: "var(--answer-4)" },
] as const;

export type AnswerStyle = (typeof ANSWER_STYLES)[number];

export const answerStyle = (index: number): AnswerStyle => ANSWER_STYLES[index % ANSWER_STYLES.length]!;
