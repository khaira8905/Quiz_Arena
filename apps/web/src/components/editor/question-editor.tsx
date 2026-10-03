"use client";

import {
  DEFAULT_POINTS,
  OPTION_TEXT_MAX,
  POINT_PRESETS,
  QUESTION_TEXT_MAX,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
  TIMER_PRESETS,
} from "@quizarena/shared/constants";
import type { QuestionDto } from "@quizarena/shared/dto";
import { QUESTION_TYPE_RULES } from "@quizarena/shared/question-types";
import { questionIssues, type QuestionUpdateInput } from "@quizarena/shared/schemas";
import { AlertTriangle, Check, Copy, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { answerStyle } from "@/components/game/answer-style";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/switch";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useDeleteQuestion, useDuplicateQuestion, useUpdateQuestion } from "@/lib/queries";
import { ImageField } from "@/components/media/image-field";
import { DriveImageButton } from "@/components/media/google-drive";
import { useAutosave, useSaveTracker } from "./save-tracker";

type Draft = Omit<QuestionDto, "id" | "order" | "updatedAt">;

const toDraft = (q: QuestionDto): Draft => ({
  type: q.type,
  text: q.text,
  imageUrl: q.imageUrl,
  imageAssetId: q.imageAssetId,
  imageFit: q.imageFit,
  imagePosition: q.imagePosition,
  timeLimitSec: q.timeLimitSec,
  points: q.points,
  explanation: q.explanation,
  randomizeAnswers: q.randomizeAnswers,
  options: q.options,
});

/** Compact multipliers — the settings rail is narrow. "None" makes a practice question. */
const POINT_LABELS: Record<number, string> = {
  0: "None",
  500: "½×",
  1000: "1×",
  2000: "2×",
};

/**
 * Edits one question. The local draft is the source of truth while mounted (so typing is never
 * interrupted by server echoes); every change is autosaved as a minimal patch.
 * Renders two regions — the workspace and the settings rail — for the parent grid.
 */
export function QuestionEditor({
  quizId,
  question,
  index,
  total,
  defaultTimerSec,
  onDeleted,
  onDuplicated,
}: {
  quizId: string;
  question: QuestionDto;
  index: number;
  total: number;
  defaultTimerSec: number;
  onDeleted: () => void;
  onDuplicated: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(question));
  const update = useUpdateQuestion(quizId);
  const del = useDeleteQuestion(quizId);
  const dup = useDuplicateQuestion(quizId);
  const { track } = useSaveTracker();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [customTimer, setCustomTimer] = useState(
    question.timeLimitSec !== null &&
      !(TIMER_PRESETS as readonly number[]).includes(question.timeLimitSec),
  );

  const { schedule } = useAutosave<QuestionUpdateInput>((patch) =>
    update.mutateAsync({ id: question.id, patch }),
  );

  const rules = QUESTION_TYPE_RULES[draft.type];
  const issues = questionIssues(draft);

  const set = <K extends keyof Draft>(key: K, value: Draft[K], immediate = false) => {
    setDraft((d) => ({ ...d, [key]: value }));
    schedule({ [key]: value } as QuestionUpdateInput, immediate);
  };

  const setOptions = (options: Draft["options"], immediate = false) => {
    setDraft((d) => ({ ...d, options }));
    schedule(
      { options: options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) },
      immediate,
    );
  };

  /** Type changes reshape options server-side, so apply the server's answer to the draft. */
  const changeType = (type: Draft["type"]) => {
    if (type === draft.type) return;
    void track(update.mutateAsync({ id: question.id, patch: { type } })).then(
      (q) => setDraft(toDraft(q)),
      () => {},
    );
  };

  const markCorrect = (i: number) =>
    setOptions(
      draft.options.map((o, j) => ({ ...o, isCorrect: j === i })),
      true,
    );

  return (
    <>
      {/* ------------------------------------------------------------ workspace */}
      <section aria-label={`Question ${index + 1}`} className="@container min-w-0">
        <div className="relative rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="label text-fg-3">
              Question <span className="text-accent">{String(index + 1).padStart(2, "0")}</span> /{" "}
              {String(total).padStart(2, "0")}
            </span>
            <span className="label text-fg-3">{rules.label}</span>
          </div>

          <div className="p-5 sm:p-8">
            <label htmlFor={`qtext-${question.id}`} className="sr-only">
              Question text
            </label>
            <AutoGrowTextarea
              id={`qtext-${question.id}`}
              value={draft.text}
              maxLength={QUESTION_TEXT_MAX}
              placeholder={
                draft.type === "TRUE_FALSE"
                  ? "Write a statement players judge true or false…"
                  : "Type your question…"
              }
              onChange={(v) => set("text", v)}
              className="font-display text-[clamp(1.5rem,2.2vw,2.25rem)] font-bold leading-[1.15] tracking-[-0.025em]"
            />
            <div className="mt-1 text-right text-caption text-fg-3">
              {draft.text.length}/{QUESTION_TEXT_MAX}
            </div>

            <ImageField
              value={{
                url: draft.imageUrl,
                assetId: draft.imageAssetId,
                fit: draft.imageFit,
                position: draft.imagePosition,
              }}
              onChange={(patch) => {
                setDraft((d) => ({ ...d, ...patch }));
                // A library image is sent by id; the server fills in its URL itself.
                if ("imageAssetId" in patch && patch.imageAssetId) {
                  schedule({ imageAssetId: patch.imageAssetId }, true);
                } else schedule(patch, true);
              }}
              drive={(pick) => <DriveImageButton onPick={pick} />}
            />

            <div className="mt-6 grid grid-cols-1 gap-3 @xl:grid-cols-2">
              <AnimatePresence initial={false}>
                {draft.options.map((o, i) => {
                  const style = answerStyle(i);
                  return (
                    <motion.div
                      key={o.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      className={cn(
                        "group relative flex min-w-0 items-stretch border-2 bg-sunken transition-colors",
                        o.isCorrect ? style.border : "border-line",
                      )}
                    >
                      <span
                        className={cn(
                          "flex w-12 shrink-0 items-center justify-center font-display text-xl font-extrabold",
                          style.bg,
                          style.ink,
                        )}
                        aria-hidden
                      >
                        {style.letter}
                      </span>
                      <label className="sr-only" htmlFor={`opt-${question.id}-${i}`}>
                        Option {style.letter}
                      </label>
                      <input
                        id={`opt-${question.id}-${i}`}
                        value={o.text}
                        maxLength={OPTION_TEXT_MAX}
                        readOnly={!!rules.fixedOptions}
                        placeholder={`Answer ${style.letter}`}
                        onChange={(e) =>
                          setOptions(
                            draft.options.map((x, j) =>
                              j === i ? { ...x, text: e.target.value } : x,
                            ),
                          )
                        }
                        className="min-w-0 flex-1 bg-transparent px-3 py-4 text-body-lg font-medium text-fg placeholder:text-fg-3 focus:outline-none read-only:cursor-default"
                      />
                      <div className="flex items-center gap-1 pr-2">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={o.isCorrect}
                          aria-label={`Mark ${style.letter} as the correct answer`}
                          onClick={() => markCorrect(i)}
                          className={cn(
                            "flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-caption font-bold transition-colors",
                            o.isCorrect
                              ? "bg-success text-inverse"
                              : "text-fg-3 hover:bg-elevated hover:text-fg",
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">
                            {o.isCorrect ? "Correct" : "Mark"}
                          </span>
                        </button>
                        {!rules.fixedOptions && draft.options.length > rules.minOptions && (
                          <button
                            type="button"
                            aria-label={`Remove option ${style.letter}`}
                            onClick={() =>
                              setOptions(
                                draft.options.filter((_, j) => j !== i),
                                true,
                              )
                            }
                            className="grid h-8 w-8 place-items-center rounded-sm text-fg-3 opacity-60 hover:bg-elevated hover:text-danger group-hover:opacity-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {!rules.fixedOptions && draft.options.length < rules.maxOptions && (
              <button
                type="button"
                onClick={() =>
                  setOptions(
                    [
                      ...draft.options,
                      // A client-side id keeps React keys stable when an earlier option is removed;
                      // only text and correctness are sent to the server.
                      {
                        id: `new-${crypto.randomUUID()}`,
                        order: draft.options.length,
                        text: "",
                        isCorrect: false,
                      },
                    ],
                    true,
                  )
                }
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 border border-dashed border-line-strong text-body-sm font-semibold text-fg-2 hover:border-accent hover:text-accent"
              >
                <Plus className="h-4 w-4" /> Add option {answerStyle(draft.options.length).letter}
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {issues.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-line"
              >
                <ul
                  className="flex flex-wrap gap-x-5 gap-y-1 bg-warning-soft px-5 py-3 text-body-sm text-warning"
                  aria-live="polite"
                >
                  {issues.map((i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {i}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ------------------------------------------------------------ settings rail */}
      <aside
        aria-label="Question settings"
        className="flex flex-col gap-6 border border-line bg-surface p-5"
      >
        <div>
          <h3 className="label mb-3 text-fg-2">Type</h3>
          <Segmented
            label="Question type"
            value={draft.type}
            onChange={changeType}
            options={[
              { value: "MULTIPLE_CHOICE", label: "Choice" },
              { value: "TRUE_FALSE", label: "True / False" },
            ]}
          />
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="label text-fg-2">Timer</h3>
            <span className="numeric text-body font-bold">
              {draft.timeLimitSec ?? defaultTimerSec}s
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            <TimerChip
              active={draft.timeLimitSec === null && !customTimer}
              onClick={() => (setCustomTimer(false), set("timeLimitSec", null, true))}
            >
              Auto
            </TimerChip>
            {TIMER_PRESETS.map((t) => (
              <TimerChip
                key={t}
                active={draft.timeLimitSec === t && !customTimer}
                onClick={() => (setCustomTimer(false), set("timeLimitSec", t, true))}
              >
                {t}
              </TimerChip>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCustomTimer(true)}
              className={cn("label", customTimer ? "text-accent" : "text-fg-3 hover:text-fg")}
            >
              Custom
            </button>
            {customTimer && (
              <Input
                type="number"
                aria-label="Custom timer in seconds"
                min={TIMER_MIN_SECONDS}
                max={TIMER_MAX_SECONDS}
                defaultValue={draft.timeLimitSec ?? defaultTimerSec}
                onBlur={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= TIMER_MIN_SECONDS && v <= TIMER_MAX_SECONDS)
                    set("timeLimitSec", v, true);
                  else
                    toast.error(
                      `Timer must be between ${TIMER_MIN_SECONDS} and ${TIMER_MAX_SECONDS} seconds`,
                    );
                }}
                className="h-8 w-24"
              />
            )}
          </div>
          <p className="mt-2 text-caption text-fg-3">
            Auto uses the quiz default ({defaultTimerSec}s).
          </p>
        </div>

        <div>
          <h3 className="label mb-3 text-fg-2">Points</h3>
          <Segmented
            label="Points"
            value={
              (POINT_PRESETS as readonly number[]).includes(draft.points)
                ? draft.points
                : DEFAULT_POINTS
            }
            onChange={(v) => set("points", v, true)}
            options={POINT_PRESETS.map((p) => ({ value: p, label: POINT_LABELS[p] ?? p }))}
          />
        </div>

        {draft.type !== "TRUE_FALSE" && (
          <Switch
            label="Shuffle answers"
            description="Randomise option order for this question."
            checked={draft.randomizeAnswers}
            onChange={(v) => set("randomizeAnswers", v, true)}
          />
        )}

        <Field label="Explanation" hint="Shown after the reveal, if correct answers are shown.">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={500}
              value={draft.explanation}
              onChange={(e) => set("explanation", e.target.value)}
            />
          )}
        </Field>

        <div className="mt-auto flex gap-2 border-t border-line pt-5">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            loading={dup.isPending}
            onClick={() =>
              dup.mutate(question.id, {
                onSuccess: () => {
                  toast.success("Question duplicated");
                  onDuplicated();
                },
                onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't duplicate"),
              })
            }
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 hover:text-danger"
            disabled={total <= 1}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete question ${index + 1}?`}
        description="This can't be undone."
        confirmLabel="Delete question"
        onConfirm={() =>
          del.mutateAsync(question.id).then(onDeleted, (e) => {
            toast.error(isApiError(e) ? e.message : "Couldn't delete");
          })
        }
      />
    </>
  );
}

function TimerChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "numeric h-9 rounded-sm border text-body-sm font-bold transition-colors",
        active
          ? "border-accent bg-accent text-accent-ink"
          : "border-line bg-sunken text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  className,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full resize-none overflow-hidden bg-transparent text-fg placeholder:text-fg-3/70 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
