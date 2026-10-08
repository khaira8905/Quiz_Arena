"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Mic, MicOff, ShieldCheck } from "lucide-react";
import {
  createLearner,
  FEELING_META,
  INTERVENTION_META,
  scenarioById,
  startSession,
  STATE_META,
  type CheckinInput,
  type Feeling,
  type Intent,
  type LearnerModel,
  type ScenarioId,
  type SelfAssessment,
} from "@attune/engine";
import { useAuth } from "@/lib/auth";
import { useConnectivity } from "@/lib/connectivity";
import { readGoal, readIntake } from "@/lib/intake";
import { randomId } from "@/lib/storage";
import { useAttune } from "@/lib/store";
import { useSpeechInput } from "@/lib/voice";
import { Button, Chip, cn, Eyebrow, SimulatedTag, StateBadge } from "./ui";

/**
 * Check-in: a short conversation, one question at a time. It ends by reflecting back what the
 * engine has understood, with its evidence, before anything starts.
 */

const STEPS = ["name", "mind", "task", "feeling", "worthwhile", "context", "reflect"] as const;
type Step = (typeof STEPS)[number];

const FEELINGS: Feeling[] = [
  "bored",
  "confused",
  "overwhelmed",
  "tired",
  "curious",
  "meh",
  "alone",
  "okay",
  "motivated",
];

const SELF: { value: SelfAssessment; label: string }[] = [
  { value: "confident", label: "I could do it, I just don't want to" },
  { value: "unsure", label: "Not sure I really get it" },
  { value: "lost", label: "Honestly, I'm lost" },
];

const INTENTS: { value: Intent; label: string }[] = [
  { value: "finish", label: "Actually get it done" },
  { value: "understand", label: "Understand it properly" },
  { value: "interesting", label: "Something that makes me think" },
  { value: "company", label: "Not doing it all alone" },
  { value: "start", label: "Just get started" },
];

interface Answers {
  name: string;
  mind: string;
  task: string;
  feeling: Feeling | null;
  feelingNote: string;
  self: SelfAssessment | null;
  energy: number;
  intent: Intent | null;
  minutes: number;
  shared: boolean;
  learnFromBehaviour: boolean;
  useAi: boolean;
}

const blank: Answers = {
  name: "",
  mind: "",
  task: "",
  feeling: null,
  feelingNote: "",
  self: null,
  energy: 3,
  intent: null,
  minutes: 20,
  shared: false,
  learnFromBehaviour: true,
  useAi: true,
};

function fromScenario(id: ScenarioId): Answers {
  const s = scenarioById(id);
  const learner = s.learner();
  return {
    name: s.name,
    mind: s.onboarding.onMind,
    task: s.onboarding.supposedTo,
    feeling: s.checkin.feeling,
    feelingNote: s.onboarding.feelingNote,
    self: s.checkin.selfAssessment ?? null,
    energy: s.checkin.energy,
    intent: s.checkin.intent ?? null,
    minutes: s.checkin.timeBudgetMin,
    shared: learner.context.sharedDevice,
    learnFromBehaviour: true,
    useAi: true,
  };
}

/** Builds the starting learner model from the conversation. Every field is visible later in the Twin. */
function buildLearner(
  a: Answers,
  scenarioId: ScenarioId | null,
  returning: LearnerModel | null = null,
): LearnerModel {
  const consent = {
    learnFromBehaviour: a.learnFromBehaviour,
    shareWithMentor: returning?.consent.shareWithMentor ?? false,
    useAiGateway: a.useAi,
  };
  if (returning && !scenarioId) {
    // A returning learner keeps everything the model has learned; today's answers update context.
    const intake = readIntake(a.mind, a.task, a.feelingNote);
    const closedToday = returning.snapshots.some((s) => s.day === returning.day);
    return {
      ...returning,
      displayName: a.name.trim().slice(0, 24) || returning.displayName,
      interests: [...new Set([...returning.interests, ...intake.interests])].slice(0, 10),
      consent,
      context: {
        ...returning.context,
        energy: a.energy,
        timeBudgetMin: a.minutes,
        sharedDevice: a.shared,
      },
      day: closedToday ? returning.day + 1 : returning.day,
    };
  }
  if (scenarioId) {
    const l = scenarioById(scenarioId).learner();
    return { ...l, consent, context: { ...l.context, sharedDevice: a.shared } };
  }
  const intake = readIntake(a.mind, a.task, a.feelingNote);
  const goal = readGoal(a.task);
  const base = goal.kind === "catch-up" ? 1.8 : goal.kind === "test" ? 2.6 : 2.5;
  const traits: Partial<LearnerModel["traits"]> = {
    curiosity: a.intent === "interesting" || a.feeling === "curious" ? 0.68 : 0.5,
    socialAffinity: a.intent === "company" || a.feeling === "alone" ? 0.75 : 0.45,
    challengePreference: a.intent === "finish" || a.self === "confident" ? 0.6 : 0.45,
    difficultyTolerance: a.intent === "start" || a.self === "lost" ? 0.3 : 0.5,
  };
  return {
    ...createLearner({
      id: randomId("lrn"),
      displayName: a.name.trim().slice(0, 24) || "You",
      goal: goal.label,
      goalConcept: "logs",
      interests: intake.interests,
      traits,
      ability: {
        doubling: base + 1.2,
        percent: base + 0.6,
        doubling_time: base + 0.2,
        logs: base - 0.2,
        modelling: base - 0.6,
      },
      energy: a.energy,
      timeBudgetMin: a.minutes,
      sharedDevice: a.shared,
    }),
    consent,
  };
}

