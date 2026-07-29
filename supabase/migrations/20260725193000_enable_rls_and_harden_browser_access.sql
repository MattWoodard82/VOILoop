-- Enable row-level security on browser-accessible tables and add explicit
-- role/ownership policies for PHI-sensitive pilot data.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ua.role
  from public.user_access ua
  where ua.user_id = auth.uid()
  limit 1
$$;

grant execute on function public.current_app_role() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Events and nudges tables (created here because older environments may not
-- have committed migrations for this feature area yet)
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  event_date date not null,
  event_time text not null default '',
  location text not null default '',
  event_type text not null default 'general' check (event_type in ('outdoor', 'fitness', 'race', 'general')),
  recurring boolean not null default false,
  recurrence text,
  rsvp_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_nudges (
  id uuid primary key default gen_random_uuid(),
  week_of date not null unique,
  message text not null check (length(btrim(message)) > 0),
  author text not null default 'VOILoop',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, participant_id)
);

create index if not exists idx_events_event_date on public.events(event_date);
create index if not exists idx_weekly_nudges_week_of on public.weekly_nudges(week_of desc);
do $$
begin
  -- Index is performance-only. On drifted environments this step may fail due
  -- to existing conflicting objects or ownership/privilege differences; do not
  -- block the security migration when that happens.
  begin
    create index idx_event_rsvps_participant on public.event_rsvps(participant_id);
  exception
    when duplicate_table or duplicate_object then
      begin
        create index if not exists idx_event_rsvps_participant_event_rsvps
          on public.event_rsvps(participant_id);
      exception
        when others then
          raise notice 'Skipping fallback event_rsvps participant index: %', sqlerrm;
      end;
    when others then
      raise notice 'Skipping event_rsvps participant index: %', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Enable RLS on browser-reachable and PHI-relevant tables
-- ---------------------------------------------------------------------------

alter table if exists public.user_access enable row level security;
alter table if exists public.participants enable row level security;
alter table if exists public.daily_wellness enable row level security;
alter table if exists public.workouts enable row level security;
alter table if exists public.habits enable row level security;
alter table if exists public.pulse_surveys enable row level security;
alter table if exists public.interventions enable row level security;
alter table if exists public.upload_batches enable row level security;
alter table if exists public.import_logs enable row level security;
alter table if exists public.import_row_outcomes enable row level security;
alter table if exists public.challenges enable row level security;
alter table if exists public.challenge_participants enable row level security;
alter table if exists public.challenge_audit_log enable row level security;
alter table if exists public.events enable row level security;
alter table if exists public.weekly_nudges enable row level security;
alter table if exists public.event_rsvps enable row level security;

-- ---------------------------------------------------------------------------
-- user_access: users can read and update password gate on their own row only.
-- Privileged provisioning continues through service-role server paths.
-- ---------------------------------------------------------------------------

drop policy if exists user_access_select_own on public.user_access;
drop policy if exists user_access_update_own on public.user_access;

create policy user_access_select_own
on public.user_access
for select
using (auth.uid() = user_id);

create policy user_access_update_own
on public.user_access
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and role = public.current_app_role()
);

grant select on public.user_access to authenticated;
revoke update on public.user_access from authenticated, anon;
grant update (must_change_password) on public.user_access to authenticated;
revoke update (user_id, role, created_at, updated_at) on public.user_access from authenticated;

-- ---------------------------------------------------------------------------
-- participants and wellness data
-- ---------------------------------------------------------------------------

