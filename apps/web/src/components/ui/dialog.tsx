"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { EASE } from "@/lib/motion";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  /** "lg" for dialogs with tables or previews. */
  size?: "md" | "lg";
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </RD.Overlay>
            <RD.Content asChild forceMount>
              <motion.div
                className={cn(
                  "fixed left-1/2 top-1/2 z-50 max-h-[92dvh] overflow-y-auto rounded-lg border border-line-strong bg-elevated p-6 text-fg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] focus:outline-none",
                  size === "lg" ? "w-[min(94vw,820px)]" : "w-[min(92vw,460px)]",
                  className,
                )}
                initial={{ opacity: 0, x: "-50%", y: "-46%", scale: 0.97 }}
                animate={{ opacity: 1, x: "-50%", y: "-50%", scale: 1 }}
                exit={{ opacity: 0, x: "-50%", y: "-48%", scale: 0.98 }}
                transition={{ duration: 0.18, ease: EASE.out }}
              >
                <RD.Title className="pr-8 font-display text-h2">{title}</RD.Title>
                {description ? (
                  <RD.Description className="mt-2 text-body text-fg-2">
                    {description}
                  </RD.Description>
                ) : (
                  <RD.Description className="sr-only">{title}</RD.Description>
                )}
                <div className="mt-5">{children}</div>
                <RD.Close
                  className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-md text-fg-3 hover:bg-sunken hover:text-fg"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </RD.Close>
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}

/** Confirmation for destructive or irreversible actions (delete, end game, skip). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={description}
    >
      <div className="flex justify-end gap-2">
        {/* Destructive dialogs focus Cancel: a stray Space or Enter (the projector's "next"
            keys) must never end or skip a game. */}
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          autoFocus={tone === "danger"}
        >
          Cancel
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          loading={busy}
          autoFocus={tone !== "danger"}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
