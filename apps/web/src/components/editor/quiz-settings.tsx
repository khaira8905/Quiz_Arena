"use client";

import {
  PARTICIPANT_LIMIT_MAX,
  QUIZ_DESCRIPTION_MAX,
  QUIZ_TITLE_MAX,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
  TIMER_PRESETS,
} from "@quizarena/shared/constants";
import type { QuizDto } from "@quizarena/shared/dto";
import type { QuizUpdateInput } from "@quizarena/shared/schemas";
import { useState } from "react";
import { toast } from "sonner";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { useUpdateQuiz } from "@/lib/queries";
import { useAutosave } from "./save-tracker";

/** Quiz-wide configuration. Every control autosaves; text fields are debounced. */
export function QuizSettings({ quiz }: { quiz: QuizDto }) {
  const update = useUpdateQuiz(quiz.id);
  const [draft, setDraft] = useState(quiz);
  const { schedule } = useAutosave<QuizUpdateInput>((patch) => update.mutateAsync(patch), 700);

  const set = <K extends keyof QuizUpdateInput & keyof QuizDto>(key: K, value: QuizDto[K], immediate = true) => {
    setDraft((d) => ({ ...d, [key]: value }));
    schedule({ [key]: value } as QuizUpdateInput, immediate);
  };

  const isPreset = (TIMER_PRESETS as readonly number[]).includes(draft.defaultTimerSec);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Basics" description="How the quiz appears in your library and on the projector.">
        <Field label="Title" error={!draft.title.trim() ? "A title is required" : null}>
          {(p) => <Input {...p} maxLength={QUIZ_TITLE_MAX} value={draft.title} onChange={(e) => set("title", e.target.value, false)} />}
        </Field>
        <Field label="Description">
          {(p) => <Textarea {...p} rows={3} maxLength={QUIZ_DESCRIPTION_MAX} value={draft.description} onChange={(e) => set("description", e.target.value, false)} />}
        </Field>
        <Field label="Cover image URL" hint="Optional. Shown on the projector lobby screen.">
          {(p) => (
            <Input
              {...p}
              placeholder="https://…"
              defaultValue={draft.coverImageUrl ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && !/^https?:\/\//i.test(v)) return void toast.error("Use an https:// image URL");
                if ((v || null) !== draft.coverImageUrl) set("coverImageUrl", v || null);
              }}
            />
          )}
        </Field>
      </Panel>

      <Panel title="Timing & scoring" description="Defaults for every question. Individual questions can override the timer.">
        <div>
          <div className="label mb-3 flex justify-between text-fg-2">
            Default timer <span className="numeric text-body text-fg">{draft.defaultTimerSec}s</span>
          </div>
          <div className="grid grid-cols-5 gap-1 sm:grid-cols-9">
            {TIMER_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={draft.defaultTimerSec === t}
                onClick={() => set("defaultTimerSec", t)}
                className={cn(
                  "numeric h-9 rounded-sm border text-body-sm font-bold transition-colors",
                  draft.defaultTimerSec === t ? "border-accent bg-accent text-accent-ink" : "border-line bg-sunken text-fg-2 hover:text-fg",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-3 text-body-sm text-fg-2">
            Custom
            <Input
              type="number"
              min={TIMER_MIN_SECONDS}
              max={TIMER_MAX_SECONDS}
              defaultValue={isPreset ? "" : draft.defaultTimerSec}
              placeholder="sec"
              className="h-8 w-24"
              onBlur={(e) => {
                if (!e.target.value) return;
                const v = Math.round(Number(e.target.value));
                if (v >= TIMER_MIN_SECONDS && v <= TIMER_MAX_SECONDS) set("defaultTimerSec", v);
                else toast.error(`Timer must be between ${TIMER_MIN_SECONDS} and ${TIMER_MAX_SECONDS} seconds`);
              }}
            />
          </label>
        </div>
        <div>
          <div className="label mb-3 text-fg-2">Scoring</div>
          <Segmented
            label="Scoring mode"
            value={draft.scoringMode}
            onChange={(v) => set("scoringMode", v)}
            options={[
              { value: "SPEED", label: "Speed + accuracy" },
              { value: "ACCURACY", label: "Accuracy only" },
            ]}
          />
          <p className="mt-2 text-caption text-fg-3">
            {draft.scoringMode === "SPEED"
              ? "Correct answers earn 50–100% of the question's points, the faster the better."
              : "Every correct answer earns the full points, regardless of speed."}
          </p>
        </div>
        <Switch label="Streak bonus" description="+5% per consecutive correct answer, up to +25%." checked={draft.streakBonus} onChange={(v) => set("streakBonus", v)} />
      </Panel>

      <Panel title="Gameplay" description="What players and the projector see during the game.">
        <Switch label="Shuffle question order" description="Order is fixed when the game starts." checked={draft.randomizeQuestions} onChange={(v) => set("randomizeQuestions", v)} />
        <Switch label="Shuffle answer order" description="Applies to every multiple-choice question." checked={draft.randomizeAnswers} onChange={(v) => set("randomizeAnswers", v)} />
        <Switch label="Show leaderboard" description="Offer a leaderboard between questions." checked={draft.showLeaderboard} onChange={(v) => set("showLeaderboard", v)} />
        <Switch label="Show correct answers" description="Reveal the right answer and explanation after each question." checked={draft.showCorrectAnswers} onChange={(v) => set("showCorrectAnswers", v)} />
        <Switch label="Show answer statistics" description="Show how the room voted on the projector." checked={draft.showAnswerStats} onChange={(v) => set("showAnswerStats", v)} />
        <Switch label="Sound effects" description="Countdown ticks and reveal cues on the projector and phones." checked={draft.soundEnabled} onChange={(v) => set("soundEnabled", v)} />
      </Panel>

      <Panel title="Players" description="Who can get in, and when.">
        <Switch label="Allow late joining" description="Players can join after the game has started." checked={draft.allowLateJoin} onChange={(v) => set("allowLateJoin", v)} />
        <Switch label="Nickname filter" description="Block offensive nicknames." checked={draft.nicknameFilter} onChange={(v) => set("nicknameFilter", v)} />
        <Field label="Participant limit" hint={`Between 2 and ${PARTICIPANT_LIMIT_MAX}.`}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={2}
              max={PARTICIPANT_LIMIT_MAX}
              defaultValue={draft.participantLimit}
              className="w-32"
              onBlur={(e) => {
                const v = Math.round(Number(e.target.value));
                if (v >= 2 && v <= PARTICIPANT_LIMIT_MAX) {
                  if (v !== draft.participantLimit) set("participantLimit", v);
                } else toast.error(`Limit must be between 2 and ${PARTICIPANT_LIMIT_MAX}`);
              }}
            />
          )}
        </Field>
      </Panel>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-display text-h3">{title}</h2>
        <p className="mt-0.5 text-body-sm text-fg-3">{description}</p>
      </header>
      <div className="flex flex-col gap-5 p-5">{children}</div>
    </section>
  );
}
