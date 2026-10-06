"use client";

import { otherTheme } from "@quizarena/shared/appearance";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { uiThemeStore } from "@/lib/ui-theme";

const RAYS = Array.from({ length: 8 }, (_, i) => i * 45);
// Stars sit in the moon's bite, upper right.
const STARS = [
  { x: 18.6, y: 6.4, r: 0.95, d: 0.12 },
  { x: 21.4, y: 10.6, r: 0.6, d: 0.2 },
  { x: 15.2, y: 3.1, r: 0.55, d: 0.27 },
];
const SPRING = { type: "spring", stiffness: 260, damping: 20 } as const;

/**
 * The single gateway between the two worlds: Black + Orange (night) and White + Blue (day).
 * The icon shows where a click takes you: a sun at night, a moon by day. Clicking presses it,
 * turns the sun into a moon (or back) while a few sparks fly, and the new theme spreads out
 * from the button across the whole page.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(
    uiThemeStore.subscribe,
    uiThemeStore.get,
    uiThemeStore.getServer,
  );
  const reduced = useReducedMotion();
  const button = useRef<HTMLButtonElement>(null);
  const [burst, setBurst] = useState(0);
  const maskId = `qa-moon-${useId().replace(/:/g, "")}`;
  const night = theme === "BLACK";
  // What the icon shows: the destination.
  const sun = night;

  const toggle = () => {
    const r = button.current?.getBoundingClientRect();
    setBurst((b) => b + 1);
    uiThemeStore.set(
      otherTheme(theme),
      r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined,
    );
  };

  return (
    <motion.button
      ref={button}
      type="button"
      onClick={toggle}
      whileTap={reduced ? undefined : { scale: 0.86 }}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      transition={{ type: "spring", stiffness: 500, damping: 26 }}
      aria-label={
        night ? "Switch to day theme (white and blue)" : "Switch to night theme (black and orange)"
      }
      title={night ? "Day: white + blue" : "Night: black + orange"}
      className={cn(
        "magnetic relative grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-elevated text-fg",
        "shadow-[var(--shadow-sm)] transition-[border-color,background-color] duration-[var(--motion-fast)] hover:border-accent",
        "pointer-coarse:h-11 pointer-coarse:w-11",
        className,
      )}
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="h-[22px] w-[22px] overflow-visible"
        aria-hidden
        initial={false}
        // A full turn on every switch; it lands upright either way.
        animate={{ rotate: sun ? 0 : 360 }}
        transition={reduced ? { duration: 0 } : SPRING}
      >
        <defs>
          <mask id={maskId}>
            <rect x="-4" y="-4" width="32" height="32" fill="white" />
            {/* The bite slides over the disc to make the crescent. */}
            <motion.circle
              r="7"
              fill="black"
              initial={false}
              animate={sun ? { cx: 30, cy: -6 } : { cx: 18.2, cy: 7.6 }}
              transition={reduced ? { duration: 0 } : SPRING}
            />
          </mask>
        </defs>
        <motion.circle
          cx="12"
          cy="12"
          fill="currentColor"
          mask={`url(#${maskId})`}
          initial={false}
          animate={{ r: sun ? 4.6 : 8.2 }}
          transition={reduced ? { duration: 0 } : SPRING}
          style={{ color: sun ? "var(--accent)" : "currentColor" }}
        />
        {/* Rays: extend for the sun, draw in for the moon. */}
        <motion.g
          initial={false}
          animate={{ scale: sun ? 1 : 0.4, opacity: sun ? 1 : 0, rotate: sun ? 0 : 60 }}
          transition={reduced ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ originX: "12px", originY: "12px", color: "var(--accent)" }}
        >
          {RAYS.map((deg) => (
            <line
              key={deg}
              x1="12"
              y1="2.2"
              x2="12"
              y2="4.4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${deg} 12 12)`}
            />
          ))}
        </motion.g>
        {/* Stars twinkle in beside the moon. */}
        {STARS.map((st) => (
          <motion.circle
            key={st.x}
            cx={st.x}
            cy={st.y}
            r={st.r}
            fill="var(--accent)"
            initial={false}
            animate={{ opacity: sun ? 0 : 1, scale: sun ? 0 : 1 }}
            transition={reduced ? { duration: 0 } : { delay: sun ? 0 : st.d + 0.1, duration: 0.3 }}
            style={{ originX: `${st.x}px`, originY: `${st.y}px` }}
          />
        ))}
      </motion.svg>

      {/* A small burst of light as the switch is thrown. */}
      {!reduced && (
        <AnimatePresence>
          <span key={burst} aria-hidden className="pointer-events-none absolute inset-0">
            {burst > 0 &&
              Array.from({ length: 7 }, (_, i) => {
                const a = (i / 7) * Math.PI * 2 + burst;
                return (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-accent"
                    initial={{ x: "-50%", y: "-50%", opacity: 0.9, scale: 1 }}
                    animate={{
                      x: `calc(-50% + ${Math.cos(a) * 22}px)`,
                      y: `calc(-50% + ${Math.sin(a) * 22}px)`,
                      opacity: 0,
                      scale: 0.3,
                    }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                );
              })}
          </span>
        </AnimatePresence>
      )}
    </motion.button>
  );
}
