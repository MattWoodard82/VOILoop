-- Migration: rename employees → participants and employee_id → participant_id
-- Idempotent: all steps check current state before acting.

-- ─── 1. Rename the employees table ───────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employees'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'participants'
  ) then
    alter table employees rename to participants;
  end if;
end $$;

-- ─── 2. Rename employee_id columns in dependent tables ───────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'daily_wellness' and column_name = 'employee_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'daily_wellness' and column_name = 'participant_id'
  ) then
    alter table daily_wellness rename column employee_id to participant_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts' and column_name = 'employee_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts' and column_name = 'participant_id'
  ) then
    alter table workouts rename column employee_id to participant_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'habits' and column_name = 'employee_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'habits' and column_name = 'participant_id'
  ) then
    alter table habits rename column employee_id to participant_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pulse_surveys' and column_name = 'employee_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pulse_surveys' and column_name = 'participant_id'
  ) then
    alter table pulse_surveys rename column employee_id to participant_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'interventions' and column_name = 'employee_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'interventions' and column_name = 'participant_id'
  ) then
    alter table interventions rename column employee_id to participant_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenge_participants' and column_name = 'employee_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenge_participants' and column_name = 'participant_id'
  ) then
    alter table challenge_participants rename column employee_id to participant_id;
  end if;
end $$;

-- ─── 3. Update role values: employee → participant ────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'role'
  ) then
    -- Relax the check constraint so we can migrate values safely
    alter table user_roles drop constraint if exists user_roles_role_check;
    update user_roles set role = 'participant' where role = 'employee';
    alter table user_roles
      add constraint user_roles_role_check
      check (role in ('admin', 'wellness_director', 'participant'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_access' and column_name = 'role'
  ) then
    alter table user_access drop constraint if exists user_access_role_check;
    update user_access set role = 'participant' where role = 'employee';
    alter table user_access
      add constraint user_access_role_check
      check (role in ('admin', 'wellness_director', 'participant'));
    alter table user_access alter column role set default 'participant';
  end if;
end $$;

-- ─── 4. Update challenge_eligibility_mode enum ───────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_enum
    where enumtypid = 'challenge_eligibility_mode'::regtype
      and enumlabel = 'all_employees'
  ) then
    alter type challenge_eligibility_mode rename value 'all_employees' to 'all_participants';
  end if;
exception
  when feature_not_supported then null; -- older PG that doesn't support enum rename; skip
end $$;

-- Update any stored 'all_employees' values in challenges table to 'all_participants'
-- (only needed if the enum rename above was skipped on older PG)
do $$
begin
  if exists (
    select 1 from pg_type where typname = 'challenge_eligibility_mode'
  ) and exists (
    select 1 from challenges where eligibility_mode::text = 'all_employees'
  ) then
    -- Cast through text to work around strict enum typing
    update challenges
    set eligibility_mode = 'all_participants'::challenge_eligibility_mode
    where eligibility_mode::text = 'all_employees';
  end if;
end $$;

-- ─── 5. Add missing columns if absent (participants table) ───────────────────

alter table if exists participants add column if not exists location_id text;
alter table if exists participants add column if not exists employment_type text;

-- ─── 6. Rebuild indexes with participant naming ───────────────────────────────

-- Drop legacy employee-named indexes if they still exist
drop index if exists idx_wellness_emp_date;
drop index if exists idx_workouts_emp_date;
drop index if exists idx_habits_emp_date;
drop index if exists idx_pulse_emp_date;
drop index if exists idx_interventions_emp;

-- Recreate with participant naming (IF NOT EXISTS is safe on repeated runs)
create index if not exists idx_wellness_participant_date   on daily_wellness(participant_id, date desc);
create index if not exists idx_workouts_participant_date   on workouts(participant_id, date desc);
create index if not exists idx_habits_participant_date     on habits(participant_id, date desc);
create index if not exists idx_pulse_participant_date      on pulse_surveys(participant_id, date desc);
create index if not exists idx_interventions_participant   on interventions(participant_id);

-- ─── 7. participants.auth_user_id cascade FK ─────────────────────────────────
-- Mirror the fix from 20260719173000 for DBs that skipped it (participants
-- didn't exist yet when that migration ran; the rename above just created it).

do $$
begin
  if to_regclass('public.participants') is not null then
    -- Nullify any stale auth_user_id references
    update public.participants p
    set auth_user_id = null
    where p.auth_user_id is not null
      and not exists (
        select 1 from auth.users u where u.id = p.auth_user_id
      );

    alter table public.participants
      drop constraint if exists participants_auth_user_id_fkey;

    alter table public.participants
      add constraint participants_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

-- ─── 8. Rebuild team_latest_wellness view ────────────────────────────────────

create or replace view team_latest_wellness as
select
  p.id,
  p.first_name,
  p.last_name,
  p.department,
  p.title,
  p.is_exact_data,
  w.date,
  w.recovery_score,
  w.hrv_ms,
  w.resting_hr,
  w.day_strain,
  w.sleep_perf,
  w.sleep_debt,
  case
    when w.recovery_score >= 67 then 'green'
    when w.recovery_score >= 34 then 'yellow'
    else 'red'
  end as recovery_status,
  case
    when w.recovery_score < 34 or w.sleep_debt > 2 then 'High'
    when w.recovery_score < 67 or w.sleep_debt > 1 then 'Medium'
    else 'Low'
  end as risk_level
from participants p
left join lateral (
  select * from daily_wellness dw
  where dw.participant_id = p.id
  order by date desc
  limit 1
) w on true
where p.status = 'Active';
