"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line-strong bg-sunken px-3.5 text-body text-fg placeholder:text-fg-3 " +
  "transition-[border-color,box-shadow] duration-150 hover:border-fg-3 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft " +
  "disabled:opacity-50 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-24 resize-y py-3", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, "h-11 appearance-none bg-[length:12px] pr-9", className)} {...props}>
      {children}
    </select>
  );
});

/** Label + control + hint/error, wired together with ids for screen readers. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
  aside,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  aside?: React.ReactNode;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label text-fg-2">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-body-sm text-fg-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
