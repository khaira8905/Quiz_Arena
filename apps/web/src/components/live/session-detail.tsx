"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/queries";
import { LiveControl } from "./live-control";
import { ResultsView } from "./results-view";

/** Routes a session to the right view: live control, results, or an explanation. */
export function SessionDetail({ id }: { id: string }) {
  const { data, isPending, isError, error, refetch } = useSession(id);
  const qc = useQueryClient();
  // A finished game changes the session, the lists and the dashboard's live count.
  const onFinished = useCallback(() => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  }, [qc, refetch]);

  if (isPending) {
    return (
      <div>
        <Skeleton className="h-12 w-80" />
        <Skeleton className="mt-8 h-96 w-full" />
      </div>
    );
  }
  if (isError) {
    const notFound = isApiError(error) && error.status === 404;
    return (
      <EmptyState
        title={notFound ? "Session not found" : "Couldn't load this session"}
        description={
          notFound
            ? "It doesn't exist or belongs to another organiser."
            : "The server didn't respond."
        }
        action={
          notFound ? (
            <Link href="/admin/sessions" className={buttonClasses()}>
              All sessions
            </Link>
          ) : (
            <Button onClick={() => refetch()}>Retry</Button>
          )
        }
      />
    );
  }

  const { session, live } = data;
  if (live && (session.status === "LOBBY" || session.status === "LIVE")) {
    return <LiveControl session={session} onFinished={onFinished} />;
  }
  if (session.status === "FINISHED") return <ResultsView session={session} />;

  return (
    <>
      <PageHeader
        eyebrow={`Game ${session.code}`}
        title={session.quizTitle}
        description={`Opened ${formatDateTime(session.createdAt)}`}
      />
      <EmptyState
        className="mt-8"
        title={
          session.status === "ABANDONED"
            ? "This arena was closed"
            : "This arena is no longer running"
        }
        description={
          session.status === "ABANDONED"
            ? "It was closed before the game finished, so there are no final results."
            : "The game server restarted while this game was open. Start a new session from the quiz."
        }
        action={
          session.quizId ? (
            <Link
              href={`/admin/quizzes/${session.quizId}`}
              className={buttonClasses({ variant: "secondary" })}
            >
              Open quiz
            </Link>
          ) : undefined
        }
      />
    </>
  );
}
