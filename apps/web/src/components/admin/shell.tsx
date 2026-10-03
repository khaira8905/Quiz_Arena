"use client";

import {
  BarChart3,
  ImageIcon,
  LayoutGrid,
  Layers,
  Library,
  LogOut,
  Menu,
  Palette,
  Radio,
  Settings,
  X,
} from "lucide-react";
import * as RD from "@radix-ui/react-dialog";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useDashboard, useLogout, useMe } from "@/lib/queries";

const WIDE_ROUTES = /^\/admin\/((quizzes|sessions)\/[^/]+|arena)/;

const nav = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/admin/quizzes", label: "Quizzes", icon: Layers },
  { href: "/admin/bank", label: "Question bank", icon: Library },
  { href: "/admin/media", label: "Media library", icon: ImageIcon },
  { href: "/admin/sessions", label: "Live sessions", icon: Radio },
  { href: "/admin/results", label: "Results", icon: BarChart3 },
  { href: "/admin/arena", label: "Customize arena", icon: Palette },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  // The drawer remembers which page it was opened on, so navigating closes it without an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawer = drawerPath === pathname;
  const setDrawer = (open: boolean) => setDrawerPath(open ? pathname : null);

  const unauthorized = me.isError && isApiError(me.error) && me.error.status === 401;
  // Keep trying in the background once the wake-up budget is spent (the copy promises it).
  const down = me.isError && !unauthorized;
  useEffect(() => {
    if (!down) return;
    const t = setInterval(() => void me.refetch(), 15_000);
    return () => clearInterval(t);
  }, [down, me]);
  useEffect(() => {
    if (unauthorized) router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, pathname, router]);

  // First request failed because the free server is asleep: say so instead of a blank skeleton.
  if (me.isPending && me.failureCount > 0) return <WakingScreen />;

  if (me.isPending || unauthorized) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-60 border-r border-line bg-surface p-5 lg:block">
          <Skeleton className="h-7 w-36" />
          <div className="mt-10 space-y-3">
            {nav.map((n) => (
              <Skeleton key={n.href} className="h-9 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="mt-8 h-40 w-full" />
        </div>
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="label text-danger">Server unavailable</p>
          <h1 className="mt-3 font-display text-h1">Can&apos;t reach the control room</h1>
          <p className="mt-2 max-w-md text-fg-2">
            The game server didn&apos;t wake up. It retries every 15 seconds; if this persists,
            check the server&apos;s status in your hosting dashboard.
          </p>
          <button
            className="label mt-6 text-accent underline-offset-4 hover:underline"
            onClick={() => me.refetch()}
          >
            Retry now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
      >
        Skip to content
      </a>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Logo size="sm" />
        <button
          aria-label="Open navigation"
          aria-expanded={drawer}
          onClick={() => setDrawer(true)}
          className="-mr-2 grid h-11 w-11 place-items-center rounded-md text-fg-2 hover:text-fg"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <aside className="sticky top-0 hidden h-dvh lg:block">
        <Sidebar userName={me.data.name} email={me.data.email} />
      </aside>

      {/* A real modal: focus is trapped inside, Escape closes, the page behind is inert. */}
      <RD.Root open={drawer} onOpenChange={setDrawer}>
        <AnimatePresence>
          {drawer && (
            <RD.Portal forceMount>
              <RD.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-40 bg-black/60 lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              </RD.Overlay>
              <RD.Content asChild forceMount aria-describedby={undefined}>
                <motion.aside
                  className="fixed inset-y-0 left-0 z-50 w-72 focus:outline-none lg:hidden"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", stiffness: 420, damping: 40 }}
                >
                  <RD.Title className="sr-only">Navigation</RD.Title>
                  <RD.Close
                    aria-label="Close navigation"
                    className="absolute right-2 top-3 z-10 grid h-11 w-11 place-items-center rounded-md text-fg-2 hover:text-fg"
                  >
                    <X className="h-5 w-5" />
                  </RD.Close>
                  {/* Its own layout group, so the active-item highlight doesn't fly in from
                      the (hidden) desktop sidebar. */}
                  <LayoutGroup id="drawer">
                    <Sidebar userName={me.data.name} email={me.data.email} />
                  </LayoutGroup>
                </motion.aside>
              </RD.Content>
            </RD.Portal>
          )}
        </AnimatePresence>
      </RD.Root>

      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
        {/* Workspaces (editor, live control) use the full width; content pages stay readable. */}
        <div className={cn("mx-auto", WIDE_ROUTES.test(pathname) ? "max-w-[1600px]" : "max-w-6xl")}>
          {children}
        </div>
      </main>
    </div>
  );
}

function Sidebar({ userName, email }: { userName: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const dashboard = useDashboard();
  const live = dashboard.data?.totals.liveSessions ?? 0;

  return (
    <nav aria-label="Admin" className="flex h-full flex-col border-r border-line bg-surface">
      <div className="px-5 pb-8 pt-6">
        <Link href="/admin" aria-label="Dashboard">
          <Logo size="sm" />
        </Link>
        <p className="label mt-3 text-fg-3">Control room</p>
      </div>
      <ul className="flex flex-col gap-1 px-3">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors",
                  active ? "text-fg" : "text-fg-2 hover:bg-elevated hover:text-fg",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-md border border-line-strong bg-elevated"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent" />}
                <Icon className="relative h-4 w-4" aria-hidden />
                <span className="relative">{item.label}</span>
                {item.href === "/admin/sessions" && live > 0 && (
                  <span className="label relative ml-auto inline-flex items-center gap-1.5 text-accent">
                    <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-accent" />
                    {live}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-line p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="label text-fg-3">Theme</span>
          <ThemeSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-elevated font-display text-body font-bold text-accent notch-sm">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold">{userName}</p>
            <p className="truncate text-caption text-fg-3">{email}</p>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            className="grid h-9 w-9 place-items-center rounded-md text-fg-3 transition-colors hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11"
            onClick={() =>
              logout.mutate(undefined, { onSettled: () => router.replace("/admin/login") })
            }
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}

/** Shown while a sleeping free-tier server boots (usually 20-60 seconds). */
export function WakingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center" role="status">
      <div className="flex flex-col items-center">
        <Spinner className="h-8 w-8" />
        <p className="label mt-6 text-accent">Waking up the server</p>
        <h1 className="mt-3 font-display text-h1">One moment</h1>
        <p className="mt-2 max-w-sm text-fg-2">
          The game server sleeps when nobody is using it. It takes up to a minute to start.
        </p>
      </div>
    </div>
  );
}
