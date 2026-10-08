import { describe, expect, it } from "vitest";
import {
  CHALLENGES,
  CURIOSITY_PATHS,
  EXPLANATIONS,
  GUIDED,
  MICRO_WINS,
  MISSIONS,
  MODALITIES,
  QUESTIONS,
  REFLECTIONS,
  BREAKS,
  type Choice,
} from "./index";

const allActivities = [
  ...QUESTIONS,
  ...GUIDED,
  ...MICRO_WINS,
  ...CHALLENGES,
  ...EXPLANATIONS,
  ...CURIOSITY_PATHS,
  ...MISSIONS,
  ...REFLECTIONS,
  ...BREAKS,
];

const allChoices: [string, Choice][] = [
  ...QUESTIONS.map((q) => [q.id, q] as [string, Choice]),
  ...MICRO_WINS.map((m) => [m.id, m] as [string, Choice]),
  ...GUIDED.flatMap((g) => g.steps.map((s, i) => [`${g.id}#${i}`, s] as [string, Choice])),
  ...CHALLENGES.flatMap((c) => c.parts.map((p, i) => [`${c.id}#${i}`, p] as [string, Choice])),
  ...MISSIONS.flatMap(
    (m) =>
      [
        [`${m.id}#part`, m.yourPart],
        [`${m.id}#teach`, m.teachBack],
      ] as [string, Choice][],
  ),
  ...CURIOSITY_PATHS.flatMap((p) =>
    p.nodes.filter((n) => n.check).map((n) => [`${p.id}#${n.id}`, n.check!] as [string, Choice]),
  ),
];

describe("content library", () => {
  it("has unique activity ids", () => {
    const ids = allActivities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(allChoices)("%s has a valid answer and distinct options", (_id, choice) => {
    expect(choice.options.length).toBeGreaterThanOrEqual(2);
    expect(choice.answerIndex).toBeGreaterThanOrEqual(0);
    expect(choice.answerIndex).toBeLessThan(choice.options.length);
    expect(new Set(choice.options).size).toBe(choice.options.length);
  });

  it("covers every difficulty level with at least three questions", () => {
    for (let d = 1; d <= 5; d++) {
      expect(QUESTIONS.filter((q) => q.difficulty === d).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("explains logarithms (the assignment concept) in every modality", () => {
    const modalities = new Set(
      EXPLANATIONS.filter((e) => e.conceptId === "logs").map((e) => e.modality),
    );
    expect([...modalities].sort()).toEqual([...MODALITIES].sort());
  });

  it("gives every explanation a text fallback for light mode", () => {
    for (const e of EXPLANATIONS) {
      expect(e.textFallback.length).toBeGreaterThan(40);
      expect(e.body.modality).toBe(e.modality);
    }
  });

  it("links every curiosity path node to existing nodes, and every path returns to the syllabus", () => {
    for (const path of CURIOSITY_PATHS) {
      const ids = new Set(path.nodes.map((n) => n.id));
      expect(ids.has(path.startNodeId)).toBe(true);
      for (const node of path.nodes)
        for (const next of node.next) expect(ids.has(next.nodeId)).toBe(true);
      expect(path.nodes.some((n) => n.returnsToSyllabus)).toBe(true);
    }
  });
});