function toCheckin(a: Answers): CheckinInput {
  return {
    feeling: a.feeling ?? "okay",
    energy: a.energy,
    timeBudgetMin: a.minutes,
    partial: false,
    selfAssessment: a.self ?? undefined,
    intent: a.intent ?? undefined,
  };
}

export function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { begin, savedLearner, session: current, scenarioId: activeScenario } = useAttune();
  const { profile, status: authStatus } = useAuth();
  // A returning learner: restored from their account, or with an ended session of their own.
  const returning =
    savedLearner ?? (current && !activeScenario && current.endedAt ? current.learner : null);
  const { mode, reason, network } = useConnectivity();
  const scenarioParam = params.get("scenario");
  const scenarioId = (
    ["A", "B", "C", "D"].includes(scenarioParam ?? "") ? scenarioParam : null
  ) as ScenarioId | null;
  const [answers, setAnswers] = useState<Answers>(blank);
  const [step, setStep] = useState<Step>("name");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from the URL's demo scenario
    setAnswers(
      scenarioId
        ? fromScenario(scenarioId)
        : { ...blank, name: returning?.displayName ?? profile?.displayName ?? "" },
    );
    setStep("name");
    // Only re-seed when the scenario changes, not on every profile or model update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));
  const index = STEPS.indexOf(step);
  const go = (delta: number) =>
    setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, index + delta))]!);

  const intake = useMemo(
    () => readIntake(answers.mind, answers.task, answers.feelingNote),
    [answers.mind, answers.task, answers.feelingNote],
  );

  // The reflection is the real engine's first read, computed on the device before anything starts.
  const preview = useMemo(() => {
    if (step !== "reflect") return null;
    const learner = buildLearner(answers, scenarioId, returning);
    return {
      learner,
      session: startSession({ id: "preview", learner, checkin: toCheckin(answers), now: 0, mode }),
    };
  }, [step, answers, scenarioId, mode, returning]);

  const canNext =
    (step === "feeling" && answers.feeling !== null) ||
    (step === "worthwhile" && answers.intent !== null) ||
    !["feeling", "worthwhile"].includes(step);

  const start = () => {
    if (!preview) return;
    begin(preview.learner, toCheckin(answers), scenarioId);
    router.push("/session");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-5 pb-16 pt-8 sm:pt-14">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-ink" : "bg-surface-3")}
            />
          ))}
        </div>
        {scenarioId && <SimulatedTag>Demo · {scenarioById(scenarioId).name}</SimulatedTag>}
      </div>

      {/* The conversation so far, quietly */}
      {index > 1 && step !== "reflect" && (
        <div className="mt-6 space-y-1 text-[13.5px] text-muted">
          {answers.mind && <p className="truncate">“{answers.mind}”</p>}
          {index > 2 && answers.task && <p className="truncate">Supposed to: {answers.task}</p>}
          {index > 3 && answers.feeling && (
            <p>
              Feeling {FEELING_META[answers.feeling].label.toLowerCase()} · energy {answers.energy}
              /5
            </p>
          )}
        </div>
      )}

      <div key={step} className="rise mt-8 flex-1">
        {step === "name" && (
          <Question eyebrow="Hi. Let's start somewhere easy." title="What should I call you?">
            <input
              autoFocus
              value={answers.name}
              onChange={(e) => set("name", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go(1)}
              placeholder="A first name or nickname"
              maxLength={24}
              className="w-full border-b border-line-strong bg-transparent py-2 text-[22px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
              <ShieldCheck className="size-3.5" />{" "}
              {authStatus === "signed-in"
                ? "Saved to your account. Reflections never leave this device."
                : "Stays on this device. No account needed."}
            </p>
          </Question>
        )}

        {step === "mind" && (
          <Question
            eyebrow={`${answers.name ? `${answers.name}, ` : ""}before anything else`}
            title="What's on your mind right now?"
          >
            <FreeText
              value={answers.mind}
              onChange={(v) => set("mind", v)}
              placeholder="Anything at all. A match, a song, a worry, nothing much…"
            />
            <Chips
              options={[
                "Nothing much",
                "A match I'm following",
                "Something I watched",
                "Honestly, my phone",
              ]}
              onPick={(v) => set("mind", v)}
            />
            {intake.heard.length > 0 && (
              <p className="mt-4 text-[13.5px] text-ink-2">
                I heard: <span className="font-medium text-ink">{intake.heard.join(", ")}</span>.
                I&apos;ll use that to make examples feel closer to home.
              </p>
            )}
          </Question>
        )}

        {step === "task" && (
          <Question eyebrow="And meanwhile…" title="What are you supposed to be doing?">
            <FreeText
              value={answers.task}
              onChange={(v) => set("task", v)}
              placeholder="e.g. a logs worksheet due Friday"
            />
            <Chips
              options={[
                "Logs assignment",
                "Catching up on exponents",
                "Revising for a test",
                "Nothing specific",
              ]}
              onPick={(v) => set("task", v)}
            />
          </Question>
        )}

        {step === "feeling" && (
          <Question
            eyebrow="Be honest. Nobody's grading this."
            title="How are you actually feeling about it?"
          >
            <div className="flex flex-wrap gap-2">
              {FEELINGS.map((f) => (
                <Chip key={f} selected={answers.feeling === f} onClick={() => set("feeling", f)}>
                  {FEELING_META[f].label}
                </Chip>
              ))}
            </div>
            <p className="mt-6 text-[14px] text-ink-2">Which is closer?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SELF.map((s) => (
                <Chip
                  key={s.value}
                  selected={answers.self === s.value}
                  onClick={() => set("self", answers.self === s.value ? null : s.value)}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
            <label className="mt-6 block text-[14px] text-ink-2">
              Energy right now:{" "}
              <span className="font-medium text-ink">
                {["", "running on empty", "low", "okay", "good", "sharp"][answers.energy]}
              </span>
              <input
                type="range"
                min={1}
                max={5}
                value={answers.energy}
                onChange={(e) => set("energy", Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
          </Question>
        )}

        {step === "worthwhile" && (
          <Question
            eyebrow="Last question"
            title={`What would make the next ${answers.minutes} minutes worthwhile?`}
          >
            <div className="flex flex-wrap gap-2">
              {INTENTS.map((i) => (
                <Chip
                  key={i.value}
                  selected={answers.intent === i.value}
                  onClick={() => set("intent", i.value)}
                >
                  {i.label}
                </Chip>
              ))}
            </div>
            <p className="mt-6 text-[14px] text-ink-2">How long have you got?</p>
            <div className="mt-2 flex gap-2">
              {[10, 20, 40].map((m) => (
                <Chip key={m} selected={answers.minutes === m} onClick={() => set("minutes", m)}>
                  {m} min
                </Chip>
              ))}
            </div>
          </Question>
        )}

        {step === "context" && (
          <Question eyebrow="A couple of things I noticed" title="I'll fit around your setup.">
            <div className="space-y-3">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-[15px] text-ink">
                  Connection:{" "}
                  <strong>
                    {mode === "full" ? "good" : mode === "light" ? "slow or metered" : "offline"}
                  </strong>
                  <span className="text-muted">
                    {" "}
                    · {reason}
                    {network.effectiveType ? ` (${network.effectiveType})` : ""}
                  </span>
                </p>
                <p className="mt-1 text-[13.5px] text-muted">
                  {mode === "full"
                    ? "Full mode: interactive visuals and the AI gateway are available."
                    : mode === "light"
                      ? "Light mode: same activities, text-first, no AI calls."
                      : "Offline: everything runs on this device and syncs later."}{" "}
                  You can switch any time from the top bar.
                </p>
              </div>
              <Toggle
                checked={answers.shared}
                onChange={(v) => set("shared", v)}
                label="Other people use this device"
                hint="Then nothing is kept after you close this tab."
              />
              <Toggle
                checked={answers.learnFromBehaviour}
                onChange={(v) => set("learnFromBehaviour", v)}
                label="Learn from how I work"
                hint="Uses answers and timing to adapt. Off = only what you tell me."
              />
              <Toggle
                checked={answers.useAi}
                onChange={(v) => set("useAi", v)}
                label="Allow AI rewrites of explanations"
                hint="Sends library text and your interest keywords. Never your name or what you typed."
              />
            </div>
          </Question>
        )}

        {step === "reflect" && preview && (
          <Reflection
            preview={preview}
            heard={scenarioId ? scenarioById(scenarioId).learner().interests : intake.interests}
            onFix={() => setStep("feeling")}
          />
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        {index > 0 ? (
          <Button variant="ghost" onClick={() => go(-1)}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        {step === "reflect" ? (
          <Button variant="primary" size="lg" onClick={start}>
            Let&apos;s go <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button variant="primary" size="lg" disabled={!canNext} onClick={() => go(1)}>
            {step === "context"
              ? "See what I've picked up"
              : scenarioId
                ? "Next"
                : step === "name" && !answers.name
                  ? "Skip"
                  : "Next"}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Question({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="type-h1 mt-3 text-ink">{title}</h1>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function FreeText({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const speech = useSpeechInput((text) => onChange(value ? `${value} ${text}` : text));
  return (
    <div className="flex items-end gap-2 border-b border-line-strong focus-within:border-ink">
      <textarea
        autoFocus
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
        className="w-full resize-none bg-transparent py-2 text-[20px] leading-snug text-ink placeholder:text-muted focus:outline-none"
      />
      {speech.supported && (
        <button
          type="button"
          onClick={speech.listening ? speech.stop : speech.start}
          aria-label={speech.listening ? "Stop listening" : "Answer by voice"}
          className={cn(
            "mb-2 rounded-full p-2",
            speech.listening ? "pulse-ring bg-accent text-accent-ink" : "text-muted hover:text-ink",
          )}
        >
          {speech.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </button>
      )}
    </div>
  );
}

function Chips({ options, onPick }: { options: string[]; onPick: (v: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o} onClick={() => onPick(o)}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 accent-[var(--accent)]"
      />
      <span>
        <span className="text-[15px] text-ink">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

function Reflection({
  preview,
  heard,
  onFix,
}: {
  preview: { learner: LearnerModel; session: ReturnType<typeof startSession> };
  heard: string[];
  onFix: () => void;
}) {
  const d = preview.session.current!;
  const state = d.reading.primary;
  const insight = d.candidates.find((c) => c.kind === d.kind)?.ruleInsight;
  return (
    <section>
      <Eyebrow>Here&apos;s what I&apos;m picking up</Eyebrow>
      <div className="mt-4 space-y-5">
        <p className="type-h1 text-ink">{insight ?? STATE_META[state].describe}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] text-muted">Reading right now:</span>
          <StateBadge state={state} p={d.reading.distribution[0]?.p} />
          {d.reading.knowledgeHigh && (
            <span className="text-[13.5px] text-muted">
              · sounds like ability isn&apos;t the problem
            </span>
          )}
        </div>
        <ul className="space-y-1.5 text-[15px] text-ink-2">
          {d.reading.evidence.slice(0, 3).map((e) => (
            <li key={e.key}>· {e.detail}</li>
          ))}
          {heard.length > 0 && (
            <li>· You care about {heard.join(" and ")}, so I&apos;ll use that</li>
          )}
        </ul>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-[13px] text-muted">So I&apos;ll start with</p>
          <p className="mt-1 text-[19px] font-medium text-ink">{d.rationale.headline}</p>
          <p className="mt-1 text-[14px] text-ink-2">
            {INTERVENTION_META[d.kind].describe} Not a lecture.
          </p>
        </div>
        <button type="button" onClick={onFix} className="text-[14px] font-medium text-accent">
          Not quite? Tell me again how you&apos;re feeling.
        </button>
        <p className="text-[12.5px] text-muted">
          This is a reading of the moment, not a judgement about you, and it updates as you go.
          You&apos;ll see why each step was chosen.
        </p>
      </div>
    </section>
  );
}
