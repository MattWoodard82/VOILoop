-- Create login_activity table for engagement tracking
create table public.login_activity (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null references public.participants(id) on delete cascade,
  logged_in_at timestamp with time zone not null default now(),
  logged_out_at timestamp with time zone,
  session_duration_seconds integer,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index idx_login_activity_participant_logged_in
  on public.login_activity(participant_id, logged_in_at desc);

create index idx_login_activity_date_range
  on public.login_activity(logged_in_at desc)
  where logged_in_at is not null;

-- Enable RLS
alter table public.login_activity enable row level security;

grant select on public.login_activity to authenticated;

-- RLS policy: participants can view their own login activity
create policy login_activity_select_own
  on public.login_activity
  for select
  using (
    participant_id in (
      select p.id from public.participants p
      where p.auth_user_id = auth.uid()
    )
    or public.current_app_role() in ('admin', 'wellness_director')
  );
