-- VOILoop Supabase Schema
-- Run this entire file in Supabase → SQL Editor → New query

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists participants (
  id            text primary key,
  auth_user_id  uuid unique,
  first_name    text not null,
  last_name     text not null,
  department    text,
  location_id   text,
  employment_type text,
  title         text,
  device_id     text,
  consent       boolean default true,
  enrolled_date date,
  status        text default 'Active',
  is_exact_data boolean default false,
  created_at    timestamptz default now()
);

create table if not exists upload_batches (
  id               uuid primary key default gen_random_uuid(),
  imported_by      uuid references auth.users(id) on delete set null,
  file_name        text not null,
  file_size_bytes  bigint not null default 0 check (file_size_bytes >= 0),
  file_hash_sha256 text not null,
  status           text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'partial', 'failed')),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  rows_processed   int not null default 0,
  rows_inserted    int not null default 0,
  rows_updated     int not null default 0,
  rows_skipped     int not null default 0,
  rows_failed      int not null default 0
);
create table if not exists user_roles (
  id         smallint primary key default 1 check (id = 1),
  role       text not null check (role in ('admin', 'wellness_director', 'participant')) default 'wellness_director',
  updated_at timestamptz default now()
);

create table if not exists user_access (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  role                 text not null check (role in ('admin', 'wellness_director', 'participant')) default 'participant',
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table if exists user_roles
  drop constraint if exists user_roles_role_check;

alter table if exists user_roles
  alter column role set default 'wellness_director';

update user_roles
set role = 'wellness_director'
where role = 'staff';

alter table if exists user_roles
  add constraint user_roles_role_check check (role in ('admin', 'wellness_director', 'participant'));

alter table if exists user_access
  drop constraint if exists user_access_role_check;

alter table if exists user_access
  alter column role set default 'participant';

update user_access
set role = 'wellness_director'
where role = 'staff';

alter table if exists user_access
  add constraint user_access_role_check check (role in ('admin', 'wellness_director', 'participant'));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_roles'
      and column_name = 'role'
  ) then
    insert into user_roles (role)
    select 'wellness_director'
    where not exists (
      select 1 from user_roles where role = 'wellness_director'
    );
  end if;
end $$;
create table if not exists daily_wellness (
  id                 uuid primary key default gen_random_uuid(),
  participant_id        text references participants(id) on delete cascade,
  source_batch_id    uuid references upload_batches(id) on delete set null,
  date               date not null,
  recovery_score     int,
  hrv_ms             int,
  resting_hr         int,
  blood_oxygen       numeric(5,2),
  skin_temp          numeric(5,2),
  day_strain         numeric(5,2),
  calories           int,
  sleep_perf         int,
  sleep_hrs          numeric(4,2),
  sleep_debt         numeric(4,2),
  sleep_need         numeric(4,2),
  deep_sleep         numeric(4,2),
  rem_sleep          numeric(4,2),
  light_sleep        numeric(4,2),
  sleep_eff          int,
  sleep_consistency  int,
  resp_rate          numeric(5,2),
  unique (participant_id, date)
);

create table if not exists workouts (
  id           uuid primary key default gen_random_uuid(),
  participant_id  text references participants(id) on delete cascade,
  source_batch_id uuid references upload_batches(id) on delete set null,
  date         date not null,
  start_time   timestamptz not null,
  end_time     timestamptz,
  activity     text,
  duration_min int,
  strain       numeric(5,2),
  calories     int,
  max_hr       int,
  avg_hr       int,
  zone1_pct    int,
  zone2_pct    int,
  zone3_pct    int,
  zone4_pct    int,
  zone5_pct    int,
  -- start_time uniquely identifies a workout session per participant; date alone is not sufficient
  -- because multiple workouts may occur on the same day
  unique (participant_id, start_time)
);

