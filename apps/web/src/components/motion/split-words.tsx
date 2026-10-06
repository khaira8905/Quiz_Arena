"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";

/**
 * Text that arrives word by word: each word rises out of its own mask and comes into
 * focus, on a short stagger. With `animate` false it's plain text. The words stay real
 * text (selectable, read by screen readers as one sentence).
 */
export function SplitWords({
  text,
  animate,
  delay = 0,
  step = 0.045,
  maxStagger = 0.6,
}: {
  text: string;
  animate: boolean;
  delay?: number;
  /** Seconds between words. */
  step?: number;
  /** The whole stagger never takes longer than this, however long the text. */
  maxStagger?: number;
}) {
  if (!animate) return <>{text}</>;
  const words = text.split(/(\s+)/);
  const count = words.filter((w) => w.trim()).length;
  const each = count > 1 ? Math.min(step, maxStagger / (count - 1)) : 0;
  let n = 0;
  return (
    <>
      {words.map((w, i) => {
        if (!w.trim()) return w;
        const d = delay + n++ * each;
        return (
          <span
            key={i}
            // The mask: padding keeps descenders visible, the negative margin gives the
            // space back so line height doesn't change.
            className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-top"
          >
            <motion.span
              className="inline-block"
              initial={{ y: "102%", filter: "blur(6px)" }}
              animate={{ y: "0%", filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: d, ease: EASE.emphasis }}
            >
              {w}
            </motion.span>
          </span>
        );
      })}
    </>
  );
}
