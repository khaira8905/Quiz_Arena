import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-start justify-center px-5 py-16">
      <p className="type-caption text-muted">404 · Not found</p>
      <h1 className="mt-3 type-h1 text-ink">This page wandered off.</h1>
      <p className="mt-3 type-lead text-ink-2">
        The link may be old, or the address mistyped. Nothing you were doing has been lost.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/session"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-inverse hover:opacity-90"
        >
          <Compass className="size-4" aria-hidden /> Back to your session
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink hover:border-line-strong"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
