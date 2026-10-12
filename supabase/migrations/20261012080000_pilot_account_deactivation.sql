alter table public.user_access
  add column if not exists is_active boolean not null default true;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- A non-null denied role also closes SECURITY DEFINER RPC checks using <>.
  select coalesce((
    select ua.role
    from public.user_access ua
    where ua.user_id = auth.uid()
      and ua.is_active
    limit 1
  ), '')
$$;

create or replace function public.current_app_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_access ua
    where ua.user_id = auth.uid()
      and ua.is_active
  )
$$;

revoke all on function public.current_app_user_is_active() from public, anon;
grant execute on function public.current_app_user_is_active() to authenticated, service_role;

do $$
declare
  table_name text;
  guarded_tables text[] := array[
    'participants',
    'daily_wellness',
    'workouts',
    'habits',
    'pulse_surveys',
    'interventions',
    'upload_batches',
    'import_logs',
    'import_row_outcomes',
    'challenges',
    'challenge_participants',
    'challenge_audit_log',
    'events',
    'weekly_nudges',
    'event_rsvps',
    'login_activity',
    'nudge_targets',
    'nudge_responses',
    'nudge_acknowledgements',
    'engagement_score_weights',
    'risk_flags',
    'leaderboard_metric_snapshots'
  ];
begin
  foreach table_name in array guarded_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format(
        'drop policy if exists active_user_required on public.%I',
        table_name
      );
      execute format(
        'create policy active_user_required on public.%I as restrictive for all to authenticated using (public.current_app_user_is_active()) with check (public.current_app_user_is_active())',
        table_name
      );
    end if;
  end loop;
end
$$;
