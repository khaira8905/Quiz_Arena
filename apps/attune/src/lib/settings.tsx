"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MotionConfig } from "motion/react";
import { useAuth } from "./auth";
import { fetchSettings, updateSettings } from "./cloud";
import { useConnectivity, type ModePreference } from "./connectivity";
import { PREFS_KEY } from "./prefs";
import { readJson, writeJson } from "./storage";

/**
 * Appearance preferences: theme and motion. Saved on the device, and to the account when signed
 * in (so they follow the learner). The boot script applies them before first paint.
 */

export type ThemePref = "system" | "light" | "dark";
export type MotionPref = "system" | "reduce" | "full";

interface Prefs {
  theme: ThemePref;
  motion: MotionPref;
}

interface SettingsValue extends Prefs {
  setTheme: (t: ThemePref) => void;
  setMotion: (m: MotionPref) => void;
  setModePreference: (m: ModePreference) => void;
  /** True when animation should be minimal (the learner's choice or the OS setting). */
  reduceMotion: boolean;
}

const DEFAULTS: Prefs = { theme: "system", motion: "system" };

function apply(p: Prefs) {
  const d = document.documentElement;
  if (p.theme === "system") delete d.dataset.theme;
  else d.dataset.theme = p.theme;
  if (p.motion === "system") delete d.dataset.motion;
  else d.dataset.motion = p.motion;
}

function useOsReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduce(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return reduce;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const { supabase, user, status } = useAuth();
  const { setPreference, preference } = useConnectivity();
  const osReduce = useOsReducedMotion();
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const saved = readJson<Partial<Prefs>>(PREFS_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating a per-device preference after mount
    if (saved) setPrefs({ ...DEFAULTS, ...saved });
  }, []);

  const save = useCallback((next: Prefs) => {
    setPrefs(next);
    writeJson(PREFS_KEY, next);
    apply(next);
  }, []);

  // Signed in: the account's settings win on this device (they were chosen most deliberately).
  useEffect(() => {
    if (status !== "signed-in" || !supabase || !user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    void fetchSettings(supabase, user.id)
      .then((s) => {
        if (!s) return;
        save({ theme: s.theme, motion: s.motion });
        setPreference(s.modePreference);
      })
      .catch(() => {
        loadedFor.current = null; // Offline: try again next time.
      });
  }, [status, supabase, user, save, setPreference]);

  const remote = useCallback(
    (patch: Parameters<typeof updateSettings>[2]) => {
      if (status === "signed-in" && supabase && user) {
        void updateSettings(supabase, user.id, patch).catch(() => undefined);
      }
    },
    [status, supabase, user],
  );

  const value = useMemo<SettingsValue>(
    () => ({
      ...prefs,
      reduceMotion: prefs.motion === "reduce" || (prefs.motion === "system" && osReduce),
      setTheme: (theme) => {
        save({ ...prefs, theme });
        remote({ theme });
      },
      setMotion: (motion) => {
        save({ ...prefs, motion });
        remote({ motion });
      },
      setModePreference: (m) => {
        setPreference(m);
        if (m !== preference) remote({ modePreference: m });
      },
    }),
    [prefs, osReduce, save, remote, setPreference, preference],
  );

  const reducedMotion =
    prefs.motion === "reduce" ? "always" : prefs.motion === "full" ? "never" : "user";
  return (
    <SettingsContext.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
