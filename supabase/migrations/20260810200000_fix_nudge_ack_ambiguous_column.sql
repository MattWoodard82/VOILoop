-- Fix ambiguous column reference "response_due_at" in upsert_nudge_acknowledgement.
-- The ON CONFLICT DO UPDATE WHERE clause must qualify the table name to avoid
-- ambiguity between the target row and the EXCLUDED pseudo-row.

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
  if length(btrim(p_response_text)) = 0 then
    return json_build_object('error', 'Response text cannot be empty')::jsonb;
  end if;

  -- TODO: review after 2026-09-01 — response window check removed with 48-hour feature
  -- if not exists (
  --   select 1 from public.weekly_nudges where id = p_nudge_id and response_due_at > now()
  -- ) then
  --   return json_build_object('error', 'Nudge not found or response window has closed')::jsonb;
  -- end if;
  if not exists (
    select 1 from public.weekly_nudges where id = p_nudge_id
  ) then
    return json_build_object('error', 'Nudge not found')::jsonb;
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
  -- TODO: review after 2026-09-01 — removed WHERE response_due_at > now() guard (48-hour window commented out)
  returning json_build_object('id', id, 'acknowledged_at', acknowledged_at) into v_result;

  return coalesce(v_result, '{"error": "Failed to upsert acknowledgement"}'::jsonb);
exception when others then
  return json_build_object('error', SQLERRM)::jsonb;
end;
$$ language plpgsql security definer;

grant execute on function public.upsert_nudge_acknowledgement(uuid, text, text, text) to authenticated;
