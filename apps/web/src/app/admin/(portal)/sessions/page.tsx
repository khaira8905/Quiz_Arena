"use client";

import { Radio } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { SessionRow } from "@/components/admin/session-row";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/switch";
import { useSessions } from "@/lib/queries";

export default function SessionsPage() {
  const [scope, setScope] = useState<"active" | "past">("active");
  const { data, isPending, isError, refetch } = useSessions(scope);

  return (
    <>
      <PageHeader eyebrow="Games" title="Sessions" description="Open arenas you can control, and the results of every game you've run." />
      <Segmented
        label="Session scope"
        value={scope}
        onChange={setScope}
        className="mt-6 sm:w-72"
        options={[
          { value: "active", label: "Active" },
          { value: "past", label: "Previous" },
        ]}
      />
      <div className="mt-6">
        {isError ? (
          <EmptyState title="Couldn't load sessions" description="The server didn't respond." action={<Button onClick={() => refetch()}>Retry</Button>} />
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
            description={scope === "active" ? "Go live from any quiz to open a lobby players can join." : "Finished games and their results will appear here."}
            action={
              <Link href="/admin/quizzes">
                <Button variant="secondary">Pick a quiz</Button>
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