create table if not exists habits (
  id               uuid primary key default gen_random_uuid(),
  participant_id      text references participants(id) on delete cascade,
  source_batch_id  uuid references upload_batches(id) on delete set null,
  date             date not null,
  alcohol          boolean,
  caffeine         boolean,
  ate_late         boolean,
  hydrated         boolean,
  protein          boolean,
  magnesium        boolean,
  theanine         boolean,
  creatine         boolean,
  ashwagandha      boolean,
  glp1             boolean,
  tracked_calories boolean,
  dimmed_lights    boolean,
  read_before_bed  boolean,
  sauna            boolean,
  hot_tub          boolean,
  massage          boolean,
  notes            text,
  unique (participant_id, date)
);

create table if not exists pulse_surveys (
  id                uuid primary key default gen_random_uuid(),
  participant_id       text references participants(id) on delete cascade,
  date              date not null,
  wellbeing_score   numeric(4,2),
  burnout_score     numeric(4,2),
  manager_support   numeric(4,2),
  energy_score      numeric(4,2),
  psych_safety      numeric(4,2),
  workload_score    numeric(4,2),
  work_life_balance numeric(4,2),
  recommend_score   numeric(4,2),
  unique (participant_id, date)
);

create table if not exists interventions (
  id                uuid primary key default gen_random_uuid(),
  participant_id       text references participants(id) on delete cascade,
  date_triggered    date,
  department        text,
  trigger_metric    text,
  trigger_value     text,
  intervention_type text,
  assigned_to       text,
  date_actioned     date,
  outcome           text default 'Pending',
  notes             text,
  created_at        timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'challenge_status') then
    create type challenge_status as enum ('draft', 'active', 'completed', 'cancelled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'challenge_metric_type') then
    create type challenge_metric_type as enum ('actions_count');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'challenge_eligibility_mode') then
    create type challenge_eligibility_mode as enum ('all_participants', 'filtered');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'challenge_completion_source') then
    create type challenge_completion_source as enum ('event', 'scheduled_recompute', 'manual_repair');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'challenge_audit_action') then
    create type challenge_audit_action as enum ('create', 'update', 'activate', 'cancel', 'complete', 'recompute', 'repair');
  end if;
end $$;

create table if not exists challenges (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(name) between 3 and 120),
  description           text check (description is null or length(description) <= 1000),
  status                challenge_status not null default 'draft',
  metric_type           challenge_metric_type not null default 'actions_count',
  threshold_value       int not null check (threshold_value > 0),
  window_start_at       timestamptz not null,
  window_end_at         timestamptz not null check (window_end_at > window_start_at),
  eligibility_mode      challenge_eligibility_mode not null default 'all_participants',
  eligibility_definition jsonb,
  activation_at         timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_by            uuid references auth.users(id) on delete set null,
  updated_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  version               int not null default 1 check (version > 0),
  check (
    eligibility_mode = 'all_participants'
    or eligibility_definition is not null
  )
);

create table if not exists challenge_participants (
  id                         uuid primary key default gen_random_uuid(),
  challenge_id               uuid not null references challenges(id) on delete cascade,
  participant_id                text not null references participants(id) on delete cascade,
  is_eligible                boolean not null default true,
  eligibility_reason         text,
  progress_value             int not null default 0 check (progress_value >= 0),
  progress_last_event_at     timestamptz,
  completed                  boolean not null default false,
  completed_at               timestamptz,
  completion_source          challenge_completion_source,
  completion_idempotency_key text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (challenge_id, participant_id),
  unique (completion_idempotency_key),
  check (
    (completed = true and completed_at is not null)
    or (completed = false and completed_at is null)
  )
);

