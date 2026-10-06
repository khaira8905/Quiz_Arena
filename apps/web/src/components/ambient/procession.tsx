"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Competitor, seedOf } from "./competitor";

const CAP = 30;
/** Floor slots in the order they fill, so the first arrivals gather in the middle and the
 *  crowd spreads outward evenly instead of piling up at one end. */
const SLOTS = (() => {
  const order: number[] = [];
  for (let i = 0; i < CAP; i++) {
    const offset = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    order.push(0.5 + offset / (CAP + 2));
  }
  return order;
})();
const SPEED = 0.11; // share of the floor walked per second
const DEPTHS = [
  { scale: 1, lift: 0, opacity: 1, z: 3 },
  { scale: 0.8, lift: 14, opacity: 0.78, z: 2 },
  { scale: 0.64, lift: 26, opacity: 0.58, z: 1 },
];

type Walker = { id: string; connected: boolean };

/**
 * The lobby's floor: one small competitor walks in for each player who joins (up to 30),
 * entering from the nearer edge, then turns to face the room. A player who leaves walks
 * back out. Purely decorative (aria-hidden); the roster carries the names.
 */
export function Procession({ players, className }: { players: Walker[]; className?: string }) {
  const visible = players.slice(0, CAP);
  return (
    <div aria-hidden className={className}>
      <div className="relative h-full">
        {/* The arena floor in perspective, drifting toward the room. */}
        <div className="arena-floor-plane" />
        <AnimatePresence>
          {visible.map((p, i) => (
            <Figure key={p.id} id={p.id} slot={SLOTS[i]!} order={i} dim={!p.connected} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Figure({
  id,
  slot,
  order,
  dim,
}: {
  id: string;
  slot: number;
  order: number;
  dim: boolean;
}) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const seed = seedOf(id);
  const fromLeft = slot < 0.5;
  const start = fromLeft ? -0.06 : 1.06;
  // Which slot they've reached. Walking = not there yet (a new arrival, or someone ahead of
  // them left and they shuffle along), or leaving.
  const [reached, setReached] = useState<number | null>(reduced ? slot : null);
  const [from, setFrom] = useState(start);
  const [prevSlot, setPrevSlot] = useState(slot);
  if (slot !== prevSlot) {
    setPrevSlot(slot);
    setFrom(prevSlot);
  }
  const walking = !reduced && (!present || reached !== slot);
  // Three depths, so the crowd has a back row: farther figures are smaller, higher and fainter.
  const depth = DEPTHS[order % DEPTHS.length]!;
  const heading = !present ? (fromLeft ? "left" : "right") : slot >= from ? "right" : "left";
  const duration = Math.max(0.6, Math.abs(slot - from) / SPEED);
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return (
    // Full-width track so translateX percentages are shares of the floor.
    <motion.div
      className="pointer-events-none absolute inset-x-0"
      style={{ bottom: `${depth.lift}%`, height: `${depth.scale * 100}%`, zIndex: depth.z }}
      initial={reduced ? false : { x: pct(start) }}
      animate={{ x: pct(slot), opacity: (dim ? 0.35 : 1) * depth.opacity }}
      exit={
        reduced
          ? { opacity: 0 }
          : {
              x: pct(start),
              transition: { duration: Math.abs(slot - start) / SPEED / 1.4, ease: "linear" },
            }
      }
      transition={{
        x: {
          duration,
          ease: "linear",
          delay: reached === null ? Math.min(order, 8) * 0.18 : 0,
        },
        opacity: { duration: 0.4 },
      }}
      onAnimationComplete={() => setReached(slot)}
    >
      <Competitor
        seed={seed}
        walking={walking}
        // Walking: face where they're going. Standing: face the room (as drawn).
        facing={walking ? heading : "right"}
        className={
          !walking && !reduced
            ? "competitor-arrive absolute bottom-0 left-0 h-full w-auto -translate-x-1/2"
            : "absolute bottom-0 left-0 h-full w-auto -translate-x-1/2"
        }
      />
    </motion.div>
  );
}
