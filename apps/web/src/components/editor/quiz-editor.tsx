"use client";

import { questionIssues } from "@quizarena/shared/schemas";
import { ArrowLeft, Eye, Play } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAddQuestion, useQuiz, useReorderQuestions, useUpdateQuiz } from "@/lib/queries";
import { useGoLive } from "@/components/admin/use-go-live";
import { QuestionEditor } from "./question-editor";
import { QuestionNavigator } from "./question-navigator";
import { QuizSettings } from "./quiz-settings";
import { SaveStatus, SaveTracker, useSaveTracker } from "./save-tracker";

type Tab = "questions" | "settings";

export function QuizEditor({ id }: { id: string }) {
  return (
    <SaveTracker>
      <EditorInner id={id} />
    </SaveTracker>
  );
}

function EditorInner({ id }: { id: string }) {
  const { data: quiz, isPending, isError, error, refetch } = useQuiz(id);
  const [tab, setTab] = useState<Tab>("questions");
  const [selected, setSelected] = useState<string | null>(null);
  const addQuestion = useAddQuestion(id);
  const reorder = useReorderQuestions(id);
  const updateQuiz = useUpdateQuiz(id);
  const { track } = useSaveTracker();
  const { goLive, pending: goingLive } = useGoLive();

  if (isPending) {
    return (
      <div>
        <Skeleton className="h-10 w-96" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_1fr_20rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (isError) {
    const notFound = isApiError(error) && error.status === 404;
    return (
      <EmptyState
        title={notFound ? "Quiz not found" : "Couldn't load this quiz"}
        description={notFound ? "It may have been deleted." : "The server didn't respond."}
        action={notFound ? <Link href="/admin/quizzes"><Button>Back to quizzes</Button></Link> : <Button onClick={() => refetch()}>Retry</Button>}
      />
    );
  }

  const questions = quiz.questions;
  const selectedIndex = Math.max(0, questions.findIndex((q) => q.id === selected));
  const current = questions[selectedIndex] ?? null;
  const problems = questions.filter((q) => questionIssues(q).length > 0).length;
  const published = quiz.status === "PUBLISHED";

  const togglePublish = () =>
    track(updateQuiz.mutateAsync({ status: published ? "DRAFT" : "PUBLISHED" })).then(
      () => toast.success(published ? "Moved back to drafts" : "Quiz published"),
      () => {},
    );

  return (
    <div>
      {/* ------------------------------------------------------------ top bar */}
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/admin/quizzes" aria-label="Back to quizzes" className="grid h-9 w-9 shrink-0 place-items-center border border-line text-fg-2 hover:border-line-strong hover:text-fg">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Badge tone={published ? "success" : "neutral"}>{published ? "Published" : "Draft"}</Badge>
              <SaveStatus />
            </div>
            <h1 className="mt-1.5 truncate font-display text-h2">{quiz.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Editor sections" className="mr-2 flex border border-line bg-sunken p-1">
            {(["questions", "settings"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("relative h-8 px-4 text-body-sm font-semibold capitalize transition-colors", tab === t ? "text-fg" : "text-fg-3 hover:text-fg")}
              >
                {tab === t && <motion.span layoutId="editor-tab" className="absolute inset-0 bg-elevated" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span className="relative">
                  {t}
                  {t === "questions" && <span className="numeric ml-1.5 text-fg-3">{questions.length}</span>}
                </span>
              </button>
            ))}
          </div>
          <Link href={`/admin/quizzes/${id}/preview`}>
            <Button variant="secondary" size="md">
              <Eye className="h-4 w-4" /> Preview
            </Button>
          </Link>
          <Button variant="outline" onClick={togglePublish} loading={updateQuiz.isPending} title={!published && problems ? `${problems} question(s) need attention` : undefined}>
            {published ? "Unpublish" : "Publish"}
          </Button>
          <Button notch onClick={() => goLive(id)} loading={goingLive} disabled={problems > 0} title={problems ? "Fix highlighted questions first" : "Open a live arena"}>
            <Play className="h-4 w-4 fill-current" /> Go live
          </Button>
        </div>
      </div>

      {problems > 0 && (
        <p className="mt-4 border-l-2 border-warning bg-warning-soft px-4 py-2.5 text-body-sm text-fg">
          {problems} question{problems > 1 ? "s need" : " needs"} attention before this quiz can be published or played. Look for the amber dot.
        </p>
      )}

      {tab === "settings" ? (
        <div className="mt-6">
          <QuizSettings quiz={quiz} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] min-[1360px]:grid-cols-[14rem_minmax(0,1fr)_18rem] 2xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          <div className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-hidden">
            <QuestionNavigator
              questions={questions}
              selectedId={current?.id ?? null}
              onSelect={setSelected}
              onReorder={(ids) => void track(reorder.mutateAsync(ids)).catch(() => {})}
              adding={addQuestion.isPending}
              defaultTimerSec={quiz.defaultTimerSec}
              onAdd={(type) =>
                void track(addQuestion.mutateAsync({ type })).then(
                  (q) => setSelected(q.id),
                  () => {},
                )
              }
            />
          </div>
          {current ? (
            <div className="grid min-w-0 grid-cols-1 gap-6 min-[1360px]:col-span-2 min-[1360px]:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem]">
              <QuestionEditor
                key={current.id}
                quizId={id}
                question={current}
                index={selectedIndex}
                total={questions.length}
                defaultTimerSec={quiz.defaultTimerSec}
                onDuplicated={() => setSelected(questions[selectedIndex + 1]?.id ?? null)}
                onDeleted={() => setSelected(questions[selectedIndex + 1]?.id ?? questions[selectedIndex - 1]?.id ?? null)}
              />
            </div>
          ) : (
            <EmptyState title="No questions" description="Add your first question from the left panel." />
          )}
        </div>
      )}
    </div>
  );
}
