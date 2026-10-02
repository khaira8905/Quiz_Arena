"use client";

import type { SessionSummaryDto } from "@quizarena/shared/dto";
import { Crown, Download, Flame } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatTile } from "@/components/admin/stat-tile";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatPercent, formatSeconds } from "@/lib/format";
import { useResults } from "@/lib/queries";

const PODIUM = [
  "bg-accent text-accent-ink",
  "bg-fg text-inverse",
  "bg-[color-mix(in_oklab,var(--answer-1)_75%,var(--surface-elevated))] text-answer-ink",
];

export function ResultsView({ session }: { session: SessionSummaryDto }) {
  const { data, isPending, isError, refetch } = useResults(session.id, true);

  return (
    <>
      <PageHeader
        eyebrow={`Arena ${session.code} · ${session.endedAt ? formatDateTime(session.endedAt) : ""}`}
        title={session.quizTitle}
        description="Final results"
        actions={
          <>
            {session.quizId && (
              <Link
                href={`/admin/quizzes/${session.quizId}`}
                className={buttonClasses({ variant: "ghost" })}
              >
                Open quiz
              </Link>
            )}
            <a
              href={`/api/sessions/${session.id}/results.csv`}
              download
              className={buttonClasses({ variant: "secondary" })}
            >
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </>
        }
      />

      {isError ? (
        <EmptyState
          className="mt-8"
          title="Couldn't load results"
          description="The server didn't respond."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-96" />
        </div>
      ) : data.results.standings.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Nobody played"
          description="This game finished without any players."
        />
      ) : (
        <>
          <section aria-label="Podium" className="mt-8 grid gap-4 md:grid-cols-3">
            {data.results.standings.slice(0, 3).map((s, i) => (
              <motion.div
                key={s.participantId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  "notch flex items-center gap-4 p-5",
                  i === 0 ? "md:order-2" : i === 1 ? "md:order-1" : "md:order-3",
                  i === 0 ? "border border-accent bg-accent-soft" : "border border-line bg-surface",
                )}
              >
                <span
                  className={cn(
                    "numeric grid h-14 w-14 shrink-0 place-items-center text-2xl font-extrabold notch-sm",
                    PODIUM[i],
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-display text-h3 font-bold">
                    {i === 0 && <Crown className="h-4 w-4 text-accent" aria-label="Winner" />}
                    {s.nickname}
                  </p>
                  <p className="numeric text-h2 font-extrabold">{formatNumber(s.score)}</p>
                </div>
              </motion.div>
            ))}
          </section>

          <section
            aria-label="Game statistics"
            className="mt-6 grid grid-cols-2 gap-px bg-line lg:grid-cols-4"
          >
            <StatTile label="Players" value={data.results.participantCount} index={0} />
            <StatTile
              label="Questions played"
              value={data.results.playedQuestions}
              hint={`of ${data.results.totalQuestions}`}
              index={1}
            />
            <StatTile
              label="Avg accuracy"
              value={Math.round(data.results.averageAccuracy * 100)}
              format={(n) => `${n}%`}
              index={2}
            />
            <StatTile
              label="Avg answer time"
              value={Math.round(data.results.averageResponseMs ?? 0)}
              format={(ms) => `${(ms / 1000).toFixed(1)}s`}
              index={3}
            />
          </section>

          <section
            aria-label="Full leaderboard"
            className="mt-8 overflow-x-auto border border-line"
          >
            <table className="w-full min-w-[640px] text-left text-body-sm">
              <thead className="border-b border-line bg-surface">
                <tr className="label text-fg-3">
                  <th className="px-4 py-3 font-semibold">Rank</th>
                  <th className="px-4 py-3 font-semibold">Player</th>
                  <th className="px-4 py-3 text-right font-semibold">Score</th>
                  <th className="px-4 py-3 text-right font-semibold">Correct</th>
                  <th className="px-4 py-3 text-right font-semibold">Accuracy</th>
                  <th className="px-4 py-3 text-right font-semibold">Avg time</th>
                  <th className="px-4 py-3 text-right font-semibold">Best streak</th>
                </tr>
              </thead>
              <tbody>
                {data.results.standings.map((s) => (
                  <tr
                    key={s.participantId}
                    className="border-b border-line last:border-0 hover:bg-surface"
                  >
                    <td className="numeric px-4 py-3 font-extrabold">{s.rank}</td>
                    <td className="px-4 py-3 font-medium">{s.nickname}</td>
                    <td className="numeric px-4 py-3 text-right font-bold">
                      {formatNumber(s.score)}
                    </td>
                    <td className="numeric px-4 py-3 text-right">
                      {s.correctCount}/{data.results.playedQuestions}
                    </td>
                    <td className="numeric px-4 py-3 text-right">{formatPercent(s.accuracy)}</td>
                    <td className="numeric px-4 py-3 text-right">
                      {formatSeconds(s.avgResponseMs)}
                    </td>
                    <td className="numeric px-4 py-3 text-right">
                      {s.bestStreak >= 2 ? (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <Flame className="h-3.5 w-3.5" /> {s.bestStreak}
                        </span>
                      ) : (
                        s.bestStreak
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
