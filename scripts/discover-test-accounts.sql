-- ============================================================================
-- READ-ONLY test account discovery query (item 3, phase A)
-- Run this in Supabase Dashboard -> SQL Editor -> New query.
-- This performs NO deletes/updates/inserts of any kind — SELECT only.
--
-- Purpose: enumerate every account whose email matches the test-account
-- pattern (test1@user.com, test23@user.com, etc. — same pattern as
-- src/lib/test-accounts.ts: `^test\d+@`, case-insensitive), plus a
-- per-account row count across the main participant-linked tables, so you
-- can review and approve the exact list of emails to delete BEFORE any
-- delete script is written or run.
-- ============================================================================

with test_users as (
  select
    u.id as auth_user_id,
    u.email,
    u.created_at as auth_created_at
  from auth.users u
  where u.email ~* '^test[0-9]+@'
),
matched_participants as (
  select
    tu.auth_user_id,
    tu.email,
    tu.auth_created_at,
    p.id as participant_id,
    p.first_name,
    p.last_name,
    p.status,
    p.enrolled_date,
    p.created_at as participant_created_at
  from test_users tu
  left join public.participants p
    on p.auth_user_id = tu.auth_user_id
)
select
  mp.email,
  mp.auth_user_id,
  mp.auth_created_at,
  mp.participant_id,
  trim(coalesce(mp.first_name, '') || ' ' || coalesce(mp.last_name, '')) as name,
  mp.status,
  mp.enrolled_date,
  mp.participant_created_at,
  (select count(*) from public.daily_wellness dw where dw.participant_id = mp.participant_id) as daily_wellness_rows,
  (select count(*) from public.workouts w where w.participant_id = mp.participant_id) as workouts_rows,
  (select count(*) from public.habits h where h.participant_id = mp.participant_id) as habits_rows,
  (select count(*) from public.pulse_surveys ps where ps.participant_id = mp.participant_id) as pulse_surveys_rows,
  (select count(*) from public.interventions i where i.participant_id = mp.participant_id) as interventions_rows,
  (select count(*) from public.challenge_participants cp where cp.participant_id = mp.participant_id) as challenge_participants_rows,
  (select count(*) from public.upload_batches ub where ub.participant_id = mp.participant_id) as upload_batches_rows,
  (select count(*) from public.nudge_acknowledgements na where na.participant_id = mp.participant_id) as nudge_acknowledgements_rows,
  (select count(*) from public.login_activity la where la.participant_id = mp.participant_id) as login_activity_rows,
  (
    coalesce((select count(*) from public.daily_wellness dw where dw.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.workouts w where w.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.habits h where h.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.pulse_surveys ps where ps.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.interventions i where i.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.challenge_participants cp where cp.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.upload_batches ub where ub.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.nudge_acknowledgements na where na.participant_id = mp.participant_id), 0)
    + coalesce((select count(*) from public.login_activity la where la.participant_id = mp.participant_id), 0)
  ) as total_data_rows
from matched_participants mp
order by mp.auth_created_at asc nulls last, mp.email asc;

-- ----------------------------------------------------------------------------
-- OPTIONAL: quick summary-only version (just the count + email list) if you
-- want a fast overview before scrolling the detailed table above.
-- ----------------------------------------------------------------------------
-- select count(*) as test_account_count, array_agg(email order by email) as emails
-- from auth.users
-- where email ~* '^test[0-9]+@';
