"use client";

import { Radio } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { SessionRow } from "@/components/admin/session-row";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useSessions } from "@/lib/queries";

/** LIVE SESSIONS (open arenas you can control) or RESULTS (every finished game). */
export function SessionsList({ scope }: { scope: "active" | "past" }) {
  const { data, isPending, isError, refetch } = useSessions(scope);

  return (
    <>
      <PageHeader
        eyebrow="Games"
        title={scope === "active" ? "Live sessions" : "Results"}
        description={
          scope === "active"
            ? "Arenas that are open right now. Open the control room to run one."
            : "Every game you've run, with final standings and per-question breakdowns."
        }
      />
      <div className="mt-6">
        {isError ? (
          <EmptyState
            title="Couldn't load sessions"
            description="The server didn't respond."
            action={<Button onClick={() => refetch()}>Retry</Button>}
          />
        ) : isPending ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-6 w-6" />}
            title={scope === "active" ? "No live arenas" : "No games played yet"}
            description={
              scope === "active"
                ? "Go live from any quiz to open a lobby players can join."
                : "Finished games and their results will appear here."
            }
            action={
              <Link href="/admin/quizzes" className={buttonClasses({ variant: "secondary" })}>
                Pick a quiz
              </Link>
            }
          />
        ) : (
          <ul className="border-t border-line">
            {data.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
