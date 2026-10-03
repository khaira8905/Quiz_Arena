import type { SessionSummaryDto } from "@quizarena/shared/dto";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";

const statusTone = {
  LOBBY: "accent",
  LIVE: "accent",
  FINISHED: "neutral",
  ABANDONED: "warning",
} as const;
const statusLabel = {
  LOBBY: "Lobby open",
  LIVE: "Live",
  FINISHED: "Finished",
  ABANDONED: "Abandoned",
} as const;

export function SessionRow({ session }: { session: SessionSummaryDto }) {
  const live = session.status === "LOBBY" || session.status === "LIVE";
  return (
    <li>
      <Link
        href={`/admin/sessions/${session.id}`}
        className="group grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line px-1 py-3.5 transition-colors hover:bg-surface sm:grid-cols-[7.5rem_1fr_auto_auto] sm:gap-4"
      >
        <span className="numeric hidden text-body-lg font-bold tracking-[0.04em] sm:inline">
          {session.code}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body font-medium group-hover:text-accent">
            {session.quizTitle}
          </p>
          <p className="text-caption text-fg-3">
            <span className="numeric sm:hidden">{session.code} · </span>
            {formatDateTime(session.createdAt)} · {session.participantCount} players ·{" "}
            {session.questionCount} questions
          </p>
        </div>
        <Badge tone={statusTone[session.status]} dot={live}>
          {statusLabel[session.status]}
        </Badge>
        <ChevronRight className="h-4 w-4 text-fg-3 group-hover:text-fg" aria-hidden />
      </Link>
    </li>
  );
}
