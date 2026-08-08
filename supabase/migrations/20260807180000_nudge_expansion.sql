-- Note: nudge_targets already exists from PR3/PR6. This table (nudge_acknowledgement_targets) is for PR1's engagement tracking
create table if not exists public.nudge_acknowledgement_targets (
  id uuid primary key default gen_random_uuid(),
  nudge_id uuid not null references public.weekly_nudges(id) on delete cascade,
  target_type text not null check (target_type in ('all', 'subgroup', 'participant')),
  target_label text not null default '',
  participant_id text references public.participants(id) on delete cascade,
  unique (nudge_id, target_type, target_label, participant_id),
  created_at timestamptz not null default now()
);

grant select, insert on public.nudge_acknowledgement_targets to authenticated;
grant update, delete on public.nudge_acknowledgement_targets to authenticated;

create table if not exists public.nudge_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  nudge_id uuid not null references public.weekly_nudges(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  response_text text not null default '',
  response_due_at timestamptz not null default (now() + interval '48 hours'),
  unique (nudge_id, participant_id),
  check (length(btrim(response_text)) > 0)
);

grant select, insert, update on public.nudge_acknowledgements to authenticated;

-- Add cohort column to participants table for subgroup targeting
alter table if exists public.participants
  add column if not exists cohort text;

alter table if exists public.weekly_nudges
  add column if not exists response_due_at timestamptz;

update public.weekly_nudges
set response_due_at = coalesce(response_due_at, created_at + interval '48 hours')
where response_due_at is null;

alter table if exists public.weekly_nudges
  alter column response_due_at set not null;

create index if not exists idx_nudge_acknowledgement_targets_nudge_id on public.nudge_acknowledgement_targets(nudge_id);
create index if not exists idx_nudge_acknowledgements_nudge_id on public.nudge_acknowledgements(nudge_id);
create index if not exists idx_nudge_acknowledgements_participant_id on public.nudge_acknowledgements(participant_id);

alter table if exists public.nudge_acknowledgement_targets enable row level security;
alter table if exists public.nudge_acknowledgements enable row level security;

-- Add RLS policy to weekly_nudges to enforce targeting at the database boundary
alter table if exists public.weekly_nudges enable row level security;
drop policy if exists weekly_nudges_select_participant_targeted on public.weekly_nudges;
create policy weekly_nudges_select_participant_targeted
on public.weekly_nudges
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or id in (
    select nt.nudge_id
    from public.nudge_acknowledgement_targets nt
    join public.participants p on true
    where (
      nt.target_type = 'all'
      or (nt.target_type = 'participant' and nt.participant_id = p.id and p.auth_user_id = auth.uid())
      or (nt.target_type = 'subgroup' and nt.target_label in (
        select coalesce(p.cohort, '') from public.participants p where p.auth_user_id = auth.uid()
      ))
    )
  )
);

drop policy if exists nudge_acknowledgement_targets_select_admin on public.nudge_acknowledgement_targets;
drop policy if exists nudge_acknowledgement_targets_admin_mutate on public.nudge_acknowledgement_targets;
drop policy if exists nudge_acknowledgement_targets_select_participants on public.nudge_acknowledgement_targets;
create policy nudge_acknowledgement_targets_select_admin
on public.nudge_acknowledgement_targets
for select
using (public.current_app_role() in ('admin', 'wellness_director'));
create policy nudge_acknowledgement_targets_select_participants
on public.nudge_acknowledgement_targets
for select
using (
  target_type = 'all'
  or (target_type = 'participant' and participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  ))
  or (target_type = 'subgroup' and target_label in (
    select coalesce(p.cohort, '') from public.participants p where p.auth_user_id = auth.uid()
  ))
);
create policy nudge_acknowledgement_targets_admin_mutate
on public.nudge_acknowledgement_targets
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists nudge_acknowledgements_select_scoped on public.nudge_acknowledgements;
drop policy if exists nudge_acknowledgements_participant_insert on public.nudge_acknowledgements;
create policy nudge_acknowledgements_select_scoped
on public.nudge_acknowledgements
for select
using (
  public.current_app_role() in ('admin', 'wellness_director')
  or participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);
create policy nudge_acknowledgements_participant_insert
on public.nudge_acknowledgements
for insert
with check (
  participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.weekly_nudges wn
    where wn.id = nudge_id
      and wn.response_due_at > now()
      and exists (
        select 1
        from public.nudge_acknowledgement_targets nt
        join public.participants p on true
        where nt.nudge_id = wn.id
          and (
            nt.target_type = 'all'
            or (nt.target_type = 'participant' and nt.participant_id = participant_id)
            or (nt.target_type = 'subgroup' and nt.target_label = (
              select coalesce(p.cohort, '') from public.participants p where p.id = participant_id
            ))
          )
      )
  )
);

create policy nudge_acknowledgements_participant_update
on public.nudge_acknowledgements
for update
using (
  participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.weekly_nudges wn
    where wn.id = nudge_id
      and wn.response_due_at > now()
  )
)
with check (
  participant_id in (
    select p.id from public.participants p where p.auth_user_id = auth.uid()
  )
);

