"use client";

import type { SessionSummaryDto } from "@quizarena/shared/dto";
import { Copy, ExternalLink, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Badge } from "@/components/ui/misc";
import { joinUrl } from "@/lib/format";

/**
 * A running session in the admin: the game itself is run from the control room
 * (/host/[code]) with the stage in its own projector window (/host/[code]/projector).
 */
export function LiveSessionCard({
  session,
  live,
}: {
  session: SessionSummaryDto;
  live: { phase: string; players: number };
}) {
  const projector = `/host/${session.code}/projector`;
  return (
    <>
      <PageHeader eyebrow={`Game ${session.code}`} title={session.quizTitle} />
      <section className="mt-8 border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="accent" dot>
            {session.status === "LOBBY" ? "Lobby open" : "Live"}
          </Badge>
          <span className="text-body-sm text-fg-3">
            {live.players} {live.players === 1 ? "player" : "players"}
          </span>
        </div>
        <div className="mt-5 flex items-baseline gap-3">
          <span className="label text-fg-3">Game PIN</span>
          <span className="numeric text-[2.25rem] font-extrabold leading-none text-accent">
            {session.code}
          </span>
        </div>
        <p className="mt-4 max-w-prose text-body text-fg-2">
          Run the game from the control room on your laptop. Open the projector screen in a second
          window and drag it to the projector — it shows only what the audience should see.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/host/${session.code}`}
            className={buttonClasses({ size: "lg", notch: true })}
          >
            <MonitorPlay className="h-4 w-4" /> Open control room
          </Link>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.open(projector, `qa-projector-${session.code}`)}
          >
            <ExternalLink className="h-4 w-4" /> Open projector
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() =>
              void navigator.clipboard
                .writeText(joinUrl(session.code))
                .then(() => toast.success("Join link copied"))
            }
          >
            <Copy className="h-4 w-4" /> Copy join link
          </Button>
        </div>
      </section>
    </>
  );
}
