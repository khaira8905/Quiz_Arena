import { z } from "zod";
import { CONCEPTS, CONTROLS, FEELINGS, INTERVENTIONS, MODALITIES, REACTIONS } from "./types";

/**
 * Boundary schemas. Anything that crosses the network (sync batches) or comes back out of storage
 * is validated against these before the engine touches it.
 */

const base = { id: z.string().min(1).max(96), at: z.number().int().nonnegative() };

export const learnerEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("checkin"),
    feeling: z.enum(FEELINGS),
    energy: z.number().int().min(1).max(5),
    timeBudgetMin: z.number().int().min(1).max(240),
    partial: z.boolean(),
    selfAssessment: z.enum(["confident", "unsure", "lost"]).optional(),
    intent: z.enum(["finish", "understand", "interesting", "company", "start"]).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("activity_started"),
    activityId: z.string().max(96),
    kind: z.enum(INTERVENTIONS),
  }),
  z.object({
    ...base,
    type: z.literal("answer"),
    activityId: z.string().max(96),
    conceptId: z.enum(CONCEPTS),
    difficulty: z.number().int().min(1).max(5),
    correct: z.boolean(),
    latencyMs: z.number().int().nonnegative().max(3_600_000),
    usedHint: z.boolean(),
    attempt: z.number().int().min(1).max(10).optional(),
  }),
  z.object({ ...base, type: z.literal("hint"), activityId: z.string().max(96) }),
  z.object({ ...base, type: z.literal("control"), action: z.enum(CONTROLS) }),
  z.object({ ...base, type: z.literal("reaction"), reaction: z.enum(REACTIONS) }),
  z.object({
    ...base,
    type: z.literal("activity_completed"),
    activityId: z.string().max(96),
    dwellMs: z.number().int().nonnegative(),
    score: z.number().min(0).max(1).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("activity_abandoned"),
    activityId: z.string().max(96),
    dwellMs: z.number().int().nonnegative(),
  }),
  z.object({
    ...base,
    type: z.literal("choice"),
    choice: z.union([z.enum(MODALITIES), z.literal("hands-on")]),
  }),
  z.object({
    ...base,
    type: z.literal("reflection"),
    usefulness: z.number().int().min(1).max(3),
    // Free text never leaves the device; the client strips it before sync.
    note: z.undefined().optional(),
  }),
  z.object({ ...base, type: z.literal("assist"), activityId: z.string().max(96) }),
]);

export const syncBatchSchema = z.object({
  learnerId: z.string().min(1).max(64),
  deviceId: z.string().min(1).max(64),
  /** Number of events the client believes the server already holds. */
  cursor: z.number().int().nonnegative(),
  events: z.array(learnerEventSchema).max(500),
});

export type SyncBatch = z.infer<typeof syncBatchSchema>;

export interface SyncAck {
  accepted: number;
  duplicates: number;
  cursor: number;
  serverTime: number;
}
