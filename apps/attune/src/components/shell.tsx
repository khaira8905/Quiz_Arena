"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  CloudOff,
  FastForward,
  Feather,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
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
import { useConnectivity, type ModePreference } from "@/lib/connectivity";
import { useAttune } from "@/lib/store";
import { Button, cn, Eyebrow, SimulatedTag } from "./ui";

const NAV = [
  { href: "/session", label: "Session" },
  { href: "/twin", label: "Twin" },
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
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 rounded-md">
            <BrandMark />
            <span className="voice text-[19px] leading-none">Attune</span>
          </Link>
          {!immersive && (
            <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
              {NAV.map((item) => (
                <NavLink key={item.href} href={item.href} active={pathname.startsWith(item.href)}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ConnectivityControl />
            <DemoDirector />
          </div>
        </div>
        {!immersive && (
          <nav
            aria-label="Primary"
            className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden"
          >
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href} active={pathname.startsWith(item.href)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors",
        active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Connectivity control: mode, reason, outbox and sync, all visible.                          */
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

function ConnectivityControl() {
  const { mode, preference, setPreference, reason, network, aiConfigured } = useConnectivity();
  const { outbox, synced, syncPhase, syncProgress, lastSyncAt, hydrated } = useAttune();
  const { open, setOpen, ref } = usePopover();
  const Icon = mode === "offline" ? WifiOff : mode === "light" ? Feather : Wifi;
  const pending = outbox.length;

  let status: React.ReactNode;
  if (syncPhase === "syncing" && syncProgress) {
    status = (
      <span className="inline-flex items-center gap-1 text-accent">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Syncing {syncProgress.done}/
        {syncProgress.total}
      </span>
    );
  } else if (pending > 0) {
    status = (
      <span className="inline-flex items-center gap-1 text-warn">
        <CloudOff className="size-3.5" aria-hidden /> {pending} queued
      </span>
    );
  } else if (hydrated && synced > 0) {
    status = (
      <span className="inline-flex items-center gap-1 text-good">
        <Check className="size-3.5" aria-hidden /> Synced
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Connectivity: ${MODE_COPY[mode].label} mode`}
        className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink-2 hover:border-line-strong"
      >
        <Icon className="size-4" aria-hidden />
        <span className="font-medium text-ink">{MODE_COPY[mode].label}</span>
        {status && <span className="hidden border-l border-line pl-2 sm:inline">{status}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(92vw,360px)] rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <Eyebrow>Connectivity</Eyebrow>
          <p className="mt-1 text-sm text-ink">
            Running in <strong>{MODE_COPY[mode].label}</strong> mode ·{" "}
            <span className="text-muted">{reason}</span>
          </p>
          <div className="mt-3 grid gap-1.5" role="radiogroup" aria-label="Mode">
            {(Object.keys(MODE_COPY) as ModePreference[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={preference === p}
                onClick={() => setPreference(p)}
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
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[12.5px]">
            <dt className="text-muted">Network</dt>
            <dd className="text-ink">
              {network.online && !network.probeFailed ? "Online" : "Offline"}
              {network.effectiveType ? ` · ${network.effectiveType}` : ""}
              {network.saveData ? " · data saver" : ""}
            </dd>
            <dt className="text-muted">Outbox</dt>
            <dd className="tabular text-ink">
              {pending === 0 ? "Empty" : `${pending} events waiting`}
            </dd>
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
              {mode !== "full" ? "Off in this mode" : aiConfigured ? "Available" : "Not configured"}
            </dd>
          </dl>
          {syncPhase === "error" && (
            <p className="mt-2 text-[12.5px] text-danger">
              Sync failed. Retrying shortly; nothing is lost.
            </p>
          )}
        </div>
      )}
    </div>
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
    startScenario,
    simulate,
    send,
    tomorrow,
    forgetEverything,
    hydrated,
  } = useAttune();
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [narration, setNarration] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const scenario = scenarioId ? scenarioById(scenarioId) : undefined;

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
      {open && (
        <section
          aria-label="Demo director"
          className="fixed right-3 top-[60px] z-40 w-[min(94vw,380px)] max-h-[calc(100dvh-76px)] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-soft sm:right-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow>Demo mode</Eyebrow>
              <p className="mt-1 text-sm text-ink-2">
                Four fictional learners, one topic, four reasons for disengaging.
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
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm text-ink">
                    <span className="font-mono text-muted">{s.id}</span>{" "}
                    <strong className="font-medium">{s.name}</strong> · {s.label}
                  </p>
                </div>
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
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-xl bg-ink px-3 text-[13px] font-medium text-inverse hover:opacity-90"
      >
        <Sparkles className="size-4" aria-hidden />
        <span className="hidden sm:inline">
          {scenario ? `Demo · ${scenario.name}` : "Demo mode"}
        </span>
        <span className="sm:hidden">Demo</span>
      </button>
    </div>
  );
}
