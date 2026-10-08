-- Attune: accounts, learner state, sessions, an append-only event log, and progress derived from it.
--
-- Design:
--   * `events` is the single write path for learning activity. Devices append events (idempotent on
--     (user_id, client_event_id)), so an offline outbox can be replayed safely any number of times.
--   * `attempts`, `activity_progress` and `feedback` are derived from events by a trigger. Clients can
--     read them but never write them, so progress can't drift from the event log.
--   * Every private table has Row Level Security: a user can only ever see or change their own rows.

-- ------------------------------------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Learner' check (char_length(display_name) between 1 and 40),
  goal text check (char_length(goal) <= 120),
  interests text[] not null default '{}' check (cardinality(interests) <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  motion text not null default 'system' check (motion in ('system', 'reduce', 'full')),
  mode_preference text not null default 'auto'
    check (mode_preference in ('auto', 'full', 'light', 'offline')),
  consent jsonb not null default
    '{"learnFromBehaviour": true, "useAiGateway": true, "shareWithMentor": false}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The learner's digital twin. `revision` gives optimistic concurrency: a device writes with
-- "where revision = <the revision I started from>", and merges on conflict instead of overwriting.
create table public.learner_models (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  model jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

-- Read-only catalogue of the activities shipped in the app bundle (see seed migration).
create table public.activities (
  id text primary key check (char_length(id) <= 96),
  type text not null,
  concept_id text not null,
  difficulty smallint check (difficulty between 1 and 5),
  title text not null
);

create table public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_session_id text not null check (char_length(client_session_id) between 1 and 64),
  day integer not null default 1 check (day >= 1),
  started_at timestamptz not null,
  ended_at timestamptz,
  -- The resumable engine state: where the learner was, what was on screen, the decision trail.
  last_state jsonb,
  current_activity_id text,
  current_state text,
  updated_at timestamptz not null default now(),
  unique (user_id, client_session_id),
  check (ended_at is null or ended_at >= started_at)
);
create index learning_sessions_user_recent on public.learning_sessions (user_id, updated_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.learning_sessions (id) on delete cascade,
  client_event_id text not null check (char_length(client_event_id) between 1 and 96),
  type text not null check (type in (
    'checkin', 'activity_started', 'answer', 'hint', 'control', 'reaction',
    'activity_completed', 'activity_abandoned', 'choice', 'reflection', 'assist'
  )),
  payload jsonb not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id),
  -- Free-text reflection notes never leave the device.
  check (not (type = 'reflection' and payload ? 'note'))
);
create index events_user_time on public.events (user_id, occurred_at);
create index events_session on public.events (session_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null unique references public.events (id) on delete cascade,
  session_id uuid not null references public.learning_sessions (id) on delete cascade,
  activity_id text not null references public.activities (id),
  concept_id text not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  attempt_number smallint not null default 1 check (attempt_number >= 1),
  correct boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  used_hint boolean not null default false,
  occurred_at timestamptz not null
);
create index attempts_user_activity on public.attempts (user_id, activity_id);
create index attempts_user_time on public.attempts (user_id, occurred_at desc);

create table public.activity_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id text not null references public.activities (id),
  status text not null check (status in ('started', 'completed', 'abandoned')),
  starts integer not null default 0 check (starts >= 0),
  completions integer not null default 0 check (completions >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  best_score numeric(4, 3) check (best_score between 0 and 1),
  last_score numeric(4, 3) check (last_score between 0 and 1),
  time_spent_ms bigint not null default 0 check (time_spent_ms >= 0),
  first_started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null unique references public.events (id) on delete cascade,
  session_id uuid not null references public.learning_sessions (id) on delete cascade,
  kind text not null check (kind in ('control', 'reaction', 'mood', 'reflection', 'choice')),
  value text not null check (char_length(value) <= 40),
  usefulness smallint check (usefulness between 1 and 3),
  occurred_at timestamptz not null
);
create index feedback_user_time on public.feedback (user_id, occurred_at desc);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 40),
  label text not null check (char_length(label) <= 80),
  detail text check (char_length(detail) <= 200),
  achieved_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ------------------------------------------------------------------------------------------------
-- Functions and triggers
-- ------------------------------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();
create trigger learner_models_touch before update on public.learner_models
  for each row execute function public.touch_updated_at();
create trigger learning_sessions_touch before update on public.learning_sessions
  for each row execute function public.touch_updated_at();

-- New account → profile + default settings.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), ''), 'Learner')
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Derive attempts, progress and feedback from each new event. Runs with definer rights because
-- clients may not write the derived tables directly; `new.user_id` was already checked by the
-- events insert policy (it must equal auth.uid()).
create function public.derive_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity text := new.payload ->> 'activityId';
  known boolean := activity is not null
    and exists (select 1 from public.activities a where a.id = activity);
  score numeric := (new.payload ->> 'score')::numeric;
