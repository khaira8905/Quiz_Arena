"use client";

import type { BankQuestionDto } from "@quizarena/shared/dto";
import { Check, ImageIcon, Library, Plus, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { answerStyle } from "@/components/game/answer-style";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  useBank,
  useCopyQuestions,
  useCreateQuiz,
  useQuizzes,
  type BankFilters,
} from "@/lib/queries";

const DIFFICULTY_LABEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as const;
const DIFFICULTY_TONE = {
  EASY: "border-success/40 text-success",
  MEDIUM: "border-warning/40 text-warning",
  HARD: "border-danger/40 text-danger",
} as const;

/**
 * QUESTION BANK: every question you've written, across all quizzes. Filter by text, tag,
 * category, difficulty, type or quiz, select some, and add copies to any quiz.
 */
export function QuestionBank() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [filters, setFilters] = useState<BankFilters>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string>("");
  const { data, isPending, isError, refetch } = useBank(filters);
  const quizzes = useQuizzes();
  const copy = useCopyQuestions();
  const create = useCreateQuiz();

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: text.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [text]);

  const set = (k: keyof BankFilters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const visibleIds = useMemo(() => data?.questions.map((q) => q.id) ?? [], [data]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const active = Object.values(filters).some(Boolean);

  const addTo = async (quizId: string, title?: string) => {
    try {
      const quiz = await copy.mutateAsync({ quizId, questionIds: selected });
      toast.success(
        `${selected.length} question${selected.length === 1 ? "" : "s"} added to “${title ?? quiz.title}”`,
        { action: { label: "Open quiz", onClick: () => router.push(`/admin/quizzes/${quiz.id}`) } },
      );
      setSelected([]);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't add the questions");
    }
  };

  const addToNew = async () => {
    try {
      const quiz = await create.mutateAsync({ title: "New quiz from the bank" });
      await addTo(quiz.id, quiz.title);
      router.push(`/admin/quizzes/${quiz.id}`);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't create the quiz");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Question bank"
        description="Every question you've written, ready to reuse. Adding to a quiz makes a copy, so editing one never changes another."
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-[2]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <Input
            aria-label="Search questions and answers"
            placeholder="Search questions and answers"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Category"
          value={filters.category ?? ""}
          onChange={(e) => set("category", e.target.value)}
          className="min-w-40 flex-1"
        >
          <option value="">All categories</option>
          {data?.facets.categories.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category} ({c.count})
            </option>
          ))}
        </Select>
        <Select
          aria-label="Difficulty"
          value={filters.difficulty ?? ""}
          onChange={(e) => set("difficulty", e.target.value)}
          className="min-w-36 flex-1"
        >
          <option value="">Any difficulty</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </Select>
        <Select
          aria-label="Question type"
          value={filters.type ?? ""}
          onChange={(e) => set("type", e.target.value)}
          className="min-w-36 flex-1"
        >
          <option value="">Any type</option>
          <option value="MULTIPLE_CHOICE">Multiple choice</option>
          <option value="TRUE_FALSE">True / False</option>
        </Select>
        <Select
          aria-label="Quiz"
          value={filters.quizId ?? ""}
          onChange={(e) => set("quizId", e.target.value)}
          className="min-w-44 flex-1"
        >
          <option value="">All quizzes</option>
          {quizzes.data?.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title}
            </option>
          ))}
        </Select>
      </div>

      {!!data?.facets.tags.length && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Filter by tag">
          <span className="label mr-1 text-fg-3">Tags</span>
          {data.facets.tags.slice(0, 16).map((t) => {
            const on = filters.tag === t.tag;
            return (
              <button
                key={t.tag}
                type="button"
                aria-pressed={on}
                onClick={() => set("tag", on ? "" : t.tag)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-body-sm transition-colors",
                  on
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line text-fg-2 hover:border-fg-3 hover:text-fg",
                )}
              >
                {t.tag} <span className="opacity-70">{t.count}</span>
              </button>
            );
          })}
          {active && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText("");
                setFilters({});
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-body-sm text-fg-2">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() =>
              setSelected(
                allVisibleSelected
                  ? selected.filter((id) => !visibleIds.includes(id))
                  : [...new Set([...selected, ...visibleIds])],
              )
            }
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Select all shown
        </label>
        {data && (
          <span className="text-body-sm text-fg-3">
            {data.total} question{data.total === 1 ? "" : "s"}
            {data.total >= 300 ? " (first 300 — narrow the filters)" : ""}
          </span>
        )}
      </div>

      <div className="mt-3 pb-28">
        {isError ? (
          <EmptyState
            title="Couldn't load the bank"
            description="The server didn't respond."
            action={<Button onClick={() => refetch()}>Retry</Button>}
          />
        ) : isPending ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : data.questions.length === 0 ? (
          <EmptyState
            icon={<Library className="h-6 w-6" />}
            title={active ? "No questions match" : "Your bank is empty"}
            description={
              active
                ? "Try fewer filters."
                : "Questions you write in any quiz appear here. Tag them in the editor to find them faster."
            }
            action={
              !active ? (
                <Link href="/admin/quizzes" className="underline">
                  Go to your quizzes
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.questions.map((q) => (
              <BankRow
                key={q.id}
                q={q}
                selected={selected.includes(q.id)}
                onToggle={() => toggle(q.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-3 border border-line-strong bg-elevated px-4 py-3 shadow-[0_18px_50px_-18px_rgb(0_0_0/0.6)]"
            role="region"
            aria-label="Selected questions"
          >
            <span className="font-semibold">{selected.length} selected</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Select
                aria-label="Add to quiz"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 w-56"
              >
                <option value="">Choose a quiz…</option>
                {quizzes.data?.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                disabled={!target}
                loading={copy.isPending}
                onClick={() => void addTo(target)}
              >
                <Plus className="h-4 w-4" /> Add to quiz
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={create.isPending}
                onClick={() => void addToNew()}
              >
                New quiz
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function BankRow({
  q,
  selected,
  onToggle,
}: {
  q: BankQuestionDto;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={cn(
        "flex gap-4 border bg-surface p-4 transition-colors",
        selected ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select: ${q.text || "Untitled question"}`}
        onClick={onToggle}
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border",
          selected ? "border-accent bg-accent text-accent-ink" : "border-line-strong",
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onToggle} className="block text-left">
          <span className="font-display text-body-lg font-bold leading-snug">
            {q.text || <span className="text-fg-3">Untitled question</span>}
          </span>
        </button>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {q.options.map((o, i) => (
            <li
              key={o.id}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-body-sm",
                o.isCorrect ? "border-success/50 text-fg" : "border-line text-fg-3",
              )}
            >
              <span className={cn("font-display font-bold", answerStyle(i).text)}>
                {answerStyle(i).letter}
              </span>
              {o.text || "—"}
              {o.isCorrect && <Check className="h-3 w-3 text-success" aria-label="correct" />}
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-caption">
          {q.difficulty && (
            <span
              className={cn("label rounded-sm border px-1.5 py-0.5", DIFFICULTY_TONE[q.difficulty])}
            >
              {DIFFICULTY_LABEL[q.difficulty]}
            </span>
          )}
          {q.category && (
            <span className="label rounded-sm border border-line px-1.5 py-0.5 text-fg-2">
              {q.category}
            </span>
          )}
          {q.tags.map((t) => (
            <span key={t} className="rounded-full bg-elevated px-2 py-0.5 text-fg-2">
              #{t}
            </span>
          ))}
          {q.imageUrl && <ImageIcon className="h-3.5 w-3.5 text-fg-3" aria-label="Has an image" />}
          <Link
            href={`/admin/quizzes/${q.quizId}`}
            className="ml-auto truncate text-fg-3 underline-offset-2 hover:text-fg hover:underline"
          >
            in {q.quizTitle}
          </Link>
        </div>
      </div>
    </li>
  );
}
