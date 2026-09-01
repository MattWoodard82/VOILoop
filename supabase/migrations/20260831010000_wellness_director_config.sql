-- Wellness Director dashboard: FR-13 engagement-score weight config (GH #66).
--
-- This table has been read/written by src/app/api/admin/wellness-director-config
-- and src/lib/supabase/queries.ts (getEngagementWeights) since that feature shipped,
-- but never had a migration in this repo -- it only existed because it was created
-- ad hoc against whatever environment the feature was first tested in. A genuinely
-- fresh database (a new local `supabase start`, or a new staging/prod environment)
-- has no such table, so GET/PUT /api/admin/wellness-director-config 500s and the WD
-- dashboard's "Engagement-score weights" card can never load. This migration creates
-- it properly, seeded with the same defaults normalizeEngagementWeights() falls back
-- to, following the same shape/RLS pattern as team_health_score_config.

create table if not exists wellness_director_config (
  id         text primary key default 'current',
  weights    jsonb not null default '{
    "submission_consistency": 25,
    "device_wear_consistency": 20,
    "pulse_completion": 20,
    "nudge_response": 15,
    "workout_volume": 20
  }'::jsonb,
  updated_at timestamptz not null default now()
);

insert into wellness_director_config (id, weights)
values ('current', '{
  "submission_consistency": 25,
  "device_wear_consistency": 20,
  "pulse_completion": 20,
  "nudge_response": 15,
  "workout_volume": 20
}'::jsonb)
on conflict (id) do nothing;

alter table wellness_director_config enable row level security;

grant select, insert, update on wellness_director_config to authenticated;

-- Wellness Directors need to read the weights to render their (read-only) dashboard
-- card; admins can also read. Any signed-in role may select, matching
-- team_health_score_config_select_all's pattern.
create policy wellness_director_config_select_all
  on wellness_director_config
  for select
  using (true);

create policy wellness_director_config_update_admin
  on wellness_director_config
  for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy wellness_director_config_insert_admin
  on wellness_director_config
  for insert
  with check (public.current_app_role() = 'admin');

create or replace function public.touch_wellness_director_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_wellness_director_config_updated_at on public.wellness_director_config;

create trigger set_wellness_director_config_updated_at
before update on public.wellness_director_config
for each row
execute function public.touch_wellness_director_config_updated_at();