begin
  if new.type = 'answer' and known then
    insert into public.attempts (
      user_id, event_id, session_id, activity_id, concept_id, difficulty,
      attempt_number, correct, latency_ms, used_hint, occurred_at
    ) values (
      new.user_id, new.id, new.session_id, activity,
      new.payload ->> 'conceptId',
      (new.payload ->> 'difficulty')::smallint,
      greatest(coalesce((new.payload ->> 'attempt')::smallint, 1), 1),
      (new.payload ->> 'correct')::boolean,
      greatest((new.payload ->> 'latencyMs')::integer, 0),
      coalesce((new.payload ->> 'usedHint')::boolean, false),
      new.occurred_at
    );
    insert into public.activity_progress (user_id, activity_id, status, attempts, first_started_at)
    values (new.user_id, activity, 'started', 1, new.occurred_at)
    on conflict (user_id, activity_id) do update
      set attempts = public.activity_progress.attempts + 1, updated_at = now();

  elsif new.type = 'activity_started' and known then
    insert into public.activity_progress (user_id, activity_id, status, starts, first_started_at)
    values (new.user_id, activity, 'started', 1, new.occurred_at)
    on conflict (user_id, activity_id) do update
      set starts = public.activity_progress.starts + 1,
          status = case when public.activity_progress.status = 'completed'
                        then 'completed' else 'started' end,
          first_started_at = coalesce(public.activity_progress.first_started_at, new.occurred_at),
          updated_at = now();

  elsif new.type = 'activity_completed' and known then
    insert into public.activity_progress (
      user_id, activity_id, status, completions, best_score, last_score, time_spent_ms,
      first_started_at, completed_at
    ) values (
      new.user_id, activity, 'completed', 1, score, score,
      greatest(coalesce((new.payload ->> 'dwellMs')::bigint, 0), 0), new.occurred_at, new.occurred_at
    )
    on conflict (user_id, activity_id) do update
      set status = 'completed',
          completions = public.activity_progress.completions + 1,
          last_score = coalesce(score, public.activity_progress.last_score),
          best_score = greatest(public.activity_progress.best_score, score),
          time_spent_ms = public.activity_progress.time_spent_ms
            + greatest(coalesce((new.payload ->> 'dwellMs')::bigint, 0), 0),
          completed_at = new.occurred_at,
          updated_at = now();

  elsif new.type = 'activity_abandoned' and known then
    insert into public.activity_progress (user_id, activity_id, status, time_spent_ms, first_started_at)
    values (
      new.user_id, activity, 'abandoned',
      greatest(coalesce((new.payload ->> 'dwellMs')::bigint, 0), 0), new.occurred_at
    )
    on conflict (user_id, activity_id) do update
      set status = case when public.activity_progress.status = 'completed'
                        then 'completed' else 'abandoned' end,
          time_spent_ms = public.activity_progress.time_spent_ms
            + greatest(coalesce((new.payload ->> 'dwellMs')::bigint, 0), 0),
          updated_at = now();

  elsif new.type in ('control', 'reaction', 'choice', 'reflection')
     or (new.type = 'checkin' and (new.payload ->> 'partial')::boolean) then
    insert into public.feedback (user_id, event_id, session_id, kind, value, usefulness, occurred_at)
    values (
      new.user_id, new.id, new.session_id,
      case new.type when 'checkin' then 'mood' else new.type end,
      left(coalesce(
        new.payload ->> 'action', new.payload ->> 'reaction', new.payload ->> 'choice',
        new.payload ->> 'feeling', 'rating'
      ), 40),
      (new.payload ->> 'usefulness')::smallint,
      new.occurred_at
    );
  end if;
  return new;
end;
$$;

create trigger events_derive after insert on public.events
  for each row execute function public.derive_from_event();

-- Let a signed-in user delete their own account (and, by cascade, everything above).
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.derive_from_event() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.learner_models enable row level security;
alter table public.activities enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.events enable row level security;
alter table public.attempts enable row level security;
alter table public.activity_progress enable row level security;
alter table public.feedback enable row level security;
alter table public.milestones enable row level security;

-- Profiles and settings are created by the signup trigger; users read and edit their own.
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "settings: read own" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "settings: insert own" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "settings: update own" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "models: read own" on public.learner_models
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "models: insert own" on public.learner_models
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "models: update own" on public.learner_models
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "models: delete own" on public.learner_models
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "activities: readable by everyone" on public.activities
  for select to anon, authenticated using (true);

create policy "sessions: read own" on public.learning_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "sessions: insert own" on public.learning_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sessions: update own" on public.learning_sessions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "sessions: delete own" on public.learning_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Events are append-only: no update policy. They go away with their session or account.
create policy "events: read own" on public.events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "events: append own" on public.events
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.learning_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- Derived tables: read-only for their owner.
create policy "attempts: read own" on public.attempts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress: read own" on public.activity_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress: delete own" on public.activity_progress
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy "feedback: read own" on public.feedback
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "milestones: read own" on public.milestones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "milestones: insert own" on public.milestones
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "milestones: delete own" on public.milestones
  for delete to authenticated using ((select auth.uid()) = user_id);
