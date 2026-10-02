"use client";

import type { QuizSummaryDto } from "@quizarena/shared/dto";
import { Copy, Pencil, Play, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/misc";
import { isApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useDeleteQuiz, useDuplicateQuiz } from "@/lib/queries";
import { useGoLive } from "./use-go-live";

export function QuizCard({ quiz, index = 0 }: { quiz: QuizSummaryDto; index?: number }) {
  const [confirm, setConfirm] = useState(false);
  const del = useDeleteQuiz();
  const dup = useDuplicateQuiz();
  const { goLive, pendingId } = useGoLive();

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col border border-line bg-surface transition-colors hover:border-line-strong"
    >
      <Link
        href={`/admin/quizzes/${quiz.id}`}
        className="flex flex-1 flex-col p-5 focus-visible:outline-offset-[-2px]"
      >
        <div className="flex items-center justify-between gap-3">
          <Badge tone={quiz.status === "PUBLISHED" ? "success" : "neutral"}>
            {quiz.status === "PUBLISHED" ? "Published" : "Draft"}
          </Badge>
          <span className="text-caption text-fg-3">Edited {timeAgo(quiz.updatedAt)}</span>
        </div>
        <h2 className="mt-4 line-clamp-2 font-display text-h3 font-bold leading-snug group-hover:text-accent">
          {quiz.title}
        </h2>
        {quiz.description && (
          <p className="mt-1.5 line-clamp-2 text-body-sm text-fg-3">{quiz.description}</p>
        )}
        <dl className="mt-auto flex gap-6 pt-5">
          <div>
            <dt className="label text-fg-3">Questions</dt>
            <dd className="numeric mt-1.5 text-h2 font-bold">
              {String(quiz.questionCount).padStart(2, "0")}
            </dd>
          </div>
          <div>
            <dt className="label text-fg-3">Plays</dt>
            <dd className="numeric mt-1.5 text-h2 font-bold">
              {String(quiz.playCount).padStart(2, "0")}
            </dd>
          </div>
        </dl>
      </Link>
      <div className="flex items-center border-t border-line">
        <button
          onClick={() => goLive(quiz.id)}
          disabled={pendingId === quiz.id}
          className="flex h-11 flex-1 items-center justify-center gap-2 text-body-sm font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden /> Go live
        </button>
        <span className="h-5 w-px bg-line" />
        <Link
          href={`/admin/quizzes/${quiz.id}`}
          aria-label={`Edit ${quiz.title}`}
          className="grid h-11 w-12 place-items-center text-fg-3 hover:text-fg"
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <button
          aria-label={`Duplicate ${quiz.title}`}
          onClick={() =>
            dup.mutate(quiz.id, {
              onSuccess: (q) => toast.success("Quiz duplicated", { description: q.title }),
              onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't duplicate."),
            })
          }
          className="grid h-11 w-12 place-items-center text-fg-3 hover:text-fg"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          aria-label={`Delete ${quiz.title}`}
          onClick={() => setConfirm(true)}
          className="grid h-11 w-12 place-items-center text-fg-3 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this quiz?"
        description={`"${quiz.title}" and its questions will be deleted. Results from past games are kept.`}
        confirmLabel="Delete quiz"
        onConfirm={() =>
          del.mutateAsync(quiz.id).then(
            () => toast.success("Quiz deleted"),
            (e) => toast.error(isApiError(e) ? e.message : "Couldn't delete."),
          )
        }
      />
    </motion.article>
  );
}
