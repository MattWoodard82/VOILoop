-- Create risk_flags table for risk state management and overrides
create table public.risk_flags (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null references public.participants(id) on delete cascade,
  flag_type text not null,
  is_active boolean not null default true,
  severity text check (severity in ('low', 'medium', 'high')),
  override_state text check (override_state in ('dismissed', 'snoozed', null)),
  override_reason text,
  override_expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index idx_risk_flags_participant_active
  on public.risk_flags(participant_id, is_active, flag_type);

create index idx_risk_flags_expires
  on public.risk_flags(override_expires_at)
  where override_state in ('dismissed', 'snoozed');

-- Enable RLS
alter table public.risk_flags enable row level security;

grant select on public.risk_flags to authenticated;

-- RLS policies
create policy risk_flags_select_own
  on public.risk_flags
  for select
  using (
    participant_id in (
      select p.id from public.participants p
      where p.auth_user_id = auth.uid()
    )
    or public.current_app_role() in ('admin', 'wellness_director')
  );
