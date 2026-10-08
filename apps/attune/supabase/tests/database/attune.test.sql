-- Database tests: signup provisioning, event-derived progress, idempotent replay, and Row Level
-- Security between two users. Run with `supabase test db`. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'asha@test.local', '{"display_name": "Asha"}', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bilal@test.local', '{}', 'authenticated', 'authenticated');

select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Asha', 'signup creates a profile from the display name');
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Learner', 'a missing display name falls back to a default');
select is((select count(*)::int from public.user_settings
            where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2, 'signup creates default settings');

-- ---- As Asha ----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

insert into public.learning_sessions (id, user_id, client_session_id, started_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ses-a', now());

insert into public.events (user_id, session_id, client_event_id, type, payload, occurred_at) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:1', 'activity_started',
   '{"activityId": "q-d3-b", "kind": "CONTINUE"}', now()),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:2', 'answer',
   '{"activityId": "q-d3-b", "conceptId": "logs", "difficulty": 3, "correct": false, "latencyMs": 4000, "usedHint": false, "attempt": 1}', now()),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:3', 'answer',
   '{"activityId": "q-d3-b", "conceptId": "logs", "difficulty": 3, "correct": true, "latencyMs": 6000, "usedHint": true, "attempt": 2}', now()),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:4', 'activity_completed',
   '{"activityId": "q-d3-b", "dwellMs": 12000, "score": 0.5}', now()),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:5', 'control',
   '{"action": "TOO_EASY"}', now()),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:6', 'checkin',
   '{"feeling": "bored", "energy": 3, "timeBudgetMin": 20, "partial": true}', now()),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:7', 'activity_started',
   '{"activityId": "choice-logs-3", "kind": "MODALITY_CHOICE"}', now());

select is((select count(*)::int from public.attempts), 2, 'answers become attempts');
select is((select max(attempt_number)::int from public.attempts), 2, 'a retry is recorded as attempt 2');
select results_eq(
  $$select status, completions, attempts, best_score::text, time_spent_ms::int from public.activity_progress$$,
  $$values ('completed'::text, 1, 2, '0.500'::text, 12000)$$,
  'progress is derived from events (unknown activity ids are ignored)');
select results_eq(
  $$select kind, value from public.feedback order by kind$$,
  $$values ('control'::text, 'TOO_EASY'::text), ('mood'::text, 'bored'::text)$$,
  'controls and mood check-ins become feedback');

insert into public.events (user_id, session_id, client_event_id, type, payload, occurred_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:5', 'control',
        '{"action": "TOO_EASY"}', now())
on conflict (user_id, client_event_id) do nothing;
select is((select count(*)::int from public.events), 7, 'replaying an event from the outbox is a no-op');
select is((select count(*)::int from public.feedback), 2, 'a replayed event derives nothing twice');

select throws_ok(
  $$insert into public.events (user_id, session_id, client_event_id, type, payload, occurred_at)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ses-a:8', 'reflection',
            '{"usefulness": 3, "note": "private thoughts"}', now())$$,
  '23514', null, 'reflection notes are rejected by the database');
select throws_ok(
  $$insert into public.attempts (user_id, event_id, session_id, activity_id, concept_id, difficulty, correct, latency_ms, occurred_at)
    select user_id, id, session_id, 'q-d1-a', 'doubling', 1, true, 1, now() from public.events limit 1$$,
  '42501', null, 'clients cannot write derived tables directly');

-- ---- As Bilal ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select is((select count(*)::int from public.events), 0, 'another user cannot read events');
select is((select count(*)::int from public.attempts), 0, 'another user cannot read attempts');
select is((select count(*)::int from public.learning_sessions), 0, 'another user cannot read sessions');
select is((select count(*)::int from public.profiles), 1, 'another user sees only their own profile');
select throws_ok(
  $$insert into public.events (user_id, session_id, client_event_id, type, payload, occurred_at)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', 'hint', '{"activityId": "q-d3-b"}', now())$$,
  '42501', null, 'another user cannot write into someone else''s session');
select throws_ok(
  $$insert into public.events (user_id, session_id, client_event_id, type, payload, occurred_at)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'y', 'hint', '{"activityId": "q-d3-b"}', now())$$,
  '42501', null, 'another user cannot impersonate the owner');
update public.profiles set display_name = 'hacked' where id = '11111111-1111-1111-1111-111111111111';

-- ---- Account deletion -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is((select display_name from public.profiles), 'Asha', 'updates to someone else''s profile do nothing');
select lives_ok($$select public.delete_my_account()$$, 'a user can delete their own account');

reset role;
select is((select count(*)::int from public.events where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'deleting the account removes all of its data');

select * from finish();
rollback;
