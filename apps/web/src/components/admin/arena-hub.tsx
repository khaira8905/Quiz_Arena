"use client";

import { DEFAULT_APPEARANCE } from "@quizarena/shared/appearance";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { ArenaCustomizer, ArenaEditor } from "@/components/editor/arena-customizer";
import { SaveStatus, SaveTracker } from "@/components/editor/save-tracker";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { usePreferences, useQuiz, useQuizzes, useUpdatePreferences } from "@/lib/queries";

const DEFAULT = "__default";

/**
 * CUSTOMIZE ARENA: the look of the projector and phones. Edit the default every new quiz
 * starts from, or any quiz's own arena — with the real screens previewed live.
 */
export function ArenaHub() {
  const [target, setTarget] = useState(DEFAULT);
  const quizzes = useQuizzes();
  return (
    <>
      <PageHeader
        eyebrow="Look & feel"
        title="Customize arena"
        description="Theme, colours, type, motion and branding for the projector and phones."
        actions={
          <Select
            aria-label="Arena to edit"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-72"
          >
            <option value={DEFAULT}>Default for new quizzes</option>
            {quizzes.data?.map((q) => (
              <option key={q.id} value={q.id}>
                Quiz: {q.title}
              </option>
            ))}
          </Select>
        }
      />
      <div className="mt-6">
        {target === DEFAULT ? <DefaultArena /> : <QuizArena key={target} id={target} />}
      </div>
    </>
  );
}

function DefaultArena() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  if (prefs.isPending) return <Skeleton className="h-[32rem]" />;
  const d = prefs.data?.quizDefaults ?? {};
  return (
    <SaveTracker>
      <p className="mb-4 flex flex-wrap items-center gap-3 text-body-sm text-fg-3">
        New quizzes start with this arena. Existing quizzes keep their own. <SaveStatus />
      </p>
      <ArenaEditor
        source={{
          appearance: prefs.data?.appearance ?? DEFAULT_APPEARANCE,
          soundEnabled: d.soundEnabled ?? true,
          title: "Your next quiz",
          questionCount: 10,
          settings: {
            scoringMode: d.scoringMode ?? "SPEED",
            streakBonus: d.streakBonus ?? true,
            showLeaderboard: d.showLeaderboard ?? true,
            showCorrectAnswers: d.showCorrectAnswers ?? true,
            showAnswerStats: d.showAnswerStats ?? true,
            allowLateJoin: d.allowLateJoin ?? false,
            participantLimit: d.participantLimit ?? 200,
            nicknameFilter: d.nicknameFilter ?? true,
            readingMode: d.readingMode ?? "TIMED",
            readingTimeSec: d.readingTimeSec ?? 5,
            leaderboardEvery: d.leaderboardEvery ?? 1,
            autoRevealSec: d.autoRevealSec ?? 0,
          },
          sample: null,
          save: ({ appearance, soundEnabled }) =>
            update.mutateAsync({
              ...(appearance ? { appearance } : {}),
              ...(soundEnabled !== undefined ? { quizDefaults: { soundEnabled } } : {}),
            }),
        }}
      />
    </SaveTracker>
  );
}

function QuizArena({ id }: { id: string }) {
  const quiz = useQuiz(id);
  if (quiz.isPending) return <Skeleton className="h-[32rem]" />;
  if (!quiz.data) return <p className="text-fg-3">That quiz couldn&apos;t be loaded.</p>;
  return (
    <SaveTracker>
      <p className="mb-4 flex flex-wrap items-center gap-3 text-body-sm text-fg-3">
        <SaveStatus />
        Changes save to “{quiz.data.title}”.
        <Link href={`/admin/quizzes/${id}`} className="underline underline-offset-2">
          Open the quiz
        </Link>
      </p>
      <ArenaCustomizer quiz={quiz.data} />
    </SaveTracker>
  );
}
