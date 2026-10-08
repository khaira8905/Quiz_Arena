"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/** Any unexpected render error lands here instead of a blank screen. Progress is already saved. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-start justify-center px-5 py-16"
    >
      <p className="type-caption text-muted">Something went wrong</p>
      <h1 className="mt-3 type-h1 text-ink">That screen didn&apos;t load.</h1>
      <p className="mt-3 type-lead text-ink-2">
        Your progress is saved on this device and nothing was lost. Try again; if it keeps
        happening, go back to your session.
      </p>
      {error.digest && <p className="mt-2 type-small type-data text-muted">Ref {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-inverse hover:opacity-90"
        >
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <Link
          href="/session"
          className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink hover:border-line-strong"
        >
          Back to your session
        </Link>
      </div>
    </div>
  );
}