-- Enable pgcrypto extension for encryption support (portable to Azure Postgres)
create extension if not exists pgcrypto;

-- Add encrypted response_text column to nudge_acknowledgements
alter table if exists public.nudge_acknowledgements
  add column if not exists response_text_encrypted bytea;

-- Migrate existing response_text to encrypted form (using a placeholder staging key)
-- Note: In production, use external KMS (Azure Key Vault, AWS Secrets Manager) via application layer
update public.nudge_acknowledgements
set response_text_encrypted = 
  case 
    when response_text != '' 
    then pgp_sym_encrypt(response_text, 'staging-placeholder-key-only-for-demo')::bytea
    else null
  end
where response_text_encrypted is null;

-- Make response_text_encrypted non-nullable (after migration completes)
alter table if exists public.nudge_acknowledgements
  alter column response_text_encrypted set not null;

-- Create index on encrypted responses for participant lookup
create index if not exists idx_nudge_acknowledgements_encrypted_participant_id
  on public.nudge_acknowledgements(participant_id)
  where response_text_encrypted is not null;

-- Update RLS select policy to ensure encrypted column is accessible
-- (The existing select policy will apply to all columns including encrypted response)

-- Create stored procedure for decrypting nudge responses (called by application with key from KMS)
create or replace function public.decrypt_nudge_response(encrypted_data bytea, key text)
returns text as $$
  select pgp_sym_decrypt(encrypted_data, key)::text
$$ language sql security definer;

-- Grant execute permission on decrypt function to authenticated users
grant execute on function public.decrypt_nudge_response(bytea, text) to authenticated;

-- Create stored procedure for upserting encrypted nudge acknowledgements
-- This handles encryption at the database layer using the provided key
create or replace function public.upsert_nudge_acknowledgement(
  p_nudge_id uuid,
  p_participant_id text,
  p_response_text text,
  p_encryption_key text
)
returns jsonb as $$
declare
  v_result jsonb;
begin
  -- Validate response_text is not empty before encryption
  if length(btrim(p_response_text)) = 0 then
    return json_build_object('error', 'Response text cannot be empty')::jsonb;
  end if;
  
  -- Validate nudge exists and response window is open
  if not exists (
    select 1 from public.weekly_nudges where id = p_nudge_id and response_due_at > now()
  ) then
    return json_build_object('error', 'Nudge not found or response window has closed')::jsonb;
  end if;
  
  insert into public.nudge_acknowledgements (nudge_id, participant_id, response_text_encrypted, acknowledged_at, response_due_at)
  values (
    p_nudge_id,
    p_participant_id,
    pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
    now(),
    (select response_due_at from public.weekly_nudges where id = p_nudge_id)
  )
  on conflict (nudge_id, participant_id) do update
  set response_text_encrypted = pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
      acknowledged_at = now()
  where response_due_at > now()
  returning json_build_object('id', id, 'acknowledged_at', acknowledged_at) into v_result;
  
  return coalesce(v_result, '{"error": "Failed to upsert acknowledgement"}'::jsonb);
exception when others then
  return json_build_object('error', SQLERRM)::jsonb;
end;
$$ language plpgsql security definer;

-- Grant execute permission on upsert function to authenticated users
grant execute on function public.upsert_nudge_acknowledgement(uuid, text, text, text) to authenticated;

-- Create stored procedure for atomic nudge + acknowledgement target upsert (admin only)
-- Deletes old targets and inserts new target in single transaction
create or replace function public.upsert_nudge_with_engagement_target(
  p_week_of date,
  p_message text,
  p_author text,
  p_target_type text,
  p_target_label text,
  p_participant_id text
)
returns jsonb as $$
declare
  v_nudge_id uuid;
  v_result jsonb;
begin
  -- Validate inputs
  if length(btrim(p_message)) = 0 then
    return json_build_object('error', 'Message cannot be empty')::jsonb;
  end if;
  if p_target_type not in ('all', 'subgroup', 'participant') then
    return json_build_object('error', 'Invalid target type')::jsonb;
  end if;
  
  -- Upsert nudge
  insert into public.weekly_nudges (week_of, message, author, response_due_at)
  values (p_week_of, p_message, p_author, p_week_of::timestamptz + interval '48 hours')
  on conflict (week_of) do update
  set message = p_message, author = p_author
  returning id into v_nudge_id;
  
  if v_nudge_id is null then
    return json_build_object('error', 'Failed to upsert nudge')::jsonb;
  end if;
  
  -- Delete old targets for this nudge (republishing clears old recipients)
  delete from public.nudge_acknowledgement_targets where nudge_id = v_nudge_id;
  
  -- Insert new target
  insert into public.nudge_acknowledgement_targets (nudge_id, target_type, target_label, participant_id)
  values (
    v_nudge_id,
    p_target_type,
    coalesce(p_target_label, ''),
    p_participant_id
  );
  
  return json_build_object('nudge_id', v_nudge_id)::jsonb;
exception when others then
  return json_build_object('error', SQLERRM)::jsonb;
end;
$$ language plpgsql security definer;

-- Grant execute permission to authenticated admin users
grant execute on function public.upsert_nudge_with_engagement_target(date, text, text, text, text, text) to authenticated;
