"use client";

import { motion } from "motion/react";
import { DUR, EASE } from "@/lib/motion";

/**
 * Calm page transition for the admin: a short rise that comes into focus. Quick enough to
 * never feel like waiting (reduced motion keeps only the fade).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      // A settled page keeps no filter: any filter would make this wrapper the containing
      // block for fixed-position children (toasts, menus, the cursor).
      animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      transition={{ duration: DUR.normal, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}
