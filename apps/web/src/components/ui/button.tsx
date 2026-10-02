"use client";

import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { buttonClasses, type Size, type Variant } from "./button-classes";

export { buttonClasses } from "./button-classes";

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
      className={buttonClasses({ variant, size, notch, className })}
      {...props}
    >
      {loading && <Loader2 className="absolute h-4 w-4 animate-spin" aria-hidden />}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>
        {children}
      </span>
    </button>
  );
});
