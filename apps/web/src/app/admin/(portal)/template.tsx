"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";

/** Calm page transition for the admin: a short fade and 6px rise. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}
