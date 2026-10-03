import { cn } from "@/lib/cn";

/* Server-safe: no "use client", so server components (e.g. not-found) can style links. */

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type Size = "sm" | "md" | "lg" | "xl" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary:
    "bg-elevated text-fg border border-line-strong hover:border-fg-3 hover:bg-[color-mix(in_oklab,var(--surface-elevated)_80%,white_4%)]",
  outline: "border border-line-strong text-fg hover:border-fg-2",
  ghost: "text-fg-2 hover:text-fg hover:bg-elevated",
  danger: "bg-danger text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  // Touch screens get 44px targets; mouse users keep the denser sizes.
  sm: "h-8 pointer-coarse:h-11 px-3 text-body-sm gap-1.5",
  md: "h-10 pointer-coarse:h-11 px-4 text-button gap-2",
  lg: "h-12 px-6 text-[0.9375rem] font-semibold gap-2.5",
  xl: "h-16 px-8 text-lg font-bold gap-3",
  icon: "h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 justify-center",
};

/**
 * Button styling as a class string, for elements that must look like a button but are
 * links (`<Link className={buttonClasses()}>`). Never nest a <Button> inside a link.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  notch,
  className,
}: { variant?: Variant; size?: Size; notch?: boolean; className?: string } = {}) {
  return cn(
    "relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-semibold",
    "transition-[background-color,border-color,color,transform,filter] duration-150 ease-[var(--ease-out)]",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
    variants[variant],
    sizes[size],
    notch && "notch-sm rounded-none",
    className,
  );
}
