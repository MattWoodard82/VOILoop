create extension if not exists pgcrypto;

create table if not exists public.nudge_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  nudge_id uuid not null references public.weekly_nudges(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  response_text text not null default '',
  response_due_at timestamptz not null default (now() + interval '48 hours'),
  unique (nudge_id, participant_id)
);

create index if not exists idx_nudge_acknowledgements_nudge_id
  on public.nudge_acknowledgements(nudge_id);

create index if not exists idx_nudge_acknowledgements_participant_id
  on public.nudge_acknowledgements(participant_id);

alter table if exists public.nudge_acknowledgements
  add column if not exists response_text_encrypted bytea;

update public.nudge_acknowledgements
set response_text_encrypted = pgp_sym_encrypt(
  response_text,
  'staging-placeholder-key-rotate-before-prod'
)
where response_text_encrypted is null;

alter table public.nudge_acknowledgements
  alter column response_text_encrypted set not null;

alter table if exists public.nudge_acknowledgements enable row level security;

drop policy if exists nudge_acknowledgements_select_scoped on public.nudge_acknowledgements;
drop policy if exists nudge_acknowledgements_participant_insert on public.nudge_acknowledgements;

create policy nudge_acknowledgements_select_scoped
  on public.nudge_acknowledgements
  for select
  using (
    public.current_app_role() = 'admin'
    or participant_id in (
      select p.id from public.participants p
      where p.auth_user_id = auth.uid()
    )
  );

create policy nudge_acknowledgements_participant_insert
  on public.nudge_acknowledgements
  for insert
  with check (
    participant_id in (
      select p.id from public.participants p
      where p.auth_user_id = auth.uid()
    )
  );
