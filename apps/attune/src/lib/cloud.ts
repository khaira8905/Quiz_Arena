import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeLearnerModels, type LearnerModel, type SessionState } from "@attune/engine";
import { groupBySession, toEventRow, type OutboxItem } from "./sync";

/**
 * The account repository: every read and write against Supabase Postgres goes through here.
 * Row Level Security scopes each call to the signed-in user; `userId` is only ever the id of the
 * current session's user, and the database rejects anything else.
 *
 * Writes are idempotent: events are keyed by (user, client_event_id) and replays are ignored, so
 * a batch that half-succeeded before a connection dropped can simply be sent again.
 */

export class CloudError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CloudError";
  }
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new CloudError(res.error.message, res.error.code);
  return res.data;
}

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  const data = check(res);
  if (data === null) throw new CloudError("The server returned nothing.");
  return data;
}

function rows<T>(res: { data: T[] | null; error: { message: string; code?: string } | null }): T[] {
  return check(res) ?? [];
}

/* ---------------------------------------------------------------------------------------------- */
/* Shape guards for JSON that comes back from the database                                         */
/* ---------------------------------------------------------------------------------------------- */

export function isLearnerModel(v: unknown): v is LearnerModel {
  const m = v as LearnerModel | null;
  return (
    !!m &&
    typeof m === "object" &&
    typeof m.id === "string" &&
    typeof m.traits === "object" &&
    typeof m.ability === "object" &&
    typeof m.modality === "object" &&
    Array.isArray(m.snapshots) &&
    Array.isArray(m.seenActivities) &&
    typeof m.day === "number"
  );
}

