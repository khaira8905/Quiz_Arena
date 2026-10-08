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
import {
  createRng,
  dispatch,
  endSession,
  nextDay,
  requestIntervention,
  resumeSession,
  scenarioById,
  setMode,
  simulateActivity,
  startSession,
  type CheckinInput,
  type InterventionKind,
  type LearnerEvent,
  type LearnerEventInput,
  type LearnerModel,
  type ScenarioId,
  type SessionState,
  type SimStep,
  type SyncAck,
} from "@attune/engine";
import { useConnectivity } from "./connectivity";
import { randomId, readJson, remove, writeJson } from "./storage";

/**
 * App state: the live session (engine state), the sync outbox, and a few community items.
 *
 * Everything stays on the device. On a shared device it lives only for this browser tab
 * (sessionStorage), so the next person who picks up the phone sees nothing.
 */

export interface Discovery {
  id: string;
  title: string;
  text: string;
  at: number;
}

export interface CircleQuestion {
  id: string;
  text: string;
  at: number;
}

interface Persisted {
  version: 1;
  deviceId: string;
  session: SessionState | null;
  scenarioId: ScenarioId | null;
  outbox: LearnerEvent[];
  synced: number;
  lastSyncAt: number | null;
  discoveries: Discovery[];
  questions: CircleQuestion[];
}

export type SyncPhase = "idle" | "syncing" | "waiting" | "error";

interface AttuneValue extends Persisted {
  hydrated: boolean;
  syncPhase: SyncPhase;
  syncProgress: { done: number; total: number } | null;
  begin: (learner: LearnerModel, checkin: CheckinInput, scenarioId?: ScenarioId | null) => void;
  startScenario: (id: ScenarioId) => void;
  send: (input: LearnerEventInput) => void;
  end: () => void;
  resume: () => void;
  tomorrow: () => void;
  request: (kind: InterventionKind) => void;
  updateLearner: (fn: (l: LearnerModel) => LearnerModel) => void;
  shareDiscovery: (d: Omit<Discovery, "id" | "at">) => void;
  askCircle: (text: string) => void;
  simulate: () => SimStep[];
  forgetEverything: () => void;
}

const KEY = "attune:v1";
const BATCH = 25;

const empty = (deviceId: string): Persisted => ({
  version: 1,
  deviceId,
  session: null,
  scenarioId: null,
  outbox: [],
  synced: 0,
  lastSyncAt: null,
  discoveries: [],
  questions: [],
});

/** Free text never leaves the device: reflections sync as a rating only. */
function forSync(e: LearnerEvent): LearnerEvent {
  return e.type === "reflection" ? { ...e, note: undefined } : e;
}

function isPersisted(value: unknown): value is Persisted {
  const v = value as Persisted | undefined;
  return (
    !!v &&
    v.version === 1 &&
    typeof v.deviceId === "string" &&
    Array.isArray(v.outbox) &&
    (v.session === null || (typeof v.session === "object" && Array.isArray(v.session.events)))
  );
}

const AttuneContext = createContext<AttuneValue | null>(null);

