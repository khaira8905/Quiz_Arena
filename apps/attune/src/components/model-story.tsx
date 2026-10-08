"use client";

import { ArrowRight, CalendarClock, Sparkles, Sun } from "lucide-react";
import { Fragment } from "react";
import { motion } from "motion/react";
import { modelStory, type SessionState } from "@attune/engine";
import { Badge, cn } from "./ui";

/**
 * How the learner model is changing, as three beats: what yesterday showed, what today is
 * showing, and the pattern emerging across both. Every line comes from recorded evidence.
 */
export function ModelStoryStrip({
  session,
  className,
}: {
  session: SessionState;
  className?: string;
}) {
  const story = modelStory(session);
  const steps = [
    {
      key: "yesterday",
      icon: CalendarClock,
      label: "Yesterday",
      headline: story.yesterday?.headline ?? "Your first day.",
      detail: story.yesterday?.detail ?? "Tomorrow, this compares against today.",
      muted: !story.yesterday,
    },
    {
      key: "today",
      icon: Sun,
      label: "Today",
      headline: story.today.headline,
      detail: story.today.detail,
      muted: false,
    },
    {
      key: "pattern",
      icon: Sparkles,
      label: "Emerging pattern",
      headline: story.pattern.headline,
      detail: story.pattern.detail,
      muted: story.pattern.strength === "none",
    },
  ];

  return (
    <section
      aria-label="How your learner model is changing"
      className={cn("grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]", className)}
    >
      {steps.map((step, i) => (
        <Fragment key={step.key}>
          {i > 0 && (
            <ArrowRight className="hidden size-4 self-center text-muted md:block" aria-hidden />
          )}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              "rounded-2xl border p-4",
              step.key === "pattern" && !step.muted
                ? "border-accent/40 bg-accent-soft"
                : "border-line bg-surface",
            )}
          >
            <p className="flex items-center gap-1.5 type-caption text-muted">
              <step.icon className="size-3.5" aria-hidden /> {step.label}
              {step.key === "pattern" && story.pattern.strength !== "none" && (
                <Badge
                  tone={story.pattern.strength === "clear" ? "accent" : "neutral"}
                  className="ml-auto normal-case tracking-normal"
                >
                  {story.pattern.strength}
                </Badge>
              )}
            </p>
            <p className={cn("mt-2 type-h3", step.muted ? "text-ink-2" : "text-ink")}>
              {step.headline}
            </p>
            <p className="mt-1 type-small text-muted">{step.detail}</p>
          </motion.div>
        </Fragment>
      ))}
    </section>
  );
}
