"use client";

import type { PlayerSummary } from "@quizarena/shared/game";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/cn";
import { displayHost, joinUrl } from "@/lib/format";

/** JOIN QUIZARENA panel for the projector: URL, giant code, QR. */
export function JoinPanel({
  code,
  coverImageUrl,
}: {
  code: string;
  coverImageUrl?: string | null;
}) {
  const url = joinUrl(code);
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-[3vh]">
      {coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- organiser-supplied cover URL
        <img
          src={coverImageUrl}
          alt=""
          className="notch max-h-[18vh] w-full max-w-[34vw] shrink object-cover"
        />
      )}
      <div>
        <p className="label text-[clamp(0.75rem,1.1vw,2rem)] text-fg-2">Join at</p>
        <p className="mt-[1vh] font-display text-[clamp(1.25rem,2.1vw,4.5rem)] font-bold tracking-[-0.02em]">
          {displayHost(url.replace(/\/play.*/, "/play"))}
        </p>
      </div>
      <div>
        <p className="label text-[clamp(0.75rem,1.1vw,2rem)] text-fg-2">Game PIN</p>
        {/* Players may type the digits alone, so the digits are the hero, grouped in threes
            for reading aloud; the prefix stays visible but quiet. */}
        <p
          className="numeric mt-[1vh] flex items-baseline gap-[0.8vw] whitespace-nowrap leading-none"
          aria-label={`Game PIN ${code.split("").join(" ")}`}
        >
          <span className="text-[clamp(1.5rem,3vw,6rem)] font-extrabold text-fg-3">
            {code.slice(0, 2)}
          </span>
          <span className="text-stage-code text-accent">
            {code.slice(2, 5)}
            <span className="inline-block w-[0.18em]" />
            {code.slice(5)}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-[1.5vw]">
        {/* Always dark-on-white with a quiet zone, whatever the arena theme: scanners need it. */}
        <div className="bg-white p-[0.6vw]">
          <QRCodeSVG
            value={url}
            title={`QR code: scan to join game ${code}`}
            role="img"
            aria-label={`QR code to join game ${code}`}
            size={512}
            level="M"
            marginSize={4}
            bgColor="#ffffff"
            fgColor="#000000"
            className="h-auto w-[clamp(8rem,13vw,26rem)]"
          />
        </div>
        <p className="max-w-[16vw] text-[clamp(0.9rem,1.2vw,2.4rem)] leading-snug text-fg-2">
          Scan to join, or enter the PIN at the address above. No app needed.
        </p>
      </div>
    </div>
  );
}

const MAX_VISIBLE = 140;

/**
 * Lobby roster. Order is stable (join order) and capped, with "+N more" after the cap, so
 * a 500-player lobby never reshuffles: a new chip appears, nothing else moves. Only chips
 * that arrive after the first render animate in, and nothing uses layout animation, which
 * would re-measure every chip on every join.
 */
export function Roster({
  players,
  size = "stage",
}: {
  players: PlayerSummary[];
  size?: "stage" | "panel";
}) {
  const reduced = useReducedMotion();
  const visible = players.slice(0, MAX_VISIBLE);
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

export function PlayerCounter({ count }: { count: number }) {
  const label = count === 1 ? "Player" : "Players";
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