create table if not exists challenge_audit_log (
  id          uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      challenge_audit_action not null,
  before      jsonb,
  after       jsonb,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Backfill/compatibility for environments that already created baseline tables.
alter table if exists daily_wellness add column if not exists source_batch_id uuid references upload_batches(id) on delete set null;
alter table if exists workouts add column if not exists source_batch_id uuid references upload_batches(id) on delete set null;
alter table if exists workouts add column if not exists start_time timestamptz;
alter table if exists workouts add column if not exists end_time timestamptz;
alter table if exists habits add column if not exists source_batch_id uuid references upload_batches(id) on delete set null;
alter table if exists import_logs add column if not exists batch_id uuid references upload_batches(id) on delete set null;
alter table if exists participants add column if not exists location_id text;
alter table if exists participants add column if not exists employment_type text;

with ranked_workouts as (
  select
    id,
    (
      date::timestamp
      + ((row_number() over (partition by participant_id, date order by id) - 1) * interval '1 minute')
    ) at time zone 'UTC' as inferred_start_time
  from workouts
  where start_time is null
)
update workouts
set start_time = ranked_workouts.inferred_start_time
from ranked_workouts
where workouts.id = ranked_workouts.id;

alter table if exists workouts alter column start_time set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'workouts'::regclass
      and conname = 'workouts_participant_id_date_key'
  ) then
    alter table workouts drop constraint workouts_participant_id_date_key;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'workouts'::regclass
      and conname = 'workouts_participant_id_start_time_key'
  ) then
    alter table workouts
      add constraint workouts_participant_id_start_time_key unique (participant_id, start_time);
  end if;
end $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_wellness_participant_date on daily_wellness(participant_id, date desc);
create index if not exists idx_wellness_batch_id    on daily_wellness(source_batch_id);
create index if not exists idx_workouts_participant_date on workouts(participant_id, date desc);
create index if not exists idx_workouts_batch_id    on workouts(source_batch_id);
create index if not exists idx_habits_participant_date on habits(participant_id, date desc);
create index if not exists idx_habits_batch_id      on habits(source_batch_id);
create index if not exists idx_pulse_participant_date on pulse_surveys(participant_id, date desc);
create index if not exists idx_interventions_participant on interventions(participant_id);
create index if not exists idx_interventions_status on interventions(outcome);
create index if not exists idx_upload_batches_status_started_at on upload_batches(status, started_at desc);
create index if not exists idx_upload_batches_file_hash on upload_batches(file_hash_sha256);
create index if not exists idx_challenges_status on challenges(status);
create index if not exists idx_challenges_window on challenges(window_start_at, window_end_at);
create index if not exists idx_challenge_participants_challenge_completed on challenge_participants(challenge_id, completed);
create unique index if not exists idx_challenges_single_active on challenges(status) where status = 'active';

-- ─── Import audit log ─────────────────────────────────────────────────────────

create table if not exists import_logs (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid references upload_batches(id) on delete set null,
  imported_by    uuid references auth.users(id) on delete set null,
  file_name      text not null,
  imported_at    timestamptz default now(),
  rows_processed int default 0,
  rows_inserted  int default 0,
  rows_updated   int default 0,
  rows_skipped   int default 0,
  rows_failed    int default 0,
  error_detail   jsonb
);

create table if not exists import_row_outcomes (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references upload_batches(id) on delete cascade,
  tab_name   text not null,
  row_number int not null,
  field_name text,
  outcome    text not null check (outcome in ('failed', 'skipped')),
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_row_outcomes_batch on import_row_outcomes(batch_id);
create index if not exists idx_import_row_outcomes_batch_tab on import_row_outcomes(batch_id, tab_name);
create index if not exists idx_user_access_role on user_access(role);

-- ─── Row Level Security (optional — enable for multi-tenant) ──────────────────
-- alter table participants enable row level security;
-- alter table daily_wellness enable row level security;
-- alter table workouts enable row level security;
-- alter table habits enable row level security;
-- alter table pulse_surveys enable row level security;
-- alter table interventions enable row level security;

-- ─── Useful views ─────────────────────────────────────────────────────────────

create or replace view team_latest_wellness as
select
  e.id,
  e.first_name,
  e.last_name,
  e.department,
  e.title,
  e.is_exact_data,
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
from participants e
left join lateral (
  select * from daily_wellness dw
  where dw.participant_id = e.id
  order by date desc
  limit 1
) w on true
where e.status = 'Active';
