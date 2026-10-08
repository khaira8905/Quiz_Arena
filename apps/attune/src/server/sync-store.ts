import type { LearnerEvent, SyncAck, SyncBatch } from "@attune/engine";

/**
 * Sync service: idempotent, append-only event ingestion keyed by event id.
 *
 * Prototype storage is an in-memory map (per server instance), which is enough to demonstrate
 * offline → reconnect → sync. In production this interface is backed by Postgres with a unique
 * index on (learner_id, event_id); nothing else changes.
 */

export interface SyncStore {
  ingest(batch: SyncBatch): SyncAck;
  count(learnerId: string): number;
}

const MAX_EVENTS_PER_LEARNER = 5000;
const MAX_LEARNERS = 1000;

class MemorySyncStore implements SyncStore {
  private learners = new Map<string, Map<string, LearnerEvent>>();

  ingest(batch: SyncBatch): SyncAck {
    let events = this.learners.get(batch.learnerId);
    if (!events) {
      if (this.learners.size >= MAX_LEARNERS) {
        // Bounded memory: drop the oldest learner. A real store has no such limit.
        const oldest = this.learners.keys().next().value;
        if (oldest !== undefined) this.learners.delete(oldest);
      }
      events = new Map();
      this.learners.set(batch.learnerId, events);
    }
    let accepted = 0;
    let duplicates = 0;
    for (const event of batch.events) {
      if (events.has(event.id)) {
        duplicates++;
      } else if (events.size < MAX_EVENTS_PER_LEARNER) {
        events.set(event.id, event as LearnerEvent);
        accepted++;
      }
    }
    return { accepted, duplicates, cursor: events.size, serverTime: Date.now() };
  }

  count(learnerId: string): number {
    return this.learners.get(learnerId)?.size ?? 0;
  }
}

const globalStore = globalThis as typeof globalThis & { __attuneSync?: SyncStore };
export const syncStore: SyncStore = (globalStore.__attuneSync ??= new MemorySyncStore());
