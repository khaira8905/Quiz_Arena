import type { LearnerEvent } from "@attune/engine";

/**
 * The sync status machine, as pure functions so it can be tested without a browser.
 *
 *   offline       the device has no network
 *   reconnecting  the network is back (or claims to be) but the server isn't answering yet
 *   syncing       draining the outbox
 *   synced        everything recorded has reached its destination
 *   failed        the last attempt failed; it retries with backoff, or now on request
 *   online        connected, nothing has needed syncing yet
 */
export type SyncStatus = "online" | "offline" | "reconnecting" | "syncing" | "synced" | "failed";

/** What the sync loop is doing, independent of the network. */
export type SyncPhase = "idle" | "syncing" | "failed";

export interface SyncInputs {
  browserOnline: boolean;
  /** The health probe to our own server is failing. */
  probeFailed: boolean;
  phase: SyncPhase;
  pending: number;
  /** Anything has ever synced from this device (for this owner). */
  everSynced: boolean;
}

export function deriveSyncStatus(i: SyncInputs): SyncStatus {
  if (!i.browserOnline) return "offline";
  if (i.probeFailed) return "reconnecting";
  if (i.phase === "syncing") return "syncing";
  if (i.phase === "failed") return "failed";
  if (i.pending > 0) return "syncing";
  return i.everSynced ? "synced" : "online";
}

export const SYNC_COPY: Record<SyncStatus, { label: string; detail: string }> = {
  online: { label: "Online", detail: "Connected. Progress syncs as you go." },
  offline: {
    label: "Offline",
    detail: "Everything still works. Progress is saved on this device and syncs later.",
  },
  reconnecting: {
    label: "Reconnecting",
    detail: "The network is back but the server isn't answering yet. Nothing is lost.",
  },
  syncing: { label: "Syncing", detail: "Sending saved progress." },
  synced: { label: "Synced", detail: "Everything you've done is saved." },
  failed: {
    label: "Sync failed",
    detail: "Your progress is safe on this device. Retrying automatically.",
  },
};

/** Exponential backoff with a cap: 2s, 4s, 8s, 16s, 30s, 30s… */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(30_000, 1000 * 2 ** Math.min(failures, 5));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* Outbox                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

/** An event waiting to sync, with the session it belongs to (a day can roll over offline). */
export interface OutboxItem {
  sessionId: string;
  day: number;
  sessionStartedAt: number;
  event: LearnerEvent;
  /** From a fictional demo scenario: shown syncing to the demo server, never saved to an account. */
  demo?: boolean;
}

/** Free text never leaves the device: reflections sync as a rating only. */
export function forSync(e: LearnerEvent): LearnerEvent {
  if (e.type !== "reflection" || e.note === undefined) return e;
  const { note: _note, ...rest } = e;
  void _note;
  return rest;
}

/** Remove acknowledged items. Matching is by event id, so a replayed batch is harmless. */
export function acknowledge(outbox: OutboxItem[], ids: Iterable<string>): OutboxItem[] {
  const done = new Set(ids);
  return outbox.filter((item) => !done.has(item.event.id));
}

/** Append without duplicating an event already queued (a retry can re-queue the same event). */
export function enqueue(outbox: OutboxItem[], items: OutboxItem[]): OutboxItem[] {
  const have = new Set(outbox.map((i) => i.event.id));
  const fresh = items.filter((i) => !have.has(i.event.id) && (have.add(i.event.id), true));
  return fresh.length ? [...outbox, ...fresh] : outbox;
}

/** Group a batch by session, keeping order, so each session row is upserted once. */
export function groupBySession(items: OutboxItem[]): Map<string, OutboxItem[]> {
  const groups = new Map<string, OutboxItem[]>();
  for (const item of items) {
    const list = groups.get(item.sessionId);
    if (list) list.push(item);
    else groups.set(item.sessionId, [item]);
  }
  return groups;
}

/** The row shape for `public.events`, minus the ids the server resolves. */
export function toEventRow(e: LearnerEvent): {
  client_event_id: string;
  type: LearnerEvent["type"];
  payload: Record<string, unknown>;
  occurred_at: string;
} {
  const { id, at, type, ...payload } = forSync(e) as LearnerEvent & Record<string, unknown>;
  return { client_event_id: id, type, payload, occurred_at: new Date(at).toISOString() };
}
