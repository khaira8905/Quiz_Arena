"use client";

import {
  ARENA_THEMES,
  type ArenaAppearance,
  type ArenaTheme,
  type BackgroundStyle,
  type MotionLevel,
  type ParticipantLayout,
  type ProjectorLayout,
  THEME_TOKENS,
  type TimerStyle,
  type TransitionPreset,
  type TypographyPreset,
  arenaAppearanceSchema,
  resolveArenaColors,
} from "@quizarena/shared/appearance";
import type { QuizDto } from "@quizarena/shared/dto";
import type { QuizUpdateInput } from "@quizarena/shared/schemas";
import { Check, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { answerStyle } from "@/components/game/answer-style";
import { Field, Input } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/switch";
import {
  type ArenaPreviewState,
  PREVIEW_MESSAGE,
  PREVIEW_READY,
  PREVIEW_SCENES,
  type PreviewScene,
  type PreviewSurface,
} from "@/lib/arena-preview";
import { cn } from "@/lib/cn";
import { useUpdateQuiz } from "@/lib/queries";
import { Panel } from "./quiz-settings";
import { useAutosave } from "./save-tracker";

const TYPE_SAMPLES: Record<TypographyPreset, { name: string; display: string; body: string }> = {
  ARENA: { name: "Arena", display: "var(--font-sora)", body: "var(--font-geist)" },
  TECHNICAL: { name: "Technical", display: "var(--font-space-grotesk)", body: "var(--font-geist)" },
  CLEAN: { name: "Clean", display: "var(--font-jakarta)", body: "var(--font-jakarta)" },
};

const SCENE_LABEL: Record<PreviewScene, string> = {
  lobby: "Lobby",
  question: "Question",
  reveal: "Reveal",
  leaderboard: "Leaderboard",
};

/**
 * CUSTOMIZE ARENA: every visual decision for the projector and phones, with a live preview
 * rendered by the real game screens. Changes preview instantly and autosave once valid;
 * readability limits are enforced by the same schema the server uses.
 */
export function ArenaCustomizer({ quiz }: { quiz: QuizDto }) {
  const update = useUpdateQuiz(quiz.id);
  const { schedule } = useAutosave<QuizUpdateInput>((patch) => update.mutateAsync(patch), 500);
  const [draft, setDraft] = useState<ArenaAppearance>(quiz.appearance);
  const [sound, setSound] = useState(quiz.soundEnabled);
  const [scene, setScene] = useState<PreviewScene>("question");

  const parsed = useMemo(() => arenaAppearanceSchema.safeParse(draft), [draft]);
  const errors = useMemo(
    () =>
      parsed.success
        ? {}
        : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
    [parsed],
  ) as Record<string, string>;
  const colors = resolveArenaColors(draft);
  const theme = THEME_TOKENS[draft.theme];

  const change = (patch: Partial<ArenaAppearance>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const valid = arenaAppearanceSchema.safeParse(next);
    // Invalid drafts still preview (so the organiser sees why) but are never saved.
    if (valid.success) schedule({ appearance: valid.data });
  };

  const sample = quiz.questions.find((q) => q.text.trim() && q.options.length >= 2) ?? null;
  const previewState: ArenaPreviewState = {
    appearance: draft,
    scene,
    title: quiz.title,
    questionCount: quiz.questions.length,
    settings: {
      scoringMode: quiz.scoringMode,
      streakBonus: quiz.streakBonus,
      showLeaderboard: quiz.showLeaderboard,
      showCorrectAnswers: quiz.showCorrectAnswers,
      showAnswerStats: quiz.showAnswerStats,
      allowLateJoin: quiz.allowLateJoin,
      participantLimit: quiz.participantLimit,
      soundEnabled: sound,
      nicknameFilter: quiz.nicknameFilter,
      readingMode: quiz.readingMode,
      readingTimeSec: quiz.readingTimeSec,
    },
    question: sample
      ? {
          text: sample.text,
          options: sample.options.map((o) => ({ text: o.text, correct: o.isCorrect })),
          explanation: sample.explanation,
          points: sample.points,
          durationSec: sample.timeLimitSec ?? quiz.defaultTimerSec,
        }
      : null,
  };

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ live preview */}
      <section
        aria-label="Live preview"
        className="order-first border border-line bg-surface xl:sticky xl:top-6 xl:order-last"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div>
            <h2 className="font-display text-h3">Live preview</h2>
            <p className="text-body-sm text-fg-3">
              The real projector and phone screens, updating as you change things.
            </p>
          </div>
          <Segmented
            label="Preview scene"
            className="w-full sm:w-auto"
            value={scene}
            onChange={setScene}
            options={PREVIEW_SCENES.map((s) => ({ value: s, label: SCENE_LABEL[s] }))}
          />
        </header>
        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_10.5rem] md:items-start">
          <div>
            <p className="label mb-2 text-fg-3">Projector · 1920 × 1080</p>
            <ScaledFrame surface="projector" width={1920} height={1080} state={previewState} />
          </div>
          <div className="mx-auto w-40 md:w-full">
            <p className="label mb-2 text-fg-3">Phone · 390 × 844</p>
            <div className="rounded-[1.4rem] border-[5px] border-line-strong bg-sunken p-0.5">
              <ScaledFrame
                surface="phone"
                width={390}
                height={844}
                state={previewState}
                className="rounded-[1rem]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ controls */}
      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Theme" description="A complete visual system for the projector and phones.">
          <div role="radiogroup" aria-label="Arena theme" className="grid grid-cols-3 gap-2">
            {ARENA_THEMES.map((t) => (
              <ThemeCard
                key={t}
                theme={t}
                selected={draft.theme === t}
                onSelect={() =>
                  // Custom colours were validated against the old background; start clean.
                  change({ theme: t, accent: null, answerColors: null })
                }
              />
            ))}
          </div>
          <p className="text-body-sm text-fg-2">{theme.description}</p>
        </Panel>

        <Panel
          title="Colours"
          description="Optional overrides. Unreadable combinations are blocked, not saved."
        >
          <ColorControl
            label="Accent"
            hint="Game PIN, timer, highlights."
            value={colors.accent}
            custom={draft.accent !== null}
            onChange={(v) => change({ accent: v })}
            onReset={() => change({ accent: null })}
            error={errors.accent}
          />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label text-fg-2">Answer colours</span>
              {draft.answerColors && (
                <button
                  type="button"
                  onClick={() => change({ answerColors: null })}
                  className="label inline-flex items-center gap-1 text-fg-3 hover:text-fg"
                >
                  <RotateCcw className="h-3 w-3" /> Theme colours
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {colors.answers.map((c, i) => (
                <AnswerSwatch
                  key={i}
                  index={i}
                  value={c}
                  ink={colors.answerInks[i]!}
                  error={errors[`answerColors.${i}`]}
                  onChange={(v) => {
                    const next = [...colors.answers] as [string, string, string, string];
                    next[i] = v;
                    change({ answerColors: next });
                  }}
                />
              ))}
            </div>
            {Object.entries(errors)
              .filter(([k]) => k.startsWith("answerColors"))
              .map(([k, m]) => (
                <p key={k} className="mt-2 text-body-sm text-danger" role="alert">
                  {m}
                </p>
              ))}
          </div>
        </Panel>

        <Panel title="Background" description="The stage behind every screen.">
          <Segmented<BackgroundStyle>
            label="Background style"
            value={draft.background}
            onChange={(v) => change({ background: v })}
            options={[
              { value: "GRID", label: "Grid" },
              { value: "BEAMS", label: "Beams" },
              { value: "PLAIN", label: "Plain" },
              { value: "IMAGE", label: "Image" },
            ]}
          />
          {draft.background === "IMAGE" && (
            <Field
              label="Background image URL"
              hint="A dark scrim keeps questions readable over any image."
              error={errors.backgroundImageUrl}
            >
              {(p) => (
                <Input
                  {...p}
                  placeholder="https://…"
                  defaultValue={draft.backgroundImageUrl ?? ""}
                  onBlur={(e) => change({ backgroundImageUrl: e.target.value.trim() || null })}
                />
              )}
            </Field>
          )}
        </Panel>

        <Panel title="Typography" description="Display face for questions and numbers.">
          <div role="radiogroup" aria-label="Typography preset" className="grid grid-cols-3 gap-2">
            {(Object.keys(TYPE_SAMPLES) as TypographyPreset[]).map((t) => {
              const s = TYPE_SAMPLES[t];
              const on = draft.typography === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => change({ typography: t })}
                  className={cn(
                    "relative border-2 bg-sunken p-3 text-left transition-colors",
                    on ? "border-accent" : "border-line hover:border-line-strong",
                  )}
                >
                  <span
                    className="block text-3xl font-extrabold leading-none tracking-[-0.03em]"
                    style={{ fontFamily: s.display }}
                  >
                    Aa 07
                  </span>
                  <span
                    className="mt-2 block text-body-sm text-fg-2"
                    style={{ fontFamily: s.body }}
                  >
                    {s.name}
                  </span>
                  {on && <Check className="absolute right-2 top-2 h-4 w-4 text-accent" />}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Motion & sound" description="How lively the arena feels.">
          <div>
            <div className="label mb-2 text-fg-2">Animation intensity</div>
            <Segmented<MotionLevel>
              label="Animation intensity"
              value={draft.motion}
              onChange={(v) => change({ motion: v })}
              options={[
                { value: "SUBTLE", label: "Subtle" },
                { value: "NORMAL", label: "Normal" },
                { value: "HIGH", label: "High" },
              ]}
            />
            <p className="mt-2 text-caption text-fg-3">
              {draft.motion === "SUBTLE"
                ? "Quiet transitions, no confetti. Good for exams and formal events."
                : draft.motion === "HIGH"
                  ? "Bigger entrances, stronger timer pressure, more confetti."
                  : "Balanced motion with celebration at the big moments."}{" "}
              Devices set to reduce motion always get the calm version.
            </p>
          </div>
          <div>
            <div className="label mb-2 text-fg-2">Question transition</div>
            <Segmented<TransitionPreset>
              label="Question transition"
              value={draft.transition}
              onChange={(v) => change({ transition: v })}
              options={[
                { value: "SLIDE", label: "Slide" },
                { value: "RISE", label: "Rise" },
                { value: "FADE", label: "Fade" },
              ]}
            />
          </div>
          <Switch
            label="Leaderboard animation"
            description="Players visibly overtake each other between questions."
            checked={draft.leaderboardAnimation}
            onChange={(v) => change({ leaderboardAnimation: v })}
          />
          <Switch
            label="Sound effects"
            description="Countdown ticks and reveal cues on the projector and phones."
            checked={sound}
            onChange={(v) => {
              setSound(v);
              schedule({ soundEnabled: v }, true);
            }}
          />
        </Panel>

        <Panel title="Timer & layout" description="How time and space are used on each screen.">
          <div>
            <div className="label mb-2 text-fg-2">Timer style</div>
            <Segmented<TimerStyle>
              label="Timer style"
              value={draft.timerStyle}
              onChange={(v) => change({ timerStyle: v })}
              options={[
                { value: "CIRCULAR", label: "Circular" },
                { value: "DIGITAL", label: "Digital" },
                { value: "PROGRESS", label: "Progress" },
                { value: "MINIMAL", label: "Minimal" },
              ]}
            />
          </div>
          <div>
            <div className="label mb-2 text-fg-2">Projector layout</div>
            <Segmented<ProjectorLayout>
              label="Projector layout"
              value={draft.projectorLayout}
              onChange={(v) => change({ projectorLayout: v })}
              options={[
                { value: "STANDARD", label: "Standard" },
                { value: "WIDE", label: "Wide" },
                { value: "MINIMAL", label: "Minimal" },
              ]}
            />
          </div>
          <div>
            <div className="label mb-2 text-fg-2">Phone layout</div>
            <Segmented<ParticipantLayout>
              label="Phone layout"
              value={draft.participantLayout}
              onChange={(v) => change({ participantLayout: v })}
              options={[
                { value: "STANDARD", label: "Standard" },
                { value: "COMPACT", label: "Compact" },
              ]}
            />
          </div>
        </Panel>

        <Panel title="Branding" description="Your event's name and logo on the projector.">
          <Field label="Event name" hint="Shown next to the quiz title. Up to 60 characters.">
            {(p) => (
              <Input
                {...p}
                maxLength={60}
                placeholder="e.g. Tech Fest 2026"
                value={draft.eventName}
                onChange={(e) => change({ eventName: e.target.value })}
              />
            )}
          </Field>
          <Field
            label="Logo URL"
            hint="A transparent PNG or SVG works best."
            error={errors.logoUrl}
          >
            {(p) => (
              <Input
                {...p}
                placeholder="https://…"
                defaultValue={draft.logoUrl ?? ""}
                onBlur={(e) => change({ logoUrl: e.target.value.trim() || null })}
              />
            )}
          </Field>
        </Panel>
      </div>
    </div>
  );
}

function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: ArenaTheme;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = THEME_TOKENS[theme];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative border-2 p-1 text-left transition-colors",
        selected ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      {/* Miniature arena drawn from the theme's own tokens. */}
      <span
        className="block aspect-[16/10] p-2"
        style={{ background: t.bg, border: `1px solid ${t.line}` }}
        aria-hidden
      >
        <span className="flex items-center justify-between">
          <span className="block h-1.5 w-8 rounded-full" style={{ background: t.text }} />
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: t.accent }} />
        </span>
        <span className="mt-2 block h-1 w-14 rounded-full" style={{ background: t.textMuted }} />
        <span className="mt-2 grid grid-cols-2 gap-1">
          {t.answers.map((a) => (
            <span key={a} className="block h-3" style={{ background: a }} />
          ))}
        </span>
      </span>
      <span className="flex items-center justify-between px-1.5 pb-0.5 pt-2">
        <span className="text-body-sm font-semibold">{t.label}</span>
        {selected && <Check className="h-4 w-4 text-accent" />}
      </span>
    </button>
  );
}