export function AttuneProvider({ children }: { children: React.ReactNode }) {
  const { mode, setPreference } = useConnectivity();
  const [data, setData] = useState<Persisted>(() => empty("dev-pending"));
  const [hydrated, setHydrated] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const syncing = useRef(false);

  /* Hydrate from whichever storage area holds this device's data. */
  useEffect(() => {
    const saved = readJson<unknown>(KEY, "session") ?? readJson<unknown>(KEY, "local");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating device storage after mount
    setData(isPersisted(saved) ? saved : empty(randomId("dev")));
    setHydrated(true);
  }, []);

  /* Persist. Shared devices keep data for this tab only. */
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      const shared = data.session?.learner.context.sharedDevice ?? false;
      if (shared) {
        remove(KEY);
        writeJson(KEY, data, "session");
      } else {
        writeJson(KEY, data, "local");
      }
    }, 200);
    return () => clearTimeout(t);
  }, [data, hydrated]);

  /* Keep the engine aware of connectivity (it shapes context, e.g. peer missions offline). */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors external connectivity into engine state
    setData((d) =>
      d.session && d.session.mode !== mode ? { ...d, session: setMode(d.session, mode) } : d,
    );
  }, [mode]);

  /** Apply an engine transition and queue any new events for sync. */
  const commit = useCallback((fn: (s: SessionState) => SessionState) => {
    setData((d) => {
      if (!d.session) return d;
      const next = fn(d.session);
      if (next === d.session) return d;
      const fresh =
        next.id === d.session.id ? next.events.slice(d.session.events.length) : next.events;
      return { ...d, session: next, outbox: [...d.outbox, ...fresh.map(forSync)] };
    });
  }, []);

  const begin = useCallback(
    (learner: LearnerModel, checkin: CheckinInput, scenarioId: ScenarioId | null = null) => {
      setData((d) => {
        const session = startSession({
          id: randomId("ses"),
          learner,
          checkin,
          now: Date.now(),
          mode,
        });
        return { ...d, session, scenarioId, outbox: [...d.outbox, ...session.events.map(forSync)] };
      });
    },
    [mode],
  );

  const startScenario = useCallback(
    (id: ScenarioId) => {
      const scenario = scenarioById(id);
      setPreference(scenario.mode === "light" ? "light" : "auto");
      begin(scenario.learner(), scenario.checkin, id);
    },
    [begin, setPreference],
  );

  const send = useCallback(
    (input: LearnerEventInput) => commit((s) => dispatch(s, input, Date.now())),
    [commit],
  );
  const end = useCallback(() => commit((s) => endSession(s, Date.now())), [commit]);
  const resume = useCallback(() => commit((s) => resumeSession(s, Date.now())), [commit]);
  const request = useCallback(
    (kind: InterventionKind) => commit((s) => requestIntervention(s, kind, Date.now())),
    [commit],
  );

  const tomorrow = useCallback(() => {
    setData((d) => {
      if (!d.session) return d;
      const scenario = d.scenarioId ? scenarioById(d.scenarioId) : undefined;
      const lastCheckin = [...d.session.events]
        .reverse()
        .find((e) => e.type === "checkin" && !e.partial);
      const checkin: CheckinInput =
        scenario?.dayTwoCheckin ??
        (lastCheckin && lastCheckin.type === "checkin"
          ? {
              feeling: lastCheckin.feeling,
              energy: lastCheckin.energy,
              timeBudgetMin: lastCheckin.timeBudgetMin,
              partial: false,
            }
          : { feeling: "okay", energy: 3, timeBudgetMin: 20, partial: false });
      const session = nextDay(d.session, checkin, Date.now(), randomId("ses"));
      return { ...d, session, outbox: [...d.outbox, ...session.events.map(forSync)] };
    });
  }, []);

  const updateLearner = useCallback((fn: (l: LearnerModel) => LearnerModel) => {
    setData((d) =>
      d.session ? { ...d, session: { ...d.session, learner: fn(d.session.learner) } } : d,
    );
  }, []);

  const shareDiscovery = useCallback((item: Omit<Discovery, "id" | "at">) => {
    setData((d) => ({
      ...d,
      discoveries: [{ ...item, id: randomId("dsc"), at: Date.now() }, ...d.discoveries].slice(
        0,
        20,
      ),
    }));
  }, []);

  const askCircle = useCallback((text: string) => {
    setData((d) => ({
      ...d,
      questions: [{ id: randomId("q"), text, at: Date.now() }, ...d.questions].slice(0, 20),
    }));
  }, []);

  const simulate = useCallback((): SimStep[] => {
    const s = data.session;
    if (!s || !data.scenarioId) return [];
    return simulateActivity(
      s,
      scenarioById(data.scenarioId).persona,
      createRng(s.seq * 7919 + s.decisions.length),
    );
  }, [data.session, data.scenarioId]);

  const forgetEverything = useCallback(() => {
    remove(KEY);
    setData(empty(randomId("dev")));
  }, []);

  /* Sync: drain the outbox whenever there's a connection. Idempotent on the server. */
  const dataRef = useRef(data);
  const modeRef = useRef(mode);
  useEffect(() => {
    dataRef.current = data;
    modeRef.current = mode;
  });
  const hasOutbox = data.outbox.length > 0;
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    if (!hydrated || syncing.current) return;
    if (mode === "offline") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecting connectivity in sync status
      setSyncPhase(hasOutbox ? "waiting" : "idle");
      return;
    }
    if (!hasOutbox) {
      setSyncPhase("idle");
      return;
    }
    syncing.current = true;
    setSyncPhase("syncing");
    const total = dataRef.current.outbox.length;
    setSyncProgress({ done: 0, total });

    void (async () => {
      let done = 0;
      let failed = false;
      try {
        while (modeRef.current !== "offline") {
          const d = dataRef.current;
          const batch = d.outbox.slice(0, BATCH);
          if (batch.length === 0) break;
          const res = await fetch("/api/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              learnerId: d.session?.learner.id ?? "anonymous",
              deviceId: d.deviceId,
              cursor: d.synced,
              events: batch,
            }),
          });
          if (!res.ok) throw new Error(`sync ${res.status}`);
          const ack = (await res.json()) as SyncAck;
          const ids = new Set(batch.map((e) => e.id));
          const next = {
            ...dataRef.current,
            outbox: dataRef.current.outbox.filter((e) => !ids.has(e.id)),
            synced: dataRef.current.synced + ack.accepted,
            lastSyncAt: ack.serverTime,
          };
          dataRef.current = next;
          setData((cur) => ({
            ...cur,
            outbox: cur.outbox.filter((e) => !ids.has(e.id)),
            synced: next.synced,
            lastSyncAt: next.lastSyncAt,
          }));
          done = Math.min(total, done + batch.length);
          setSyncProgress({ done, total: Math.max(total, done) });
          // Pace a large backlog slightly, so syncing reads as a process rather than a flicker.
          if (total > BATCH) await new Promise((r) => setTimeout(r, 350));
        }
      } catch {
        failed = true;
      }
      syncing.current = false;
      setSyncProgress(null);
      setSyncPhase(failed ? "error" : "idle");
      if (failed) setTimeout(() => setRetryTick((t) => t + 1), 5000);
      else setRetryTick((t) => t + 1);
    })();
  }, [hydrated, mode, hasOutbox, retryTick]);

  const value = useMemo<AttuneValue>(
    () => ({
      ...data,
      hydrated,
      syncPhase,
      syncProgress,
      begin,
      startScenario,
      send,
      end,
      resume,
      tomorrow,
      request,
      updateLearner,
      shareDiscovery,
      askCircle,
      simulate,
      forgetEverything,
    }),
    [
      data,
      hydrated,
      syncPhase,
      syncProgress,
      begin,
      startScenario,
      send,
      end,
      resume,
      tomorrow,
      request,
      updateLearner,
      shareDiscovery,
      askCircle,
      simulate,
      forgetEverything,
    ],
  );

  return <AttuneContext.Provider value={value}>{children}</AttuneContext.Provider>;
}

export function useAttune(): AttuneValue {
  const value = useContext(AttuneContext);
  if (!value) throw new Error("useAttune must be used inside AttuneProvider");
  return value;
}
