import { DEFAULT_APPEARANCE } from "@quizarena/shared/appearance";
import { describe, expect, it } from "vitest";
import { type ArenaPreviewState, previewProjectorView, previewPlayerView } from "./arena-preview";

const state = (over: Partial<ArenaPreviewState> = {}): ArenaPreviewState => ({
  appearance: { ...DEFAULT_APPEARANCE, theme: "BLUE" },
  scene: "question",
  title: "Physics Night",
  questionCount: 12,
  settings: {
    scoringMode: "SPEED",
    streakBonus: true,
    showLeaderboard: true,
    showCorrectAnswers: true,
    showAnswerStats: true,
    allowLateJoin: false,
    participantLimit: 200,
    soundEnabled: true,
    nicknameFilter: true,
    readingMode: "OFF",
    readingTimeSec: 5,
  },
  question: {
    text: "Speed of light?",
    options: [
      { text: "300,000 km/s", correct: true },
      { text: "30 km/s", correct: false },
    ],
    explanation: "",
    points: 1000,
    durationSec: 30,
  },
  ...over,
});

describe("arena preview views", () => {
  it("builds a live question for the projector with a running timer", () => {
    const now = 1_000_000;
    const v = previewProjectorView(state(), now);
    expect(v.phase).toBe("QUESTION_ACTIVE");
    expect(v.settings.appearance.theme).toBe("BLUE");
    expect(v.settings.soundEnabled).toBe(false);
    expect(v.question?.type).toBe("TRUE_FALSE");
    expect(v.question?.total).toBe(12);
    expect(v.timer?.paused).toBe(false);
    expect(v.timer!.deadline - now).toBe(24_000); // 30s question, 6s in
    expect(v.correctOptionIds).toBeNull();
  });

  it("reveals the correct option and distribution on the reveal scene", () => {
    const v = previewProjectorView(state({ scene: "reveal" }), 0);
    expect(v.correctOptionIds).toEqual(["o0"]);
    expect(Object.keys(v.distribution ?? {})).toEqual(["o0", "o1"]);
  });

  it("fills the lobby with players and no question", () => {
    const v = previewProjectorView(state({ scene: "lobby" }), 0);
    expect(v.question).toBeNull();
    expect(v.lobbyPlayers.length).toBe(v.playerCount);
  });

  it("keeps the distribution private until the stats step, and shows the podium", () => {
    expect(previewProjectorView(state({ scene: "question" }), 0).distribution).toBeNull();
    expect(previewProjectorView(state({ scene: "stats" }), 0).distribution).not.toBeNull();
    expect(previewProjectorView(state({ scene: "stats" }), 0).correctOptionIds).toBeNull();
    const podium = previewProjectorView(state({ scene: "podium" }), 0);
    expect(podium.phase).toBe("FINISHED");
    expect(podium.results?.standings[0]?.rank).toBe(1);
    expect(podium.question).toBeNull();
  });

  it("gives the phone a correct answer on reveal, and falls back to a sample question", () => {
    const p = previewPlayerView(state({ scene: "reveal", question: null }), 0);
    expect(p.result?.correct).toBe(true);
    expect(p.myAnswerId).toBe(p.correctOptionIds?.[0]);
    expect(p.question?.options).toHaveLength(4);
    expect(p.soundEnabled).toBe(false);
  });
});
