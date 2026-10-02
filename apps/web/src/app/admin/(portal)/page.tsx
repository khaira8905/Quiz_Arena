"use client";

import { Layers, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateQuizDialog } from "@/components/admin/create-quiz-dialog";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { QuizCard } from "@/components/admin/quiz-card";
import { SessionRow } from "@/components/admin/session-row";
import { StatTile } from "@/components/admin/stat-tile";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useDashboard, useMe } from "@/lib/queries";

export default function DashboardPage() {
  const me = useMe();
  const { data, isPending, isError, refetch } = useDashboard();
  const [creating, setCreating] = useState(false);
  const firstName = me.data?.name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="Your quizzes, your sessions, and who's been playing."
        actions={
          <Button onClick={() => setCreating(true)} notch>
            <Plus className="h-4 w-4" aria-hidden /> Quick create quiz
          </Button>
        }
      />

      {isError ? (
        <div className="mt-8 border border-danger/40 bg-danger-soft p-5 text-body">
          Couldn&apos;t load the dashboard.{" "}
          <button className="font-semibold underline" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <section
          aria-label="Totals"
          className="mt-8 grid grid-cols-2 gap-px bg-line lg:grid-cols-4"
        >
          {isPending ? (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bg-surface p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-10 w-20" />
              </div>
            ))
          ) : (
            <>
              <StatTile
                index={0}
                label="Quizzes"
                value={data.totals.quizzes}
                hint={`${data.totals.published} published · ${data.totals.drafts} drafts`}
              />
              <StatTile
                index={1}
                label="Sessions"
                value={data.totals.sessions}
                hint="Games hosted all time"
              />
              <StatTile
                index={2}
                label="Participants"
                value={data.totals.participants}
                hint="Players across all games"
              />
              <StatTile
                index={3}
                label="Live now"
                value={data.totals.liveSessions}
                live={data.totals.liveSessions > 0}
                hint="Open lobbies and games"
              />
            </>
          )}
        </section>
      )}

      <div className="mt-12 grid grid-cols-1 gap-12 xl:grid-cols-[1.6fr_1fr]">
        <section>
          <SectionTitle
            aside={
              <Link href="/admin/quizzes" className="label text-fg-3 hover:text-accent">
                All quizzes →
              </Link>
            }
          >
            Recent quizzes
          </SectionTitle>
          {isPending ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-56" />
              ))}
            </div>
          ) : data && data.recentQuizzes.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-6 w-6" />}
              title="No quizzes yet"
              description="Build your first quiz. It takes a couple of minutes and you can go live straight from the editor."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> Create your first quiz
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data?.recentQuizzes.slice(0, 4).map((q, i) => (
                <QuizCard key={q.id} quiz={q} index={i} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle
            aside={
              <Link href="/admin/sessions" className="label text-fg-3 hover:text-accent">
                All sessions →
              </Link>
            }
          >
            Recent sessions
          </SectionTitle>
          {isPending ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : data && data.recentSessions.length === 0 ? (
            <p className="border border-dashed border-line-strong p-6 text-body-sm text-fg-3">
              No games yet. Hit <span className="font-semibold text-accent">Go live</span> on any
              quiz to open an arena.
            </p>
          ) : (
            <ul className="border-t border-line">
              {data?.recentSessions.map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <CreateQuizDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
