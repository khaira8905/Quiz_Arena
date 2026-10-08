"use client";

import { forwardRef } from "react";
import { STATE_META, type EngagementState, type StateFamily } from "@attune/engine";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const familyColor = (family: StateFamily) => `var(--fam-${family})`;
export const stateColor = (state: EngagementState) => familyColor(STATE_META[state].family);

/* ------------------------------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "quiet";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-inverse hover:opacity-90",
  accent: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  quiet: "text-muted hover:text-ink underline-offset-4 hover:underline",
};
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});

export function Chip({
  selected,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        selected
          ? "border-ink bg-ink text-inverse"
          : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

type Tone = "neutral" | "accent" | "good" | "warn" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A colour dot is always paired with a text label: colour is never the only signal. */
export function StateDot({ state, size = 8 }: { state: EngagementState; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: stateColor(state),
        boxShadow: "0 0 0 2px var(--surface)",
      }}
    />
  );
}

export function StateBadge({ state, p }: { state: EngagementState; p?: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] text-ink">
      <StateDot state={state} />
      <span className="font-medium">{STATE_META[state].label}</span>
      {p !== undefined && <span className="tabular text-muted">{Math.round(p * 100)}%</span>}
    </span>
  );
}

/** Honest-data label: anything simulated says so, right where it's shown. */
export function SimulatedTag({ children = "Simulated" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-line-strong px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("font-mono text-[11px] uppercase tracking-[0.14em] text-muted", className)}>
      {children}
    </p>
  );
}

export function Meter({
  value,
  label,
  color = "var(--accent)",
}: {
  value: number;
  label: string;
  color?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full rounded-full bg-surface-3"
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface-2 px-1 font-mono text-[11px] text-ink-2">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/* ------------------------------------------------------------------------------------------ */
/* Forms and feedback                                                                         */
/* ------------------------------------------------------------------------------------------ */

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".2"
          strokeWidth="3"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

type NoticeTone = "info" | "good" | "warn" | "danger";
const NOTICE: Record<NoticeTone, string> = {
  info: "border-line bg-surface-2 text-ink-2",
  good: "border-transparent bg-good-soft text-good",
  warn: "border-transparent bg-warn-soft text-warn",
  danger: "border-transparent bg-danger-soft text-danger",
};

/** Inline status. Errors are announced immediately; everything else politely. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3.5 py-3 text-[13.5px] leading-relaxed",
        NOTICE[tone],
        className,
      )}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(Boolean(title) && "mt-0.5", "text-ink-2")}>{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function TextInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted transition-colors focus:outline-none focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-0",
        invalid ? "border-danger" : "border-line hover:border-line-strong",
        className,
      )}
      {...rest}
    />
  );
});

/** A labelled control with optional hint and error, wired up for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    invalid: boolean;
  }) => React.ReactNode;
}) {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-medium text-ink">
        {label}
      </label>
      {children({ id, "aria-describedby": described || undefined, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12.5px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-surface p-5 shadow-soft sm:p-6", className)}
    >
      {children}
    </div>
  );
}
