"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ConnectivityMode } from "@attune/engine";
import { readJson, writeJson } from "./storage";

/**
 * Connectivity manager. Resolves the effective mode from what the device reports and what the
 * learner prefers:
 *
 *   FULL     online, good connection: AI gateway, interactive visuals, motion
 *   LIGHT    data saver or a slow connection (or chosen): text-first, no AI calls
 *   OFFLINE  no network (or chosen): cached activities, events queue in an outbox
 *
 * SYNC is not a mode the learner picks: it's what happens when an outbox meets a connection.
 */

export type ModePreference = "auto" | ConnectivityMode;

interface NetworkInfo {
  online: boolean;
  /** The health probe failed even though the browser claims to be online. */
  probeFailed: boolean;
  effectiveType?: string;
  saveData?: boolean;
}

interface ConnectivityValue {
  mode: ConnectivityMode;
  preference: ModePreference;
  setPreference: (p: ModePreference) => void;
  network: NetworkInfo;
  /** Why the current mode was chosen, in plain words. */
  reason: string;
  aiConfigured: boolean;
}

const ConnectivityContext = createContext<ConnectivityValue | null>(null);
const PREF_KEY = "attune:mode";
const SLOW = new Set(["slow-2g", "2g", "3g"]);

interface NetworkConnection extends EventTarget {
  effectiveType?: string;
  saveData?: boolean;
}

function connection(): NetworkConnection | undefined {
  return (navigator as Navigator & { connection?: NetworkConnection }).connection;
}

export function resolveMode(
  preference: ModePreference,
  network: NetworkInfo,
): { mode: ConnectivityMode; reason: string } {
  if (!network.online || network.probeFailed) {
    return {
      mode: "offline",
      reason: network.online ? "Can't reach the server" : "This device is offline",
    };
  }
  if (preference !== "auto") return { mode: preference, reason: "You chose this mode" };
  if (network.saveData) return { mode: "light", reason: "Data saver is on" };
  if (network.effectiveType && SLOW.has(network.effectiveType)) {
    return { mode: "light", reason: `Slow connection detected (${network.effectiveType})` };
  }
  return { mode: "full", reason: "Good connection" };
}

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ModePreference>("auto");
  const [network, setNetwork] = useState<NetworkInfo>({ online: true, probeFailed: false });
  const [aiConfigured, setAiConfigured] = useState(false);

  useEffect(() => {
    const saved = readJson<ModePreference>(PREF_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating a per-device preference after mount
    if (saved) setPreferenceState(saved);
    const read = () => {
      const c = connection();
      setNetwork((n) => ({
        ...n,
        online: navigator.onLine,
        effectiveType: c?.effectiveType,
        saveData: c?.saveData,
      }));
    };
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    connection()?.addEventListener("change", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
      connection()?.removeEventListener("change", read);
    };
  }, []);

  // Health probe: catches "Wi-Fi connected, no internet". Polls faster while failing.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const probe = async () => {
      let ok = false;
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        ok = res.ok;
        if (ok) {
          const body = (await res.json()) as { ai?: boolean };
          if (!cancelled) setAiConfigured(Boolean(body.ai));
        }
      } catch {
        ok = false;
      }
      if (cancelled) return;
      setNetwork((n) => (n.probeFailed === !ok ? n : { ...n, probeFailed: !ok }));
      timer = setTimeout(probe, ok ? 30_000 : 6_000);
    };
    void probe();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [network.online]);

  const setPreference = useCallback((p: ModePreference) => {
    setPreferenceState(p);
    writeJson(PREF_KEY, p);
  }, []);

  const { mode, reason } = resolveMode(preference, network);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const value = useMemo(
    () => ({ mode, preference, setPreference, network, reason, aiConfigured }),
    [mode, preference, setPreference, network, reason, aiConfigured],
  );
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityValue {
  const value = useContext(ConnectivityContext);
  if (!value) throw new Error("useConnectivity must be used inside ConnectivityProvider");
  return value;
}
