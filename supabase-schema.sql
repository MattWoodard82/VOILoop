-- VOILoop Supabase Schema
-- Run this entire file in Supabase → SQL Editor → New query

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists employees (
  id            text primary key,
  auth_user_id  uuid unique,
  first_name    text not null,
  last_name     text not null,
  department    text,
  title         text,
  device_id     text,
  consent       boolean default true,
  enrolled_date date,
  status        text default 'Active',
  is_exact_data boolean default false,
  created_at    timestamptz default now()
);

create table if not exists user_roles (
  id         smallint primary key default 1 check (id = 1),
  role       text not null check (role in ('admin', 'staff', 'employee')) default 'staff',
  updated_at timestamptz default now()
);

insert into user_roles (id, role)
values (1, 'staff')
on conflict (id) do nothing;

create table if not exists daily_wellness (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        text references employees(id) on delete cascade,
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
  unique (employee_id, date)
);

create table if not exists workouts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text references employees(id) on delete cascade,
  date         date not null,
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
  unique (employee_id, date)
);

create table if not exists habits (
  id               uuid primary key default gen_random_uuid(),
  employee_id      text references employees(id) on delete cascade,
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
  unique (employee_id, date)
);

create table if not exists pulse_surveys (
  id                uuid primary key default gen_random_uuid(),
  employee_id       text references employees(id) on delete cascade,
  date              date not null,
  wellbeing_score   numeric(4,2),
  burnout_score     numeric(4,2),
  manager_support   numeric(4,2),
  energy_score      numeric(4,2),
  psych_safety      numeric(4,2),
  workload_score    numeric(4,2),
  work_life_balance numeric(4,2),
  recommend_score   numeric(4,2),
  unique (employee_id, date)
);

create table if not exists interventions (
  id                uuid primary key default gen_random_uuid(),
  employee_id       text references employees(id) on delete cascade,
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

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_wellness_emp_date    on daily_wellness(employee_id, date desc);
create index if not exists idx_workouts_emp_date    on workouts(employee_id, date desc);
create index if not exists idx_habits_emp_date      on habits(employee_id, date desc);
create index if not exists idx_pulse_emp_date       on pulse_surveys(employee_id, date desc);
create index if not exists idx_interventions_emp    on interventions(employee_id);
create index if not exists idx_interventions_status on interventions(outcome);

-- ─── Row Level Security (optional — enable for multi-tenant) ──────────────────
-- alter table employees enable row level security;
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
from employees e
left join lateral (
  select * from daily_wellness dw
  where dw.employee_id = e.id
  order by date desc
  limit 1
) w on true
where e.status = 'Active';