function ColorControl({
  label,
  hint,
  value,
  custom,
  onChange,
  onReset,
  error,
}: {
  label: string;
  hint: string;
  value: string;
  custom: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
  error?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <label className="relative grid h-11 w-11 shrink-0 cursor-pointer place-items-center border border-line-strong">
          <span className="absolute inset-1" style={{ background: value }} />
          <input
            type="color"
            value={value}
            aria-label={`${label} colour`}
            aria-invalid={!!error || undefined}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="label text-fg-2">{label}</div>
          <div className="text-body-sm text-fg-3">
            <span className="numeric text-fg">{value.toUpperCase()}</span> ·{" "}
            {custom ? "custom" : "theme default"} · {hint}
          </div>
        </div>
        {custom && (
          <button
            type="button"
            onClick={onReset}
            className="label inline-flex items-center gap-1 text-fg-3 hover:text-fg"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-body-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function AnswerSwatch({
  index,
  value,
  ink,
  error,
  onChange,
}: {
  index: number;
  value: string;
  ink: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const s = answerStyle(index);
  return (
    <label
      className={cn(
        "notch-sm relative flex h-14 cursor-pointer items-center justify-between px-3 font-display font-extrabold",
        error && "outline outline-2 outline-offset-2 outline-danger",
      )}
      style={{ background: value, color: ink }}
    >
      <span className="text-xl">{s.letter}</span>
      <span className="numeric text-[11px] font-bold opacity-80">{value.toUpperCase()}</span>
      <input
        type="color"
        value={value}
        aria-label={`Answer ${s.letter} colour`}
        aria-invalid={!!error || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

/**
 * Renders /arena-preview at its true size in an iframe and scales it to fit, so viewport
 * units inside the real screens behave exactly as on a projector or phone.
 */
function ScaledFrame({
  surface,
  width,
  height,
  state,
  className,
}: {
  surface: PreviewSurface;
  width: number;
  height: number;
  state: ArenaPreviewState;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(state);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale((entry?.contentRect.width ?? 0) / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const post = () =>
    frame.current?.contentWindow?.postMessage(
      { type: PREVIEW_MESSAGE, state: latest.current },
      window.location.origin,
    );

  useEffect(() => {
    latest.current = state;
    post();
  });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if ((e.data as { type?: string } | null)?.type === PREVIEW_READY) post();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      ref={box}
      className={cn("relative w-full overflow-hidden bg-sunken", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <iframe
        ref={frame}
        src={`/arena-preview?surface=${surface}`}
        title={`${surface === "phone" ? "Phone" : "Projector"} preview`}
        tabIndex={-1}
        width={width}
        height={height}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      />
    </div>
  );
}
