"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-body font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={`${id}-d`} className="mt-0.5 text-body-sm text-fg-3">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-200",
          checked ? "border-accent bg-accent" : "border-line-strong bg-sunken",
          disabled && "opacity-50",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 700, damping: 40 }}
          className={cn("h-4.5 w-4.5 rounded-full", checked ? "ml-auto bg-accent-ink" : "bg-fg-3")}
        />
      </button>
    </div>
  );
}

/** Compact segmented control for small enumerations (timer presets, points, scope). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const group = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-wrap gap-1 rounded-md border border-line bg-sunken p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative min-w-10 flex-1 rounded-sm px-2.5 py-1.5 text-body-sm font-semibold transition-colors",
              active ? "text-accent-ink" : "text-fg-2 hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-sm bg-accent"
                transition={{ type: "spring", stiffness: 600, damping: 42 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
