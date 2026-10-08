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
  mergeLearnerModels,
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
import { useAuth } from "./auth";
import { CloudError, fetchRestore, pushEvents, pushModel } from "./cloud";
import { useConnectivity } from "./connectivity";
import { randomId, readJson, remove, writeJson } from "./storage";
import {
  acknowledge,
  deriveSyncStatus,
  enqueue,
  forSync,
  retryDelayMs,
  type OutboxItem,
  type SyncPhase,
  type SyncStatus,
} from "./sync";

/**
 * App state: the live session (engine state), the sync outbox, and a few community items.
 *
 * Guests: everything stays on the device (and syncs to the demo server, which forgets on
 * restart). With an account: the same outbox drains into Supabase Postgres, which is the source of
 * truth, and a returning learner's model and last session are restored on any device.
 *
 * On a shared device, data lives only for this browser tab (sessionStorage).
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
  version: 2;
  deviceId: string;
  /** The account this device data belongs to; null for a guest. */
  ownerId: string | null;
  session: SessionState | null;
  scenarioId: ScenarioId | null;
  /** The learner's own session, parked while a fictional demo scenario runs. */
  stash: SessionState | null;
  /** A returning learner's model, restored from their account, waiting for today's check-in. */
  savedLearner: LearnerModel | null;
  outbox: OutboxItem[];
  synced: number;
  lastSyncAt: number | null;
  /** The account's learner-model revision this device last saw (optimistic concurrency). */
  modelRevision: number | null;
  /** The learner model changed since it was last saved to the account. */
  modelDirty: boolean;
  discoveries: Discovery[];
  questions: CircleQuestion[];
}

export type RestoreState = "idle" | "restoring" | "failed";

interface AttuneValue extends Persisted {
  hydrated: boolean;
  /** Where progress goes: an account, the guest demo server, or nowhere yet. */
  syncTarget: "cloud" | "guest" | "none";
  syncStatus: SyncStatus;
  syncPhase: SyncPhase;
  syncError: string | null;
  syncProgress: { done: number; total: number } | null;
  pending: number;
  nextRetryAt: number | null;
  restore: RestoreState;
  retrySync: () => void;
  retryRestore: () => void;
  begin: (learner: LearnerModel, checkin: CheckinInput, scenarioId?: ScenarioId | null) => void;
  startScenario: (id: ScenarioId) => void;
  leaveDemo: () => void;
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
  /** Sign out and clear this account's data from the device. */
  signOut: () => Promise<{ error?: string }>;
}

const KEY = "attune:v1";
const BATCH = 25;

const empty = (deviceId: string): Persisted => ({
  version: 2,
  deviceId,
  ownerId: null,
  session: null,
  scenarioId: null,
  stash: null,
  savedLearner: null,
  outbox: [],
  synced: 0,
  lastSyncAt: null,
  modelRevision: null,
  modelDirty: false,
  discoveries: [],
  questions: [],
});

function itemsFor(s: SessionState, events: LearnerEvent[], demo: boolean): OutboxItem[] {
  return events.map((event) => ({
    sessionId: s.id,
    day: s.learner.day,
    sessionStartedAt: s.startedAt,
    event: forSync(event),
    ...(demo ? { demo: true } : {}),
  }));
}

function isSession(v: unknown): v is SessionState {
  const s = v as SessionState | null;
  return !!s && typeof s === "object" && Array.isArray(s.events) && typeof s.id === "string";
}

/** Read what's saved, upgrading the v1 shape (a flat list of events) if needed. */
export function migrate(saved: unknown): Persisted | null {
  const v = saved as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || typeof v.deviceId !== "string" || !Array.isArray(v.outbox)) {
    return null;
  }
  const session = v.session === null || v.session === undefined ? null : v.session;
  if (session !== null && !isSession(session)) return null;
  if (v.version === 2) return v as unknown as Persisted;
  if (v.version !== 1) return null;
  const s = session as SessionState | null;
  const outbox: OutboxItem[] = (v.outbox as LearnerEvent[]).map((event) => ({
    sessionId: event.id.slice(0, event.id.lastIndexOf(":")) || s?.id || "ses-legacy",
    day: s?.learner.day ?? 1,
    sessionStartedAt: s?.startedAt ?? event.at,
    event: forSync(event),
  }));
  return {
    ...empty(v.deviceId),
    session: s,
    scenarioId: (v.scenarioId as ScenarioId | null) ?? null,
    outbox,
    synced: typeof v.synced === "number" ? v.synced : 0,
    lastSyncAt: typeof v.lastSyncAt === "number" ? v.lastSyncAt : null,
    discoveries: Array.isArray(v.discoveries) ? (v.discoveries as Discovery[]) : [],
    questions: Array.isArray(v.questions) ? (v.questions as CircleQuestion[]) : [],
  };
}

