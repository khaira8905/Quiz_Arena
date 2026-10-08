"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChartNoAxesColumn,
  ChevronRight,
  CloudAlert,
  CloudCheck,
  FastForward,
  Feather,
  LoaderCircle,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Sun,
  Undo2,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast, Toaster } from "sonner";
import {
  CHALLENGES,
  CURIOSITY_PATHS,
  EXPLANATIONS,
  GUIDED,
  MICRO_WINS,
  MISSIONS,
  QUESTIONS,
  SCENARIOS,
  scenarioById,
  type ScenarioId,
} from "@attune/engine";
import { useAuth } from "@/lib/auth";
import { useConnectivity, type ModePreference } from "@/lib/connectivity";
import { useSettings, type ThemePref } from "@/lib/settings";
import { useAttune } from "@/lib/store";
import { SYNC_COPY, type SyncStatus } from "@/lib/sync";
import { Button, cn, Eyebrow, Notice, SimulatedTag, Spinner } from "./ui";

const NAV = [
  { href: "/session", label: "Session" },
  { href: "/twin", label: "Twin" },
  { href: "/progress", label: "Progress" },
  { href: "/community", label: "Community" },
  { href: "/educator", label: "Educator" },
  { href: "/story", label: "Story" },
];

export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path
        d="M16 40c4-11 9-16 16-16s12 5 16 16"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M23 40c2.5-6 5.5-9 9-9s6.5 3 9 9"
        fill="none"
        stroke="var(--accent-ink)"
        strokeOpacity=".6"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="32" cy="42" r="3.5" fill="var(--accent-ink)" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname === "/begin";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-inverse"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75 print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 rounded-md" aria-label="Attune home">
            <BrandMark />
            <span className="type-brand hidden min-[380px]:inline">Attune</span>
          </Link>
          {!immersive && (
            <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
              {NAV.map((item) => (
                <NavLink key={item.href} href={item.href} active={isActive(item.href)} group="desk">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <ConnectivityControl />
            <ThemeToggle />
            <AccountMenu />
            <DemoDirector />
          </div>
        </div>
        {!immersive && (
          <nav
            aria-label="Primary (compact)"
            className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 lg:hidden"
          >
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href} active={isActive(item.href)} group="mobile">
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <AccountBanner />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Toaster position="bottom-center" theme="system" closeButton />
    </div>
  );
}

function NavLink({
  href,
  active,
  group,
  children,
}: {
  href: string;
  active: boolean;
  group: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative isolate shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors",
        active ? "text-ink" : "text-muted hover:text-ink",
      )}
    >
      {active && (
        <motion.span
          layoutId={`nav-pill-${group}`}
          className="absolute inset-0 -z-10 rounded-lg bg-surface-2"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      {children}
    </Link>
  );
}

/** A small popover that closes on outside click and Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function Popover({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ transformOrigin: "top right" }}
          className={cn(
            "absolute right-0 top-11 z-40 rounded-2xl border border-line bg-surface p-4 shadow-soft",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Connectivity and sync: mode, network, outbox and sync state, all visible.                  */
/* ------------------------------------------------------------------------------------------ */

const MODE_COPY: Record<ModePreference, { label: string; detail: string }> = {
  auto: { label: "Automatic", detail: "Picks a mode from what this device reports." },
  full: { label: "Full", detail: "AI gateway, interactive visuals, motion." },
  light: {
    label: "Light",
    detail: "Text-first, same activities, no AI calls. For slow or metered data.",
  },
  offline: {
    label: "Offline",
    detail: "Runs entirely on this device. Progress queues and syncs later.",
  },
};

const ACTIVITY_COUNT =
  QUESTIONS.length +
  GUIDED.length +
  MICRO_WINS.length +
  CHALLENGES.length +
  EXPLANATIONS.length +
  CURIOSITY_PATHS.length +
  MISSIONS.length;

const STATUS_STYLE: Record<SyncStatus, { icon: typeof Wifi; tone: string; spin?: boolean }> = {
  online: { icon: Wifi, tone: "text-ink-2" },
  offline: { icon: WifiOff, tone: "text-warn" },
  reconnecting: { icon: RefreshCw, tone: "text-warn", spin: true },
  syncing: { icon: LoaderCircle, tone: "text-accent", spin: true },
  synced: { icon: CloudCheck, tone: "text-good" },
  failed: { icon: CloudAlert, tone: "text-danger" },
};

function useCountdown(until: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
}

function ConnectivityControl() {
  const { mode, preference, reason, network, aiConfigured } = useConnectivity();
  const { setModePreference } = useSettings();
  const {
    syncStatus,
    syncTarget,
    syncError,
    syncProgress,
    pending,
    synced,
    lastSyncAt,
    nextRetryAt,
    retrySync,
    hydrated,
  } = useAttune();
  const { open, setOpen, ref } = usePopover();
  const seconds = useCountdown(nextRetryAt);
  const style = STATUS_STYLE[syncStatus];
  const Icon = style.icon;
  const label =
    syncStatus === "syncing" && syncProgress
      ? `Syncing ${syncProgress.done}/${syncProgress.total}`
      : syncStatus === "offline" && pending > 0
        ? `Offline · ${pending} saved`
        : SYNC_COPY[syncStatus].label;
  const destination =
    syncTarget === "cloud"
      ? "Your account"
      : syncTarget === "guest"
        ? "Demo server (forgets on restart)"
        : "Not syncing yet";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Connection: ${SYNC_COPY[syncStatus].label}. ${MODE_COPY[mode].label} mode.`}
        data-sync-status={syncStatus}
        className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong sm:px-3"
      >
        <Icon
          className={cn(
            "size-4",
            style.tone,
            style.spin && "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden
        />
        <span className={cn("hidden font-medium sm:inline", style.tone)}>
          {hydrated ? label : "…"}
        </span>
        {mode === "light" && (
          <span className="hidden items-center gap-1 border-l border-line pl-2 md:inline-flex">
            <Feather className="size-3.5" aria-hidden /> Light
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {hydrated ? SYNC_COPY[syncStatus].label : ""}
      </span>
      <Popover
        open={open}
        className="max-h-[calc(100dvh-80px)] w-[min(92vw,360px)] overflow-y-auto"
      >
        <div role="dialog" aria-label="Connection and sync">
          <Eyebrow>Connection</Eyebrow>
          <p className={cn("mt-1 type-body font-medium", style.tone)}>{label}</p>
          <p className="type-small text-muted">{SYNC_COPY[syncStatus].detail}</p>
          {syncStatus === "failed" && (
            <Notice tone="danger" className="mt-3" title="Sync failed">
              {syncError ?? "The server didn't accept the last batch."}
              <span className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={retrySync}>
                  <RotateCcw className="size-3.5" /> Retry now
                </Button>
                {seconds !== null && (
                  <span className="type-small text-muted">Auto-retry in {seconds}s</span>
                )}
              </span>
            </Notice>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[12.5px]">
            <dt className="text-muted">Network</dt>
            <dd className="text-ink">
              {!network.online
                ? "Offline"
                : network.probeFailed
                  ? "Server not answering"
                  : "Online"}
              {network.effectiveType ? ` · ${network.effectiveType}` : ""}
              {network.saveData ? " · data saver" : ""}
            </dd>
            <dt className="text-muted">Saves to</dt>
            <dd className="text-ink">{destination}</dd>
            <dt className="text-muted">Waiting to sync</dt>
            <dd className="tabular text-ink">{pending === 0 ? "Nothing" : `${pending} events`}</dd>
            <dt className="text-muted">Synced</dt>
            <dd className="tabular text-ink">
              {synced} events
              {lastSyncAt
                ? ` · ${new Date(lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : ""}
            </dd>
            <dt className="text-muted">On this device</dt>
            <dd className="text-ink">{ACTIVITY_COUNT} activities + the full engine</dd>
            <dt className="text-muted">AI gateway</dt>
            <dd className="text-ink">
              {mode !== "full"
                ? "Off in this mode"
                : aiConfigured
                  ? "Available"
                  : "Not configured (library text)"}
            </dd>
          </dl>
          <p className="mt-3 border-t border-line pt-3 type-small text-ink">
            Mode: <strong>{MODE_COPY[mode].label}</strong> ·{" "}
            <span className="text-muted">{reason}</span>
          </p>
          <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label="Mode">
            {(Object.keys(MODE_COPY) as ModePreference[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={preference === p}
                onClick={() => setModePreference(p)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  preference === p
                    ? "border-ink bg-surface-2"
                    : "border-line hover:border-line-strong",
                )}
              >
                <span className="text-sm font-medium text-ink">{MODE_COPY[p].label}</span>
                <span className="block text-[12.5px] text-muted">{MODE_COPY[p].detail}</span>
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Theme and account                                                                          */
/* ------------------------------------------------------------------------------------------ */

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON: Record<ThemePref, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

function ThemeToggle() {
  const { theme, setTheme } = useSettings();
  const Icon = THEME_ICON[theme];
  return (
    <button
      type="button"
      onClick={() => setTheme(THEME_NEXT[theme])}
      aria-label={`Theme: ${theme}. Switch to ${THEME_NEXT[theme]}.`}
      title={`Theme: ${theme}`}
      className="flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          <Icon className="size-4" aria-hidden />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function AccountMenu() {
  const { status, user, profile } = useAuth();
  const { signOut, pending, syncTarget, retrySync } = useAttune();
  const { open, setOpen, ref } = usePopover();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === "unconfigured") return null;
  if (status === "loading") {
    return <span className="size-9 animate-pulse rounded-xl bg-surface-2" aria-hidden />;
  }
  if (status === "signed-out") {
    return (
      <Link
        href="/login"
        className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors hover:border-line-strong sm:px-3"
      >
        <LogIn className="size-4" aria-hidden />
        <span className="hidden sm:inline">Log in</span>
        <span className="sr-only sm:hidden">Log in</span>
      </Link>
    );
  }

  const name = profile?.displayName ?? user?.email ?? "Account";
  const initial = name.trim().charAt(0).toUpperCase() || "A";
  const doSignOut = async () => {
    if (pending > 0 && syncTarget === "cloud" && !confirming) {
      setConfirming(true);
      retrySync();
      return;
    }
    setBusy(true);
    const { error } = await signOut();
    setBusy(false);
    setOpen(false);
    setConfirming(false);
    if (error) {
      toast.error(error);
      return;
    }
    // A full navigation: no page rendered for the signed-in user survives in the router cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth changed: drop every cached page
    window.location.assign("/");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex size-9 items-center justify-center rounded-xl bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
      >
        {initial}
      </button>
      <Popover open={open} className="w-[min(92vw,280px)] p-2">
        <div className="px-2 pb-2 pt-1">
          <p className="truncate type-body font-medium text-ink">{name}</p>
          <p className="truncate type-small text-muted">{user?.email}</p>
        </div>
        <nav className="grid border-t border-line pt-1" aria-label="Account">
          {[
            { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
            { href: "/account", label: "Account", icon: UserRound },
            { href: "/settings", label: "Settings", icon: Settings2 },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <item.icon className="size-4" aria-hidden /> {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-1 border-t border-line pt-1">
          {confirming && pending > 0 && (
            <p className="px-2 py-1.5 type-small text-warn" role="alert">
              {pending} changes haven&apos;t synced yet; trying now. If you log out anyway,
              they&apos;re lost.
            </p>
          )}
          <button
            type="button"
            onClick={doSignOut}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            {busy ? <Spinner /> : <LogOut className="size-4" aria-hidden />}
            {confirming && pending > 0 ? "Log out anyway" : "Log out"}
          </button>
        </div>
      </Popover>
    </div>
  );
}

/** Account states that need the learner's attention, right under the header. */
function AccountBanner() {
  const { status } = useAuth();
  const { restore, retryRestore, ownerId, pending, hydrated } = useAttune();
  if (!hydrated) return null;
  let content: React.ReactNode = null;
  if (restore === "restoring") {
    content = <Spinner label="Restoring your progress…" />;
  } else if (restore === "failed") {
    content = (
      <span className="flex flex-wrap items-center gap-2">
        Couldn&apos;t load your progress. It&apos;s safe in your account; retrying automatically.
        <Button size="sm" onClick={retryRestore}>
          <RotateCcw className="size-3.5" /> Try again
        </Button>
      </span>
    );
  } else if (status === "signed-out" && ownerId && pending > 0) {
    content = (
      <span className="flex flex-wrap items-center gap-2">
        You were logged out with {pending} changes saved on this device.
        <Link
          href="/login?reason=expired"
          className="font-medium text-accent underline underline-offset-4"
        >
          Log in to sync them
        </Link>
      </span>
    );
  }
  return (
    <AnimatePresence initial={false}>
      {content && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-line bg-surface-2 print:hidden"
        >
          <div
            className="mx-auto max-w-7xl px-4 py-2 text-[13.5px] text-ink-2 sm:px-6"
            role="status"
          >
            {content}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Demo director: scenarios, autoplay, fast-forward. Fictional learners, clearly labelled.     */
/* ------------------------------------------------------------------------------------------ */

function DemoDirector() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    scenarioId,
    session,
    stash,
    startScenario,
    leaveDemo,
    simulate,
    send,
    tomorrow,
    forgetEverything,
    ownerId,
    hydrated,
  } = useAttune();
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [narration, setNarration] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const scenario = scenarioId ? scenarioById(scenarioId) : undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!hydrated) return null;

  const launch = (id: ScenarioId, walkthrough: boolean) => {
    setReveal(false);
    setNarration([]);
    if (walkthrough) {
      router.push(`/begin?scenario=${id}`);
    } else {
      startScenario(id);
      router.push("/session");
    }
    setOpen(false);
  };

  const autoplay = async () => {
    const steps = simulate();
    if (steps.length === 0) return;
    setPlaying(true);
    if (pathname !== "/session") router.push("/session");
    const lines: string[] = [];
    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 650));
      send(step.input);
      if (step.narration) lines.push(step.narration);
      setNarration([...lines]);
    }
    setPlaying(false);
  };

  return (
    <div className="print:hidden">
      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="Demo director"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed right-3 top-[60px] z-40 max-h-[calc(100dvh-76px)] w-[min(94vw,380px)] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-soft sm:right-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Eyebrow>Demo mode</Eyebrow>
                <p className="mt-1 text-sm text-ink-2">
                  Four fictional learners, one topic, four reasons for disengaging. Demo sessions
                  are never saved to an account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close demo panel"
                className="rounded-lg p-1 text-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {scenario && session && (
              <div className="mt-3 rounded-xl bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">
                    {scenario.id} · {scenario.name}: {scenario.label}
                  </p>
                  <SimulatedTag>Fictional</SimulatedTag>
                </div>
                <p className="mt-1 text-[13px] text-muted">{scenario.context}</p>
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-expanded={reveal}
                  className="mt-2 text-[13px] font-medium text-accent"
                >
                  {reveal ? "Hide" : "Reveal"} what the engine should discover
                </button>
                {reveal && <p className="mt-1 text-[13px] text-ink">{scenario.hiddenCause}</p>}
                <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
                  {scenario.tryThis.map((tip) => (
                    <li key={tip} className="flex gap-2">
                      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                      {tip}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={autoplay}
                    disabled={playing || !session.current || Boolean(session.endedAt)}
                  >
                    {playing ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    Autoplay one step
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      tomorrow();
                      router.push("/session");
                    }}
                  >
                    <FastForward className="size-3.5" /> Tomorrow
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => launch(scenario.id, false)}>
                    <RotateCcw className="size-3.5" /> Restart
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      leaveDemo();
                      setOpen(false);
                      router.push(stash ? "/session" : "/");
                    }}
                  >
                    <Undo2 className="size-3.5" /> {stash ? "Back to my session" : "Leave demo"}
                  </Button>
                </div>
                {narration.length > 0 && (
                  <ol
                    className="mt-3 space-y-1 border-t border-line pt-2 font-mono text-[11.5px] text-muted"
                    aria-live="polite"
                  >
                    {narration.map((line, i) => (
                      <li key={i}>
                        <span className="text-ink-2">Simulated {scenario.name}:</span> {line}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <div className="mt-3 grid gap-2">
              {SCENARIOS.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border p-3",
                    s.id === scenarioId ? "border-ink" : "border-line",
                  )}
                >
                  <p className="text-sm text-ink">
                    <span className="font-mono text-muted">{s.id}</span>{" "}
                    <strong className="font-medium">{s.name}</strong> · {s.label}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{s.tagline}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant={s.id === scenarioId ? "secondary" : "primary"}
                      onClick={() => launch(s.id, false)}
                    >
                      Start session <ChevronRight className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => launch(s.id, true)}>
                      Walk through check-in
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {!ownerId && (
              <button
                type="button"
                onClick={() => {
                  forgetEverything();
                  setOpen(false);
                  router.push("/");
                }}
                className="mt-3 text-[12.5px] text-muted hover:text-ink"
              >
                Reset everything on this device
              </button>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-xl bg-ink px-2.5 text-[13px] font-medium text-inverse transition-opacity hover:opacity-90 sm:px-3"
      >
        <Sparkles className="size-4" aria-hidden />
        <span className="hidden sm:inline">
          {scenario ? `Demo · ${scenario.name}` : "Demo mode"}
        </span>
        <span className="sr-only sm:hidden">Demo mode</span>
      </button>
    </div>
  );
}
