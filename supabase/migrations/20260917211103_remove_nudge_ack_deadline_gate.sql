-- Keep participant-target authorization for nudge acknowledgements while
-- removing the old response_due_at write gate. The participant API now allows
-- replies to the newest targeted nudge even after its historical deadline.

create or replace function public.upsert_nudge_acknowledgement(
  p_nudge_id uuid,
  p_participant_id text,
  p_response_text text,
  p_encryption_key text
)
returns jsonb as $$
declare
  v_result jsonb;
  v_response_due_at timestamptz;
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

  select wn.response_due_at
  into v_response_due_at
  from public.weekly_nudges wn
  where wn.id = p_nudge_id;

  if v_response_due_at is null then
    return json_build_object('error', 'Nudge not found')::jsonb;
  end if;

  if not exists (
    select 1
    from public.nudge_targets nt
    join public.participants p on p.id = p_participant_id
    where nt.nudge_id = p_nudge_id
      and (
        nt.target_type = 'all'
        or (nt.target_type = 'participant' and nt.participant_id = p_participant_id)
        or (nt.target_type = 'subgroup' and nt.target_label = coalesce(p.cohort, ''))
      )
  ) then
    return json_build_object('error', 'Nudge not targeted to this participant')::jsonb;
  end if;

  insert into public.nudge_acknowledgements (nudge_id, participant_id, response_text, response_text_encrypted, acknowledged_at, response_due_at)
  values (
    p_nudge_id,
    p_participant_id,
    '',
    pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
    now(),
    v_response_due_at
  )
  on conflict (nudge_id, participant_id) do update
  set response_text = '',
      response_text_encrypted = pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
      acknowledged_at = now()
  returning json_build_object('id', id, 'acknowledged_at', acknowledged_at) into v_result;

  return coalesce(v_result, '{"error": "Failed to upsert acknowledgement"}'::jsonb);
exception when others then
  return json_build_object('error', SQLERRM)::jsonb;
end;
$$ language plpgsql security definer;

grant execute on function public.upsert_nudge_acknowledgement(uuid, text, text, text) to authenticated;
