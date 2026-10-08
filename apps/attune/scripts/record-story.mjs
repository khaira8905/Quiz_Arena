/**
 * Records the story video for the landing and Story pages from the real app (no stock footage):
 * Scenario A, the "I'm bored" moment, end to end. Writes, under public/media/story/:
 *
 *   attune-story.webm   the recording (VP8, 1280×720)
 *   poster.jpg          a frame from the Intervention beat
 *   captions.vtt        WebVTT captions, timed to the beats
 *   chapters.json       chapter start times (seconds)
 *
 * Usage: start the app (`pnpm dev`), then `node scripts/record-story.mjs`.
 */
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = new URL("../public/media/story/", import.meta.url).pathname;
const TMP = join(OUT, ".recording");
const size = { width: 1280, height: 720 };

await mkdir(TMP, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  recordVideo: { dir: TMP, size },
  colorScheme: "light",
  reducedMotion: "no-preference",
});
const page = await context.newPage();
const t0 = Date.now();
const at = () => (Date.now() - t0) / 1000;
const pause = (ms) => page.waitForTimeout(ms);
const beats = [];
const beat = (label, detail, caption) =>
  beats.push({ time: Math.max(0, at() - 0.2), label, detail, caption });

// Before: a learner who's bored, saying so in the check-in.
await page.goto(`${BASE}/begin?scenario=A`);
await page.getByRole("button", { name: "Next" }).waitFor();
await pause(600);
beat(
  "Before",
  "A capable learner, bored by the set work.",
  "Asha has twenty minutes and is bored before she starts.",
);
for (let i = 0; i < 3; i++) {
  await page.getByRole("button", { name: "Next" }).click();
  await pause(900);
}
await pause(1200); // the feeling step, with "Bored" selected
await page.getByRole("button", { name: "Next" }).click();
await pause(700);
await page.getByRole("button", { name: "Next" }).click();
await pause(700);
await page.getByRole("button", { name: "See what I've picked up" }).click();

// Detection: the engine's first read, with its evidence.
await pause(500);
beat(
  "Detection",
  "Reads the state, and why.",
  "Attune reads the state, and shows the evidence for it.",
);
await pause(3200);
await page.getByRole("button", { name: /Let.s go/ }).click();
await page.waitForURL("**/session");
await page.getByRole("group", { name: "Steer the session" }).waitFor();

// Intervention: not more of the same, a stretch challenge, with the reason.
await pause(400);
beat(
  "Intervention",
  "A stretch challenge, not more of the same.",
  "Bored, but capable: so not more practice. A stretch challenge, with the reason shown.",
);
await pause(1800);
await page.screenshot({ path: join(OUT, "poster.jpg"), type: "jpeg", quality: 82 });
await pause(1800);

// Response: the learner steers. Every control is a hard constraint.
beat(
  "Response",
  "Too easy, then explain differently.",
  "She says it's too easy. The next one is harder, then explained a different way.",
);
await page.getByRole("button", { name: "Too easy" }).click();
await pause(2600);
await page.getByRole("button", { name: "Explain differently" }).click();
await pause(2600);

// Adaptation: the twin shows what changed and the pattern forming.
await page.goto(`${BASE}/twin`);
await page.locator('section[aria-label="How your learner model is changing"]').waitFor();
await pause(300);
beat(
  "Adaptation",
  "Yesterday, today, and the pattern forming.",
  "The learner model updates: what changed today, and the pattern forming.",
);
await pause(4200);
const end = at();

await context.close();
await browser.close();

const [file] = (await readdir(TMP)).filter((f) => f.endsWith(".webm"));
await rename(join(TMP, file), join(OUT, "attune-story.webm"));
await rm(TMP, { recursive: true, force: true });

const ts = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec}.${String(ms % 1000).padStart(3, "0")}`;
};
const vtt = ["WEBVTT", ""];
beats.forEach((b, i) => {
  const next = beats[i + 1]?.time ?? end;
  vtt.push(`${i + 1}`, `${ts(b.time)} --> ${ts(next)}`, b.caption, "");
});
await writeFile(join(OUT, "captions.vtt"), vtt.join("\n"));
await writeFile(
  join(OUT, "chapters.json"),
  `${JSON.stringify({ duration: Math.round(end), chapters: beats.map(({ time, label, detail }) => ({ time: Math.round(time * 10) / 10, label, detail })) }, null, 2)}\n`,
);
console.log(`Recorded ${end.toFixed(1)}s →`, OUT);
