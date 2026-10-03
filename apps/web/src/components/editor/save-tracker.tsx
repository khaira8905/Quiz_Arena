"use client";

import { Check, CloudOff, Loader2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/api";

type Status = { pending: number; savedAt: number | null; error: string | null };

const Ctx = createContext<{ track: <T>(p: Promise<T>) => Promise<T>; status: Status } | null>(null);

/** Collects every autosave in the editor into one honest status line. */
export function SaveTracker({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>({ pending: 0, savedAt: null, error: null });
  const track = useCallback(<T,>(p: Promise<T>) => {
    setStatus((s) => ({ ...s, pending: s.pending + 1 }));
    return p.then(
      (v) => {
        setStatus((s) => ({ pending: s.pending - 1, savedAt: Date.now(), error: null }));
        return v;
      },
      (err: unknown) => {
        const message = isApiError(err) ? err.message : "Changes couldn't be saved.";
        setStatus((s) => ({ ...s, pending: s.pending - 1, error: message }));
        toast.error("Not saved", { description: message });
        throw err;
      },
    );
  }, []);
  const value = useMemo(() => ({ track, status }), [track, status]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSaveTracker() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSaveTracker must be used inside <SaveTracker>");
  return ctx;
}

export function SaveStatus() {
  const { status } = useSaveTracker();

  if (status.pending > 0)
    return (
      <span className="label inline-flex items-center gap-1.5 text-fg-2" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving
      </span>
    );
  if (status.error)
    return (
      <span className="label inline-flex items-center gap-1.5 text-danger" aria-live="polite">
        <CloudOff className="h-3 w-3" /> Not saved
      </span>
    );
  if (status.savedAt)
    return (
      <span className="label inline-flex items-center gap-1.5 text-success" aria-live="polite">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  return <span className="label text-fg-3">Autosave on</span>;
}

/**
 * Debounced autosave for a local draft. `schedule(patch)` merges patches and saves after
 * `delay`; pending work is flushed on unmount so switching questions never drops edits.
 */
export function useAutosave<P extends object>(save: (patch: P) => Promise<unknown>, delay = 600) {
  const { track } = useSaveTracker();
  const pending = useRef<P | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = null;
    if (patch) void track(saveRef.current(patch)).catch(() => {});
  }, [track]);

  const schedule = useCallback(
    (patch: P, immediate = false) => {
      pending.current = { ...(pending.current ?? ({} as P)), ...patch };
      if (timer.current) clearTimeout(timer.current);
      if (immediate) flush();
      else timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => flush, [flush]);
  return { schedule, flush };
}
