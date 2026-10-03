"use client";

import type { PublicQuestion, TimerState } from "@quizarena/shared/game";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArenaThemeProvider } from "@/components/arena/arena-theme";
import { Logo } from "@/components/brand/logo";
import { StageQuestion } from "@/components/game/stage-question";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Kbd, Spinner, StatusScreen } from "@/components/ui/misc";
import { isApiError } from "@/lib/api";
import { useQuiz } from "@/lib/queries";

/** Projector preview: the real stage component fed from the editor's data, timer frozen. */
export function QuizPreview({ id }: { id: string }) {
  const { data: quiz, isPending, isError, error } = useQuiz(id);
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState(false);
  const total = quiz?.questions.length ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const step = e.key === "ArrowRight" ? 1 : -1;
        setIndex((i) => Math.min(total - 1, Math.max(0, i + step)));
        setReveal(false);
      }
      if (e.key === " ") {
        e.preventDefault();
        setReveal((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  if (isPending) {
    return (
      <div className="arena-floor grid h-dvh place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (isError) {
    const auth = isApiError(error) && error.status === 401;
    return (
      <StatusScreen
        eyebrow="Preview"
        title={auth ? "Sign in to preview" : "Quiz not found"}
        tone="danger"
        action={
          <Link
            href={auth ? `/admin/login?next=/admin/quizzes/${id}/preview` : "/admin/quizzes"}
            className={buttonClasses()}
          >
            {auth ? "Sign in" : "Back to quizzes"}
          </Link>
        }
      />
    );
  }

  const q = quiz.questions[index];
  const durationMs = (q?.timeLimitSec ?? quiz.defaultTimerSec) * 1000;
  const question: PublicQuestion | null = q
    ? {
        id: q.id,
        index,
        total,
        type: q.type,
        text: q.text || "Untitled question",
        imageUrl: q.imageUrl,
        imageFit: q.imageFit,
        imagePosition: q.imagePosition,
        imagePlaceholder: null,
        points: q.points,
        durationMs,
        options: q.options.map((o) => ({ id: o.id, text: o.text || "—" })),
      }
    : null;
  const timer: TimerState = {
    startedAt: 0,
    deadline: 0,
    durationMs,
    paused: true,
    remainingMs: durationMs,
  };

  return (
    <ArenaThemeProvider appearance={quiz.appearance} page>
      <div className="arena-floor flex h-dvh flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-5">
          <div className="flex items-center gap-4">
            <Link
              href={`/admin/quizzes/${id}`}
              className="flex items-center gap-2 text-body-sm text-fg-2 hover:text-fg"
            >
              <ArrowLeft className="h-4 w-4" /> Back to editor
            </Link>
            <span className="h-5 w-px bg-line" />
            <Logo size="sm" />
            <span className="label hidden text-fg-3 md:inline">Projector preview</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="label hidden items-center gap-1.5 text-fg-3 lg:flex">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> navigate · <Kbd>Space</Kbd> answer
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous question"
              disabled={index === 0}
              onClick={() => (setIndex(index - 1), setReveal(false))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="numeric w-16 text-center text-body font-bold">
              {index + 1}/{total}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next question"
              disabled={index >= total - 1}
              onClick={() => (setIndex(index + 1), setReveal(false))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setReveal((r) => !r)}>
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{" "}
              {reveal ? "Hide answer" : "Show answer"}
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 px-[3vw] py-[3.5vh]">
          {question && q ? (
            <StageQuestion
              question={question}
              phase={reveal ? "ANSWER_REVEAL" : "QUESTION_ACTIVE"}
              timer={timer}
              answeredCount={0}
              playerCount={0}
              distribution={{}}
              correctOptionIds={q.options.filter((o) => o.isCorrect).map((o) => o.id)}
              showStats={false}
              showCorrect
              explanation={q.explanation || null}
              sound={false}
            />
          ) : (
            <p className="text-center text-fg-3">This quiz has no questions yet.</p>
          )}
        </main>
      </div>
    </ArenaThemeProvider>
  );
}
