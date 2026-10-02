"use client";

import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary:
    "bg-elevated text-fg border border-line-strong hover:border-fg-3 hover:bg-[color-mix(in_oklab,var(--surface-elevated)_80%,white_4%)]",
  outline: "border border-line-strong text-fg hover:border-fg-2",
  ghost: "text-fg-2 hover:text-fg hover:bg-elevated",
  danger: "bg-danger text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-body-sm gap-1.5",
  md: "h-10 px-4 text-button gap-2",
  lg: "h-12 px-6 text-[0.9375rem] font-semibold gap-2.5",
  xl: "h-16 px-8 text-lg font-bold gap-3",
  icon: "h-9 w-9 justify-center",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  notch?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, notch, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-semibold",
        "transition-[background-color,border-color,color,transform,filter] duration-150 ease-[var(--ease-out)]",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        notch && "notch-sm rounded-none",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="absolute h-4 w-4 animate-spin" aria-hidden />}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>
        {children}
      </span>
    </button>
  );
});
