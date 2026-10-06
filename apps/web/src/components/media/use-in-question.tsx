"use client";

import type { MediaAssetDto } from "@quizarena/shared/media";
import type { QuizDto } from "@quizarena/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { api, isApiError } from "@/lib/api";
import { EASE } from "@/lib/motion";
import { invalidateMedia, useQuizzes } from "@/lib/queries";

/**
 * USE IN QUESTION, from the media library: pick a quiz, pick one of its questions, attach.
 * An image or a video replaces whatever media the question had (a question shows one).
 */
export function UseInQuestion({ asset, onDone }: { asset: MediaAssetDto; onDone: () => void }) {
  const qc = useQueryClient();
  const quizzes = useQuizzes();
  const [quizId, setQuizId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [saving, setSaving] = useState(false);
  const quiz = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => api<{ quiz: QuizDto }>(`/quizzes/${quizId}`).then((r) => r.quiz),
    enabled: !!quizId,
  });
  const question = quiz.data?.questions.find((q) => q.id === questionId);
  const video = asset.kind === "VIDEO";
  const replaces = question && (question.imageUrl || question.videoAssetId);

  const attach = async () => {
    if (!question) return;
    setSaving(true);
    try {
      await api(`/questions/${question.id}`, {
        method: "PATCH",
        json: video ? { videoAssetId: asset.id } : { imageAssetId: asset.id },
      });
      void qc.invalidateQueries({ queryKey: ["quiz", quizId] });
      void invalidateMedia(qc);
      toast.success(
        `Added to question ${question.order + 1} of “${quiz.data?.title ?? "the quiz"}”`,
      );
      onDone();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't attach it");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.26, ease: EASE.out }}
      className="overflow-hidden"
    >
      <div className="mt-4 grid gap-3 rounded-md border border-line bg-sunken p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="label text-fg-2">Quiz</span>
          <Select
            value={quizId}
            onChange={(e) => {
              setQuizId(e.target.value);
              setQuestionId("");
            }}
            disabled={quizzes.isPending}
          >
            <option value="">{quizzes.isPending ? "Loading…" : "Choose a quiz"}</option>
            {quizzes.data?.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label text-fg-2">Question</span>
          <Select
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
            disabled={!quiz.data}
          >
            <option value="">{quizId && quiz.isPending ? "Loading…" : "Choose a question"}</option>
            {quiz.data?.questions.map((q) => (
              <option key={q.id} value={q.id}>
                {String(q.order + 1).padStart(2, "0")} · {(q.text || "Untitled").slice(0, 60)}
                {q.videoAssetId ? " (has a video)" : q.imageUrl ? " (has an image)" : ""}
              </option>
            ))}
          </Select>
        </label>
        <Button onClick={() => void attach()} disabled={!question} loading={saving}>
          <Check className="h-4 w-4" /> Use here
        </Button>
        {replaces && (
          <p className="text-body-sm text-warning sm:col-span-3">
            This replaces the question&apos;s current {question.videoAssetId ? "video" : "image"}.
          </p>
        )}
      </div>
    </motion.div>
  );
}
