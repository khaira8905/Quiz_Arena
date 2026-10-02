"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";

/** Last-resort boundary: an unexpected crash shows a recoverable screen, never a blank page. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="arena-floor flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="label text-danger">Something broke</p>
      <h1 className="mt-4 font-display text-h1">This screen hit an unexpected error</h1>
      <p className="mt-3 max-w-md text-body-lg text-fg-2">
        Your game is safe on the server. Try again — players and hosts can rejoin with the same
        code.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          Home
        </Link>
      </div>
    </main>
  );
}
