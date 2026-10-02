/**
 * Synthesised sound cues (Web Audio, no asset files). Short, quiet, and only after the
 * user has interacted with the page — browsers block autoplay otherwise. Players can mute
 * per device; organisers can disable sound per quiz.
 */
export type Cue = "start" | "tick" | "tickUrgent" | "select" | "correct" | "wrong" | "reveal" | "leaderboard" | "winner" | "join";

const STORAGE_KEY = "qa:sound";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

if (typeof window !== "undefined") {
  try {
    enabled = window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    /* storage unavailable — default on */
  }
}

export function isSoundEnabled() {
  return enabled;
}

const listeners = new Set<() => void>();

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** External-store adapter so components can read the device preference without effects. */
export const soundPreference = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => enabled,
  getServer: () => true,
};

/** Call from a user gesture (tap/click/keypress) to unlock audio. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 1, slideTo?: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + dur);
  env.gain.setValueAtTime(0, ctx.currentTime + start);
  env.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(env).connect(master);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
}

export function play(cue: Cue) {
  if (!enabled || !ctx || ctx.state !== "running") return;
  switch (cue) {
    case "tick":
      return tone(880, 0, 0.05, "square", 0.25);
    case "tickUrgent":
      return tone(1320, 0, 0.07, "square", 0.4);
    case "select":
      return tone(520, 0, 0.08, "triangle", 0.6, 780);
    case "join":
      return tone(660, 0, 0.06, "sine", 0.4);
    case "start":
      tone(392, 0, 0.12, "sawtooth", 0.35);
      tone(523, 0.1, 0.12, "sawtooth", 0.35);
      return tone(784, 0.2, 0.3, "sawtooth", 0.4);
    case "correct":
      tone(659, 0, 0.1, "triangle", 0.7);
      return tone(988, 0.08, 0.22, "triangle", 0.7);
    case "wrong":
      return tone(220, 0, 0.24, "sawtooth", 0.35, 150);
    case "reveal":
      return tone(440, 0, 0.18, "triangle", 0.5, 660);
    case "leaderboard":
      tone(523, 0, 0.1, "triangle", 0.5);
      tone(659, 0.09, 0.1, "triangle", 0.5);
      return tone(784, 0.18, 0.18, "triangle", 0.5);
    case "winner":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.28, "triangle", 0.6));
      return tone(1319, 0.5, 0.6, "sine", 0.5);
  }
}
