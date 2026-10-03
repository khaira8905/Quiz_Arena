import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="arena-floor flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="numeric mt-10 text-display text-accent">404</p>
      <h1 className="mt-4 font-display text-h1">This page isn&apos;t in the arena</h1>
      <p className="mt-3 max-w-md text-body-lg text-fg-2">
        The link may be mistyped or out of date. Joining a game? Use the PIN on the big screen.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/play" className={buttonClasses({ size: "lg" })}>
          Join a game
        </Link>
        <Link href="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          Home
        </Link>
      </div>
    </main>
  );
}
