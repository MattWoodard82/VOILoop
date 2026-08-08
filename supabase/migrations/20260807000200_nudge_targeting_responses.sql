-- Create nudge_targets table for engagement targeting
create table public.nudge_targets (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null references public.participants(id) on delete cascade,
  nudge_type text not null,
  target_context jsonb,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '30 days'),
  updated_at timestamp with time zone not null default now()
);

-- Create nudge_responses table for tracking engagement responses
create table public.nudge_responses (
  id uuid primary key default gen_random_uuid(),
  nudge_target_id uuid not null references public.nudge_targets(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  response_type text not null,
  responded_at timestamp with time zone not null default now(),
  response_context jsonb,
  created_at timestamp with time zone not null default now()
);

create unique index idx_nudge_targets_id_participant
  on public.nudge_targets(id, participant_id);

alter table public.nudge_responses
  add constraint nudge_responses_target_participant_fk
  foreign key (nudge_target_id, participant_id)
  references public.nudge_targets(id, participant_id)
  on delete cascade;

create index idx_nudge_targets_participant_expires
  on public.nudge_targets(participant_id, expires_at desc);

create index idx_nudge_targets_type
  on public.nudge_targets(nudge_type);

create index idx_nudge_responses_participant_responded
  on public.nudge_responses(participant_id, responded_at desc);

create index idx_nudge_responses_target_id
  on public.nudge_responses(nudge_target_id);

-- Enable RLS
alter table public.nudge_targets enable row level security;
alter table public.nudge_responses enable row level security;

grant select on public.nudge_targets to authenticated;
grant select on public.nudge_responses to authenticated;

-- RLS policies for nudge_targets
create policy nudge_targets_select_own
  on public.nudge_targets
  for select
  using (
    participant_id in (
      select p.id from public.participants p
      where p.auth_user_id = auth.uid()
    )
    or public.current_app_role() in ('admin', 'wellness_director')
  );

-- RLS policies for nudge_responses
create policy nudge_responses_select_own
  on public.nudge_responses
  for select
  using (
    participant_id in (
      select p.id from public.participants p
      where p.auth_user_id = auth.uid()
    )
    or public.current_app_role() in ('admin', 'wellness_director')
  );
