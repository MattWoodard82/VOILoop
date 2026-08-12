-- Preserve nudge history and harden nudge RPC access.

alter table public.weekly_nudges
  drop constraint if exists weekly_nudges_week_of_key;

create index if not exists idx_weekly_nudges_week_of_created_at
  on public.weekly_nudges(week_of desc, created_at desc);

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
begin
  if public.current_app_role() <> 'admin' then
    return json_build_object('error', 'Only admins may publish nudges')::jsonb;
  end if;

  if length(btrim(p_message)) = 0 then
    return json_build_object('error', 'Message cannot be empty')::jsonb;
  end if;
  if p_target_type not in ('all', 'subgroup', 'participant') then
    return json_build_object('error', 'Invalid target type')::jsonb;
  end if;

  insert into public.weekly_nudges (week_of, message, author, response_due_at)
  values (p_week_of, p_message, p_author, p_week_of::timestamptz + interval '48 hours')
  returning id into v_nudge_id;

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
  if public.current_app_role() <> 'participant' then
    return json_build_object('error', 'Only participants may submit nudge responses')::jsonb;
  end if;

  if not exists (
    select 1
    from public.participants
    where id = p_participant_id
      and auth_user_id = auth.uid()
  ) then
    return json_build_object('error', 'Participant mismatch')::jsonb;
  end if;

  if length(btrim(p_response_text)) = 0 then
    return json_build_object('error', 'Response text cannot be empty')::jsonb;
  end if;

  if not exists (
    select 1 from public.weekly_nudges where id = p_nudge_id and response_due_at > now()
  ) then
    return json_build_object('error', 'Nudge not found or response window has closed')::jsonb;
  end if;

  insert into public.nudge_acknowledgements (nudge_id, participant_id, response_text, response_text_encrypted, acknowledged_at, response_due_at)
  values (
    p_nudge_id,
    p_participant_id,
    p_response_text,
    pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
    now(),
    (select response_due_at from public.weekly_nudges where id = p_nudge_id)
  )
  on conflict (nudge_id, participant_id) do update
  set response_text = p_response_text,
      response_text_encrypted = pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
      acknowledged_at = now()
  where nudge_acknowledgements.response_due_at > now()
  returning json_build_object('id', id, 'acknowledged_at', acknowledged_at) into v_result;

  return coalesce(v_result, '{"error": "Failed to upsert acknowledgement"}'::jsonb);
exception when others then
  return json_build_object('error', SQLERRM)::jsonb;
end;
$$ language plpgsql security definer;