/** The account's own learner (never a fictional demo learner). */
function ownLearner(d: Persisted): LearnerModel | null {
  if (d.scenarioId) return d.stash?.learner ?? d.savedLearner;
  return d.session?.learner ?? d.savedLearner;
}

function withOwnLearner(d: Persisted, learner: LearnerModel): Persisted {
  if (d.scenarioId) {
    return d.stash ? { ...d, stash: { ...d.stash, learner } } : { ...d, savedLearner: learner };
  }
  return d.session ? { ...d, session: { ...d.session, learner } } : { ...d, savedLearner: learner };
}

function describe(e: unknown): string {
  if (e instanceof CloudError) {
    if (e.code === "42501" || e.code === "PGRST301")
      return "Your session expired. Log in again to sync.";
    return e.message;
  }
  if (e instanceof TypeError) return "Can't reach the server.";
  return e instanceof Error ? e.message : "Sync failed.";
}

const AttuneContext = createContext<AttuneValue | null>(null);

export function AttuneProvider({ children }: { children: React.ReactNode }) {
  const { mode, network, setPreference } = useConnectivity();
  const auth = useAuth();
  const userId = auth.status === "signed-in" ? (auth.user?.id ?? null) : null;
  const [data, setData] = useState<Persisted>(() => empty("dev-pending"));
  const [hydrated, setHydrated] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const [restore, setRestore] = useState<RestoreState>("idle");
  const syncing = useRef(false);
  const failures = useRef(0);
  const explicitSignOut = useRef(false);

  /* Hydrate from whichever storage area holds this device's data. */
  useEffect(() => {
    const saved = migrate(readJson<unknown>(KEY, "session") ?? readJson<unknown>(KEY, "local"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating device storage after mount
    setData(saved ?? empty(randomId("dev")));
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

  const dataRef = useRef(data);
  const modeRef = useRef(mode);
  const userRef = useRef(userId);
  useEffect(() => {
    dataRef.current = data;
    modeRef.current = mode;
    userRef.current = userId;
  });

  /* ------------------------------------------------------------------------------------------ */
  /* Engine transitions                                                                          */
  /* ------------------------------------------------------------------------------------------ */

  /** Apply an engine transition and queue any new events for sync. */
  const commit = useCallback((fn: (s: SessionState) => SessionState) => {
    setData((d) => {
      if (!d.session) return d;
      const next = fn(d.session);
      if (next === d.session) return d;
      const fresh =
        next.id === d.session.id ? next.events.slice(d.session.events.length) : next.events;
      return {
        ...d,
        session: next,
        outbox: enqueue(d.outbox, itemsFor(next, fresh, Boolean(d.scenarioId))),
        modelDirty: d.modelDirty || (!d.scenarioId && next.learner !== d.session.learner),
      };
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
        // Starting a demo parks the learner's own session; starting their own replaces it.
        const stash = scenarioId ? (d.scenarioId ? d.stash : d.session) : null;
        return {
          ...d,
          session,
          scenarioId,
          stash,
          savedLearner: scenarioId ? d.savedLearner : null,
          outbox: enqueue(d.outbox, itemsFor(session, session.events, Boolean(scenarioId))),
          modelDirty: d.modelDirty || !scenarioId,
        };
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

  const leaveDemo = useCallback(() => {
    setData((d) =>
      d.scenarioId
        ? { ...d, session: d.stash ? setMode(d.stash, mode) : null, stash: null, scenarioId: null }
        : d,
    );
  }, [mode]);

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
      // Closing today can record events too (an open activity is abandoned): queue those first.
      const demo = Boolean(d.scenarioId);
      const ended = endSession(d.session, d.session.now);
      const session = nextDay(d.session, checkin, Date.now(), randomId("ses"));
      return {
        ...d,
        session,
        outbox: enqueue(d.outbox, [
          ...itemsFor(ended, ended.events.slice(d.session.events.length), demo),
          ...itemsFor(session, session.events, demo),
        ]),
        modelDirty: d.modelDirty || !demo,
      };
    });
  }, []);

  const updateLearner = useCallback((fn: (l: LearnerModel) => LearnerModel) => {
    setData((d) => {
      if (!d.session) return d;
      return {
        ...d,
        session: { ...d.session, learner: fn(d.session.learner) },
        modelDirty: d.modelDirty || !d.scenarioId,
      };
    });
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

  /** Guests: wipe the device. Signed in: wipe the device copy (the account keeps its data). */
  const forgetEverything = useCallback(() => {
    remove(KEY);
    setData((d) => ({ ...empty(randomId("dev")), ownerId: d.ownerId, modelRevision: null }));
  }, []);

  /* ------------------------------------------------------------------------------------------ */
  /* Accounts: adopt a guest session, or restore a returning learner                            */
  /* ------------------------------------------------------------------------------------------ */

  const restoreFromCloud = useCallback(
    async (uid: string) => {
      const sb = auth.supabase;
      if (!sb) return;
      setRestore("restoring");
      try {
        const r = await fetchRestore(sb, uid);
        if (userRef.current !== uid) return;
        const learner = r.model?.model ?? null;
        // Continue where they left off, as a continuation on this device: new event ids can never
        // collide with events another device records for the original session.
        const session = r.session
          ? setMode(
              { ...r.session, id: randomId("ses"), learner: learner ?? r.session.learner },
              modeRef.current,
            )
          : null;
        setData((d) => ({
          ...empty(d.deviceId),
          ownerId: uid,
          session,
          savedLearner: session ? null : learner,
          modelRevision: r.model?.revision ?? null,
          lastSyncAt: Date.now(),
        }));
        setRestore("idle");
      } catch {
        if (userRef.current === uid) setRestore("failed");
      }
    },
    [auth.supabase],
  );

  useEffect(() => {
    if (!hydrated || auth.status === "loading") return;
    const d = dataRef.current;
    if (!userId) {
      // Signed out. An explicit sign-out already cleared the device. If the session simply
      // expired with progress still queued, keep it so the next sign-in can sync it.
      if (d.ownerId && (explicitSignOut.current || d.outbox.length === 0)) {
        setData(empty(d.deviceId));
      }
      explicitSignOut.current = false;
      setRestore("idle");
      return;
    }
    if (restore === "restoring" || d.ownerId === userId) return;
    const own = d.scenarioId ? d.stash : d.session;
    if (d.ownerId === null && own) {
      // A guest just created an account (or logged in): this device's session joins the account.
      const items = itemsFor(own, own.events, false);
      setData({
        ...d,
        ownerId: userId,
        outbox: enqueue(
          d.outbox.filter((i) => !i.demo),
          items,
        ),
        modelRevision: null,
        modelDirty: true,
        synced: 0,
      });
      return;
    }
    // A failed restore waits for the retry below (or the learner's "Try again").
    if (restore === "failed") return;
    // Someone else's data (or a guest demo) is on this device: it never mixes with this account.
    setData({ ...empty(d.deviceId), ownerId: null });
    void restoreFromCloud(userId);
  }, [hydrated, auth.status, userId, restore, restoreFromCloud]);

  /* A restore that failed (offline, server down) retries on its own while there's a connection. */
  useEffect(() => {
    if (restore !== "failed" || !userId || mode === "offline") return;
    const t = setTimeout(() => void restoreFromCloud(userId), 8000);
    return () => clearTimeout(t);
  }, [restore, userId, mode, restoreFromCloud]);

  const signOut = useCallback(async () => {
    explicitSignOut.current = true;
    const result = await auth.signOut();
    remove(KEY);
    setData((d) => empty(d.deviceId));
    return result;
  }, [auth]);

  /* ------------------------------------------------------------------------------------------ */
  /* Sync: drain the outbox (and the model) whenever there's a connection. Idempotent.          */
  /* ------------------------------------------------------------------------------------------ */

  const syncTarget: AttuneValue["syncTarget"] = !hydrated
    ? "none"
    : userId
      ? data.ownerId === userId && restore === "idle"
        ? "cloud"
        : "none"
      : auth.status === "loading" || data.ownerId
        ? "none"
        : "guest";
  const hasWork = data.outbox.length > 0 || (syncTarget === "cloud" && data.modelDirty);
  const [tick, setTick] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const retrySync = useCallback(() => {
    clearTimeout(retryTimer.current);
    failures.current = 0;
    setNextRetryAt(null);
    setTick((t) => t + 1);
  }, []);
  const retryRestore = useCallback(() => {
    if (userId) void restoreFromCloud(userId);
  }, [userId, restoreFromCloud]);

  useEffect(() => {
    if (syncing.current || syncTarget === "none" || mode === "offline") return;
    if (!hasWork) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecting an empty outbox
      setSyncPhase("idle");
      return;
    }
    const target = syncTarget;
    const uid = userId;
    const sb = auth.supabase;
    syncing.current = true;
    clearTimeout(retryTimer.current);
    setNextRetryAt(null);
    setSyncPhase("syncing");
    const total = dataRef.current.outbox.length;
    setSyncProgress({ done: 0, total });

    void (async () => {
      let done = 0;
      try {
        while (modeRef.current !== "offline" && userRef.current === uid) {
          const d = dataRef.current;
          const batch = d.outbox.slice(0, BATCH);
          if (batch.length === 0) break;
          let acked: string[];
          let serverTime = Date.now();
          if (target === "cloud" && sb && uid) {
            const real = batch.filter((i) => !i.demo);
            acked = [
              ...batch.filter((i) => i.demo).map((i) => i.event.id),
              ...(real.length
                ? await pushEvents(sb, uid, real, d.scenarioId ? d.stash : d.session)
                : []),
            ];
          } else {
            const res = await fetch("/api/sync", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                learnerId: d.session?.learner.id ?? "anonymous",
                deviceId: d.deviceId,
                cursor: d.synced,
                events: batch.map((i) => i.event),
              }),
            });
            if (!res.ok) throw new Error(`The sync server answered ${res.status}.`);
            const ack = (await res.json()) as SyncAck;
            acked = batch.map((i) => i.event.id);
            serverTime = ack.serverTime;
          }
          const next = { ...dataRef.current, outbox: acknowledge(dataRef.current.outbox, acked) };
          dataRef.current = next;
          setData((cur) => ({
            ...cur,
            outbox: acknowledge(cur.outbox, acked),
            synced: cur.synced + acked.length,
            lastSyncAt: serverTime,
          }));
          done = Math.min(total, done + batch.length);
          setSyncProgress({ done, total: Math.max(total, done) });
          // Pace a large backlog slightly, so syncing reads as a process rather than a flicker.
          if (total > BATCH) await new Promise((r) => setTimeout(r, 300));
        }

        if (target === "cloud" && sb && uid && userRef.current === uid) {
          const d = dataRef.current;
          const learner = ownLearner(d);
          if (d.modelDirty && !learner) {
            setData((cur) => (ownLearner(cur) ? cur : { ...cur, modelDirty: false }));
          } else if (d.modelDirty && learner) {
            const saved = await pushModel(sb, uid, learner, d.modelRevision);
            setData((cur) => {
              const latest = ownLearner(cur);
              const unchanged = latest === learner;
              const model =
                unchanged || !latest ? saved.model : mergeLearnerModels(latest, saved.model);
              const withModel = saved.merged || !unchanged ? withOwnLearner(cur, model) : cur;
              return {
                ...withModel,
                modelRevision: saved.revision,
                modelDirty: !unchanged,
                lastSyncAt: Date.now(),
              };
            });
          }
        }
        failures.current = 0;
        setSyncError(null);
        setSyncPhase("idle");
      } catch (e) {
        failures.current += 1;
        const wait = retryDelayMs(failures.current);
        setSyncError(describe(e));
        setSyncPhase("failed");
        setNextRetryAt(Date.now() + wait);
        retryTimer.current = setTimeout(() => {
          setNextRetryAt(null);
          setTick((t) => t + 1);
        }, wait);
      } finally {
        syncing.current = false;
        setSyncProgress(null);
        if (failures.current === 0) setTick((t) => t + 1);
      }
    })();
    // `tick` re-runs the loop after each pass; the refs carry the live data.
  }, [syncTarget, mode, hasWork, tick, userId, auth.supabase]);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  const syncStatus = deriveSyncStatus({
    browserOnline: network.online,
    probeFailed: network.probeFailed,
    phase: syncPhase,
    // Not syncing anywhere yet (signing in, restoring): say "online", never a stale "synced".
    pending: syncTarget === "none" ? 0 : data.outbox.length,
    everSynced: syncTarget !== "none" && (data.synced > 0 || data.lastSyncAt !== null),
  });

  const value = useMemo<AttuneValue>(
    () => ({
      ...data,
      hydrated,
      syncTarget,
      syncStatus,
      syncPhase,
      syncError,
      syncProgress,
      pending: data.outbox.length,
      nextRetryAt,
      restore,
      retrySync,
      retryRestore,
      begin,
      startScenario,
      leaveDemo,
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
      signOut,
    }),
    [
      data,
      hydrated,
      syncTarget,
      syncStatus,
      syncPhase,
      syncError,
      syncProgress,
      nextRetryAt,
      restore,
      retrySync,
      retryRestore,
      begin,
      startScenario,
      leaveDemo,
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
      signOut,
    ],
  );

  return <AttuneContext.Provider value={value}>{children}</AttuneContext.Provider>;
}

export function useAttune(): AttuneValue {
  const value = useContext(AttuneContext);
  if (!value) throw new Error("useAttune must be used inside AttuneProvider");
  return value;
}
