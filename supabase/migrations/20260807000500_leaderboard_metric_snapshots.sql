-- Create leaderboard_metric_snapshots for weekly aggregated stats
create table public.leaderboard_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null references public.participants(id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  engagement_score integer check (engagement_score >= 0 and engagement_score <= 100),
  recovery_score_avg numeric(5, 2),
  hrv_avg numeric(8, 2),
  sleep_perf_avg numeric(5, 2),
  strain_avg numeric(5, 2),
  login_count integer default 0,
  pulse_survey_count integer default 0,
  workout_count integer default 0,
  data_completeness_pct numeric(5, 2),
  rank_in_department integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique(participant_id, week_start_date)
);

create index idx_leaderboard_participant_week
  on public.leaderboard_metric_snapshots(participant_id, week_start_date desc);

create index idx_leaderboard_week_engagement
  on public.leaderboard_metric_snapshots(week_start_date, engagement_score desc);

create index idx_leaderboard_week_recovery
  on public.leaderboard_metric_snapshots(week_start_date, recovery_score_avg desc);

-- Enable RLS
alter table public.leaderboard_metric_snapshots enable row level security;

-- RLS policies: allow viewing leaderboards with privacy filters
create policy leaderboard_select_own
  on public.leaderboard_metric_snapshots
  for select
  using (
    participant_id in (
      select p.id from public.participants p
      where p.auth_user_id = auth.uid()
    )
    or public.current_app_role() in ('admin', 'wellness_director')
  );

create policy leaderboard_insert_service
  on public.leaderboard_metric_snapshots
  for insert
  with check (true);

create policy leaderboard_update_service
  on public.leaderboard_metric_snapshots
  for update
  using (true)
  with check (true);
