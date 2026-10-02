"use client";

import type { PlayerSummary } from "@quizarena/shared/game";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/cn";
import { displayHost, joinUrl } from "@/lib/format";

/** JOIN QUIZARENA panel for the projector: URL, giant code, QR. */
export function JoinPanel({ code }: { code: string }) {
  const url = joinUrl(code);
  return (
    <div className="flex h-full flex-col justify-center gap-[3vh]">
      <div>
        <p className="label text-[clamp(0.75rem,1.1vw,2rem)] text-fg-2">Join at</p>
        <p className="mt-[1vh] font-display text-[clamp(1.25rem,2.1vw,4.5rem)] font-bold tracking-[-0.02em]">
          {displayHost(url.replace(/\/play.*/, "/play"))}
        </p>
      </div>
      <div>
        <p className="label text-[clamp(0.75rem,1.1vw,2rem)] text-fg-2">Game code</p>
        <p
          className="numeric mt-[1vh] text-stage-code text-accent"
          aria-label={`Game code ${code.split("").join(" ")}`}
        >
          {code}
        </p>
      </div>
      <div className="flex items-center gap-[1.5vw]">
        <div className="notch bg-fg p-[1vw]">
          <QRCodeSVG
            value={url}
            size={512}
            level="M"
            bgColor="#f2f4f8"
            fgColor="#07080c"
            className="h-auto w-[clamp(8rem,13vw,26rem)]"
          />
        </div>
        <p className="max-w-[16vw] text-[clamp(0.9rem,1.2vw,2.4rem)] leading-snug text-fg-2">
          Scan to join instantly. No app, no account.
        </p>
      </div>
    </div>
  );
}

const MAX_VISIBLE = 140;

/**
 * Lobby roster. Only chips that arrive after the first render animate in (AnimatePresence
 * initial={false}), and the grid is
 * capped (with a "+N more" tile) so a 500-player lobby stays cheap.
 */
export function Roster({
  players,
  size = "stage",
}: {
  players: PlayerSummary[];
  size?: "stage" | "panel";
}) {
  const reduced = useReducedMotion();
  const visible = players.slice(-MAX_VISIBLE);
  const hidden = players.length - visible.length;
  const stage = size === "stage";

  return (
    <ul
      className={cn("flex flex-wrap content-start", stage ? "gap-[0.7vw]" : "gap-1.5")}
      aria-label="Players in the lobby"
    >
      <AnimatePresence initial={false}>
        {visible.map((p) => (
          <motion.li
            key={p.id}
            layout={reduced ? false : "position"}
            initial={reduced ? false : { opacity: 0, scale: 0.6, y: 12 }}
            animate={{ opacity: p.connected ? 1 : 0.4, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              "flex items-center gap-2 border border-line-strong bg-elevated font-display font-bold tracking-[-0.01em]",
              stage
                ? "px-[1vw] py-[0.8vh] text-[clamp(0.95rem,1.35vw,2.75rem)]"
                : "px-2.5 py-1 text-body-sm",
            )}
            title={p.connected ? undefined : "Reconnecting"}
          >
            <span
              className={cn(
                "h-[0.45em] w-[0.45em] rounded-full",
                p.connected ? "bg-success" : "bg-fg-3",
              )}
              aria-hidden
            />
            {p.nickname}
          </motion.li>
        ))}
      </AnimatePresence>
      {hidden > 0 && (
        <li
          className={cn(
            "border border-dashed border-line-strong font-display font-bold text-fg-2",
            stage
              ? "px-[1vw] py-[0.8vh] text-[clamp(0.95rem,1.35vw,2.75rem)]"
              : "px-2.5 py-1 text-body-sm",
          )}
        >
          +{hidden} more
        </li>
      )}
    </ul>
  );
}

export function PlayerCounter({ count, label = "Players" }: { count: number; label?: string }) {
  return (
    <div className="flex items-baseline gap-[0.8vw]">
      <AnimatedNumber
        value={count}
        duration={0.5}
        className="numeric text-[clamp(2.5rem,5vw,10rem)] font-extrabold leading-none"
      />
      <span className="label text-[clamp(0.75rem,1.1vw,2rem)] text-fg-2">{label}</span>
    </div>
  );
}
