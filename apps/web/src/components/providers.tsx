"use client";

import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";

/** App-wide providers. Motion honours the OS "reduce motion" setting everywhere. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "flex w-[min(92vw,380px)] items-start gap-3 rounded-md border border-line-strong bg-elevated px-4 py-3 text-body-sm text-fg shadow-[0_12px_40px_-12px_rgb(0_0_0/0.6)]",
            title: "font-semibold",
            description: "text-fg-2",
            error: "border-l-2 border-l-danger",
            success: "border-l-2 border-l-success",
            warning: "border-l-2 border-l-warning",
          },
        }}
      />
    </MotionConfig>
  );
}