export function isSessionState(v: unknown): v is SessionState {
  const s = v as SessionState | null;
  return (
    !!s &&
    typeof s === "object" &&
    typeof s.id === "string" &&
    Array.isArray(s.events) &&
    Array.isArray(s.decisions) &&
    Array.isArray(s.timeline) &&
    isLearnerModel(s.learner)
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Events and sessions                                                                             */
/* ---------------------------------------------------------------------------------------------- */

/** What the current session row should say about where the learner is. */
function sessionSnapshot(s: SessionState) {
  return {
    last_state: s,
    current_activity_id: s.current?.activity.id ?? null,
    current_state: s.current?.reading.primary ?? null,
    ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
  };
}

/**
 * Push a batch of outbox items. Each session row is upserted, then its events are inserted with
 * replays ignored. Returns the ids now safely stored. Throws on any failure; nothing is lost
 * because the caller only removes acknowledged ids from the outbox.
 */
export async function pushEvents(
  sb: SupabaseClient,
  userId: string,
  items: OutboxItem[],
  current: SessionState | null,
): Promise<string[]> {
  const acked: string[] = [];
  for (const [clientSessionId, group] of groupBySession(items)) {
    const first = group[0]!;
    const row = {
      user_id: userId,
      client_session_id: clientSessionId,
      day: Math.max(1, first.day),
      started_at: new Date(first.sessionStartedAt).toISOString(),
      ...(current && current.id === clientSessionId ? sessionSnapshot(current) : {}),
    };
    const session = must(
      await sb
        .from("learning_sessions")
        .upsert(row, { onConflict: "user_id,client_session_id" })
        .select("id")
        .single<{ id: string }>(),
    );
    const rows = group.map((i) => ({
      ...toEventRow(i.event),
      user_id: userId,
      session_id: session.id,
    }));
    check(
      await sb
        .from("events")
        .upsert(rows, { onConflict: "user_id,client_event_id", ignoreDuplicates: true }),
    );
    acked.push(...group.map((i) => i.event.id));
  }
  return acked;
}

/** Save where the learner is in the current session (no new events, e.g. after a sign-in). */
export async function saveSessionState(sb: SupabaseClient, userId: string, s: SessionState) {
  check(
    await sb.from("learning_sessions").upsert(
      {
        user_id: userId,
        client_session_id: s.id,
        day: Math.max(1, s.learner.day),
        started_at: new Date(s.startedAt).toISOString(),
        ...sessionSnapshot(s),
      },
      { onConflict: "user_id,client_session_id" },
    ),
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Learner model, with optimistic concurrency                                                      */
/* ---------------------------------------------------------------------------------------------- */

export interface ModelPush {
  revision: number;
  model: LearnerModel;
  /** Another device had changed the model; `model` is the merge of both. */
  merged: boolean;
}

async function readModel(sb: SupabaseClient, userId: string) {
  const row = check(
    await sb
      .from("learner_models")
      .select("model, revision")
      .eq("user_id", userId)
      .maybeSingle<{ model: unknown; revision: number }>(),
  );
  if (!row || !isLearnerModel(row.model)) return null;
  return { model: row.model, revision: row.revision };
}

/**
 * Save the model if nobody else changed it since `baseRevision`. If another device did, merge
 * the two (evidence is unioned, never discarded) and save the merge. Retries a few times if the
 * race repeats.
 */
export async function pushModel(
  sb: SupabaseClient,
  userId: string,
  model: LearnerModel,
  baseRevision: number | null,
): Promise<ModelPush> {
  let candidate = model;
  let base = baseRevision;
  let merged = false;
  for (let tries = 0; tries < 4; tries++) {
    if (base === null) {
      const remote = await readModel(sb, userId);
      if (!remote) {
        const res = await sb
          .from("learner_models")
          .insert({ user_id: userId, model: candidate, revision: 1 });
        if (!res.error) return { revision: 1, model: candidate, merged };
        if (res.error.code !== "23505") throw new CloudError(res.error.message, res.error.code);
        continue; // Another device created it first: merge on the next pass.
      }
      candidate = mergeLearnerModels(candidate, remote.model);
      merged = true;
      base = remote.revision;
    }
    const updated = rows(
      await sb
        .from("learner_models")
        .update({ model: candidate, revision: base + 1 })
        .eq("user_id", userId)
        .eq("revision", base)
        .select("revision"),
    );
    if (updated.length === 1) return { revision: base + 1, model: candidate, merged };
    base = null; // Lost the race: re-read, merge, try again.
  }
  throw new CloudError(
    "The learner model kept changing on another device. Will retry.",
    "conflict",
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Restore                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export interface Restore {
  model: { model: LearnerModel; revision: number } | null;
  session: SessionState | null;
}

/** Everything a returning learner needs on a new device: their model and where they left off. */
export async function fetchRestore(sb: SupabaseClient, userId: string): Promise<Restore> {
  const [model, latest] = await Promise.all([
    readModel(sb, userId),
    sb
      .from("learning_sessions")
      .select("last_state")
      .eq("user_id", userId)
      .not("last_state", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ last_state: unknown }>(),
  ]);
  const row = check(latest);
  const session = row && isSessionState(row.last_state) ? row.last_state : null;
  return { model, session };
}

/* ---------------------------------------------------------------------------------------------- */
/* Profile and settings                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export interface Profile {
  displayName: string;
  goal: string | null;
  interests: string[];
  createdAt: string;
}

export async function fetchProfile(sb: SupabaseClient, userId: string): Promise<Profile | null> {
  const row = check(
    await sb
      .from("profiles")
      .select("display_name, goal, interests, created_at")
      .eq("id", userId)
      .maybeSingle<{
        display_name: string;
        goal: string | null;
        interests: string[];
        created_at: string;
      }>(),
  );
  return row
    ? {
        displayName: row.display_name,
        goal: row.goal,
        interests: row.interests,
        createdAt: row.created_at,
      }
    : null;
}

export async function updateProfile(
  sb: SupabaseClient,
  userId: string,
  patch: Partial<Pick<Profile, "displayName" | "goal" | "interests">>,
) {
  check(
    await sb
      .from("profiles")
      .update({
        ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
        ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
        ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
      })
      .eq("id", userId),
  );
}

export interface CloudSettings {
  theme: "system" | "light" | "dark";
  motion: "system" | "reduce" | "full";
  modePreference: "auto" | "full" | "light" | "offline";
}

export async function fetchSettings(
  sb: SupabaseClient,
  userId: string,
): Promise<CloudSettings | null> {
  const row = check(
    await sb
      .from("user_settings")
      .select("theme, motion, mode_preference")
      .eq("user_id", userId)
      .maybeSingle<{
        theme: CloudSettings["theme"];
        motion: CloudSettings["motion"];
        mode_preference: CloudSettings["modePreference"];
      }>(),
  );
  return row ? { theme: row.theme, motion: row.motion, modePreference: row.mode_preference } : null;
}

export async function updateSettings(
  sb: SupabaseClient,
  userId: string,
  s: Partial<CloudSettings>,
) {
  check(
    await sb
      .from("user_settings")
      .update({
        ...(s.theme ? { theme: s.theme } : {}),
        ...(s.motion ? { motion: s.motion } : {}),
        ...(s.modePreference ? { mode_preference: s.modePreference } : {}),
      })
      .eq("user_id", userId),
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Progress (derived by the database from events)                                                  */
/* ---------------------------------------------------------------------------------------------- */

export interface CloudProgress {
  sessions: { day: number; startedAt: string; endedAt: string | null }[];
  attempts: {
    activityId: string;
    conceptId: string;
    correct: boolean;
    attempt: number;
    usedHint: boolean;
    at: string;
  }[];
  activities: {
    activityId: string;
    status: string;
    completions: number;
    bestScore: number | null;
    timeSpentMs: number;
  }[];
  feedback: { kind: string; value: string; at: string }[];
}

export async function fetchProgress(sb: SupabaseClient, userId: string): Promise<CloudProgress> {
  const [sessions, attempts, activities, feedback] = await Promise.all([
    sb
      .from("learning_sessions")
      .select("day, started_at, ended_at")
      .eq("user_id", userId)
      .order("started_at"),
    sb
      .from("attempts")
      .select("activity_id, concept_id, correct, attempt_number, used_hint, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at")
      .limit(2000),
    sb
      .from("activity_progress")
      .select("activity_id, status, completions, best_score, time_spent_ms")
      .eq("user_id", userId),
    sb
      .from("feedback")
      .select("kind, value, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at")
      .limit(2000),
  ]);
  return {
    sessions: rows(sessions).map((r) => ({
      day: r.day,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    })),
    attempts: rows(attempts).map((r) => ({
      activityId: r.activity_id,
      conceptId: r.concept_id,
      correct: r.correct,
      attempt: r.attempt_number,
      usedHint: r.used_hint,
      at: r.occurred_at,
    })),
    activities: rows(activities).map((r) => ({
      activityId: r.activity_id,
      status: r.status,
      completions: r.completions,
      bestScore: r.best_score === null ? null : Number(r.best_score),
      timeSpentMs: Number(r.time_spent_ms),
    })),
    feedback: rows(feedback).map((r) => ({ kind: r.kind, value: r.value, at: r.occurred_at })),
  };
}

export async function deleteAccount(sb: SupabaseClient) {
  check(await sb.rpc("delete_my_account"));
}
