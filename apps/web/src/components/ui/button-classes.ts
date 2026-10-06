import { cn } from "@/lib/cn";

/* Server-safe: no "use client", so server components (e.g. not-found) can style links. */

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type Size = "sm" | "md" | "lg" | "xl" | "icon";

/* Hover styles are guarded with not-disabled so a disabled button never looks pressable. */
const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.2)] not-disabled:hover:bg-accent-strong not-disabled:hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_8px_24px_-10px_var(--accent)]",
  secondary:
    "bg-elevated text-fg border border-line-strong not-disabled:hover:border-fg-3 not-disabled:hover:bg-[color-mix(in_oklab,var(--surface-elevated)_92%,var(--text-primary))]",
  outline: "border border-line-strong text-fg not-disabled:hover:border-fg-2",
  ghost: "text-fg-2 not-disabled:hover:text-fg not-disabled:hover:bg-elevated",
  danger: "bg-danger text-white not-disabled:hover:brightness-110",
};

const sizes: Record<Size, string> = {
  // Touch screens get 44px targets; mouse users keep the denser sizes.
  sm: "h-8 pointer-coarse:h-11 px-3 text-body-sm gap-1.5",
  md: "h-10 pointer-coarse:h-11 px-4 text-button gap-2",
  // The big buttons are magnetic: the desktop cursor pulls them a few pixels toward it.
  lg: "magnetic h-12 px-6 text-[0.9375rem] font-semibold gap-2.5",
  xl: "magnetic h-16 px-8 text-lg font-bold gap-3",
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
    "transition-[background-color,border-color,color,box-shadow,transform,filter] duration-[var(--motion-fast)] ease-[var(--ease-out)]",
    // Press: a quick dip that springs back on release.
    "not-disabled:active:scale-[0.96] not-disabled:active:duration-[var(--motion-instant)]",
    // Trailing arrow icons lean toward where the button goes.
    "[&_svg.lucide-arrow-right]:transition-transform [&_svg.lucide-arrow-right]:duration-[var(--motion-normal)] not-disabled:hover:[&_svg.lucide-arrow-right]:translate-x-0.5",
    "disabled:cursor-not-allowed disabled:opacity-45",
    variants[variant],
    sizes[size],
    notch && "notch-sm rounded-none",
    className,
  );
}