drop policy if exists participants_select_scoped on public.participants;
drop policy if exists participants_admin_mutate on public.participants;
create policy participants_select_scoped
on public.participants
for select
using (
  auth.uid() = auth_user_id
  or public.current_app_role() in ('admin', 'wellness_director')
);
create policy participants_admin_mutate
on public.participants
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists daily_wellness_select_scoped on public.daily_wellness;
drop policy if exists daily_wellness_admin_mutate on public.daily_wellness;
create policy daily_wellness_select_scoped
on public.daily_wellness
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
create policy daily_wellness_admin_mutate
on public.daily_wellness
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists workouts_select_scoped on public.workouts;
drop policy if exists workouts_admin_mutate on public.workouts;
create policy workouts_select_scoped
on public.workouts
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
create policy workouts_admin_mutate
on public.workouts
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists habits_select_scoped on public.habits;
drop policy if exists habits_admin_mutate on public.habits;
create policy habits_select_scoped
on public.habits
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
create policy habits_admin_mutate
on public.habits
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists pulse_surveys_select_scoped on public.pulse_surveys;
drop policy if exists pulse_surveys_admin_mutate on public.pulse_surveys;
drop policy if exists pulse_surveys_participant_insert on public.pulse_surveys;
create policy pulse_surveys_select_scoped
on public.pulse_surveys
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
create policy pulse_surveys_admin_mutate
on public.pulse_surveys
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');
create policy pulse_surveys_participant_insert
on public.pulse_surveys
for insert
with check (
  participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Interventions and import metadata
-- ---------------------------------------------------------------------------

drop policy if exists interventions_select_leadership on public.interventions;
drop policy if exists interventions_mutate_leadership on public.interventions;
create policy interventions_select_leadership
on public.interventions
for select
using (public.current_app_role() in ('admin', 'wellness_director'));
create policy interventions_mutate_leadership
on public.interventions
for all
using (public.current_app_role() in ('admin', 'wellness_director'))
with check (public.current_app_role() in ('admin', 'wellness_director'));

drop policy if exists upload_batches_select_scoped on public.upload_batches;
drop policy if exists upload_batches_admin_mutate on public.upload_batches;
create policy upload_batches_select_scoped
on public.upload_batches
for select
using (
  imported_by = auth.uid()
  or public.current_app_role() in ('admin', 'wellness_director')
);
create policy upload_batches_admin_mutate
on public.upload_batches
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists import_logs_select_leadership on public.import_logs;
drop policy if exists import_logs_admin_mutate on public.import_logs;
create policy import_logs_select_leadership
on public.import_logs
for select
using (public.current_app_role() in ('admin', 'wellness_director'));
create policy import_logs_admin_mutate
on public.import_logs
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists import_row_outcomes_select_leadership on public.import_row_outcomes;
drop policy if exists import_row_outcomes_admin_mutate on public.import_row_outcomes;
create policy import_row_outcomes_select_leadership
on public.import_row_outcomes
for select
using (public.current_app_role() in ('admin', 'wellness_director'));
create policy import_row_outcomes_admin_mutate
on public.import_row_outcomes
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

drop policy if exists challenges_select_authenticated on public.challenges;
drop policy if exists challenges_admin_mutate on public.challenges;
create policy challenges_select_authenticated
on public.challenges
for select
using (auth.uid() is not null);
create policy challenges_admin_mutate
on public.challenges
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists challenge_participants_select_scoped on public.challenge_participants;
drop policy if exists challenge_participants_admin_mutate on public.challenge_participants;
create policy challenge_participants_select_scoped
on public.challenge_participants
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
create policy challenge_participants_admin_mutate
on public.challenge_participants
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists challenge_audit_log_select_leadership on public.challenge_audit_log;
drop policy if exists challenge_audit_log_admin_mutate on public.challenge_audit_log;
create policy challenge_audit_log_select_leadership
on public.challenge_audit_log
for select
using (public.current_app_role() in ('admin', 'wellness_director'));
create policy challenge_audit_log_admin_mutate
on public.challenge_audit_log
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Events and nudges
-- ---------------------------------------------------------------------------

drop policy if exists events_select_authenticated on public.events;
drop policy if exists events_admin_mutate on public.events;
create policy events_select_authenticated
on public.events
for select
using (auth.uid() is not null);
create policy events_admin_mutate
on public.events
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists weekly_nudges_select_authenticated on public.weekly_nudges;
drop policy if exists weekly_nudges_admin_mutate on public.weekly_nudges;
create policy weekly_nudges_select_authenticated
on public.weekly_nudges
for select
using (auth.uid() is not null);
create policy weekly_nudges_admin_mutate
on public.weekly_nudges
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- Align event_rsvps schema: prod has legacy 'employee_id' column name and legacy
-- policy names from before the rename_employees_to_participants migration era.
do $$
begin
  -- Rename employee_id -> participant_id if the old column name is still present.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_rsvps'
      and column_name = 'employee_id'
  ) then
    alter table public.event_rsvps rename column employee_id to participant_id;
  end if;
  -- Drop legacy policies that pre-date the RLS hardening migration.
  drop policy if exists admin_write_rsvps on public.event_rsvps;
  drop policy if exists all_read_rsvps on public.event_rsvps;
  drop policy if exists employee_insert_rsvp on public.event_rsvps;
exception
  when others then
    raise exception 'event_rsvps schema alignment failed: %', sqlerrm;
end $$;

drop policy if exists event_rsvps_select_scoped on public.event_rsvps;
drop policy if exists event_rsvps_mutate_scoped on public.event_rsvps;
create policy event_rsvps_select_scoped
on public.event_rsvps
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
create policy event_rsvps_mutate_scoped
on public.event_rsvps
for all
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
)
with check (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
