-- Create engagement_score_weights table for configurable scoring
create table public.engagement_score_weights (
  id uuid primary key default gen_random_uuid(),
  organization_id text,
  weight_name text not null,
  weight_value numeric(5, 2) not null check (weight_value >= 0 and weight_value <= 100),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by text,
  unique nulls not distinct (organization_id, weight_name)
);

create index idx_engagement_score_weights_org
  on public.engagement_score_weights(organization_id);

-- Insert default weights for engagement score calculation
-- These can be overridden per organization
insert into public.engagement_score_weights (organization_id, weight_name, weight_value, created_by) values
  (null, 'login_frequency_weight', 25.0, 'system'),
  (null, 'pulse_survey_completion_weight', 20.0, 'system'),
  (null, 'data_submission_weight', 25.0, 'system'),
  (null, 'intervention_follow_up_weight', 15.0, 'system'),
  (null, 'trend_consistency_weight', 15.0, 'system')
on conflict (organization_id, weight_name) do nothing;

-- Enable RLS
alter table public.engagement_score_weights enable row level security;

grant select, insert, update on public.engagement_score_weights to authenticated;

-- RLS policies
create policy engagement_score_weights_select_all
  on public.engagement_score_weights
  for select
  using (true);

create policy engagement_score_weights_update_admin
  on public.engagement_score_weights
  for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy engagement_score_weights_insert_admin
  on public.engagement_score_weights
  for insert
  with check (public.current_app_role() = 'admin');
