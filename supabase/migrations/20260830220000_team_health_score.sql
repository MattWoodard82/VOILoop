-- Team Health Score / 5-Metric Breakdown (GH issue #119)
--
-- Two additive changes, neither of which touches existing engagement-score
-- (FR-13) behavior:
--   1. Capture the raw "Sleep onset" WHOOP timestamp we already receive in
--      every CSV export but never stored, needed for Matt's night-mapping
--      rule (onset >= 6am -> that night, onset < 6am -> previous night).
--   2. A small admin-configurable config row for the fixed baseline window
--      (defaults to Matt's original 2026-07-02..2026-07-27), following the
--      same shape/RLS pattern as the existing engagement-score weights.

alter table if exists daily_wellness
  add column if not exists sleep_onset_time timestamptz;

create table if not exists team_health_score_config (
  id             text primary key default 'current',
  baseline_start date not null default '2026-07-02',
  baseline_end   date not null default '2026-07-27',
  updated_at     timestamptz not null default now(),
  check (baseline_start <= baseline_end)
);

insert into team_health_score_config (id, baseline_start, baseline_end)
values ('current', '2026-07-02', '2026-07-27')
on conflict (id) do nothing;

alter table team_health_score_config enable row level security;

grant select, insert, update on team_health_score_config to authenticated;

-- Any signed-in role (participant, wellness_director, admin) can read the
-- baseline window so the WD dashboard can render it read-only.
create policy team_health_score_config_select_all
  on team_health_score_config
  for select
  using (true);

create policy team_health_score_config_update_admin
  on team_health_score_config
  for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy team_health_score_config_insert_admin
  on team_health_score_config
  for insert
  with check (public.current_app_role() = 'admin');
