import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-[linear-gradient(90deg,var(--surface-elevated),color-mix(in_oklab,var(--surface-elevated)_70%,var(--line-strong)),var(--surface-elevated))]",
        className,
      )}
    />
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "border-line-strong text-fg-2",
  accent: "border-accent/40 bg-accent-soft text-accent",
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-warning",
  danger: "border-danger/40 bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "label inline-flex h-6 items-center gap-1.5 rounded-sm border px-2",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-current",
            tone === "accent" && "animate-live-pulse",
          )}
        />
      )}
      {children}
    </span>
  );
}

export function Kbd({
  children,
  className,
  onAccent,
}: {
  children: React.ReactNode;
  className?: string;
  /** Sits on an accent-filled button: ink colours instead of surface colours. */
  onAccent?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-mono text-[10px] font-semibold",
        onAccent
          ? "border-accent-ink/40 bg-transparent text-accent-ink"
          : "border-line-strong bg-sunken text-fg-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden border border-dashed border-line-strong px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-5 grid h-14 w-14 place-items-center border border-line-strong bg-elevated text-accent notch-sm">
          {icon}
        </div>
      )}
      <h3 className="font-display text-h2">{title}</h3>
      <p className="mt-2 max-w-sm text-body text-fg-2">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Full-screen state for players/hosts: errors, waiting, ended. */
export function StatusScreen({
  eyebrow,
  title,
  description,
  tone = "neutral",
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  tone?: "neutral" | "danger" | "accent";
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="arena-floor flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <span
        className={cn(
          "label",
          tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-fg-3",
        )}
      >
        {eyebrow}
      </span>
      <h1 className="mt-4 max-w-xl font-display text-h1">{title}</h1>
      {description && <p className="mt-3 max-w-md text-body-lg text-fg-2">{description}</p>}
      {children}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent",
        className,
      )}
    />
  );
}
