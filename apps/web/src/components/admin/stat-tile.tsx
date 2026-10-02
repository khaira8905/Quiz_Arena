"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  hint,
  live,
  index = 0,
  format,
}: {
  label: string;
  value: number;
  hint?: React.ReactNode;
  live?: boolean;
  index?: number;
  format?: (n: number) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative border-t-2 bg-surface px-5 pb-5 pt-4",
        live ? "border-accent" : "border-line-strong",
      )}
    >
      <div className="label flex items-center gap-2 text-fg-3">
        {live && <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-accent" />}
        {label}
      </div>
      <AnimatedNumber
        value={value}
        from={0}
        format={format}
        className="numeric mt-3 block text-[2.75rem] font-extrabold leading-none"
      />
      {hint && <div className="mt-2 text-body-sm text-fg-3">{hint}</div>}
    </motion.div>
  );
}
