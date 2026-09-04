-- Seed-only helper for creating nudge acknowledgements/responses without going
-- through the participant-facing upsert_nudge_acknowledgement RPC (which
-- requires an authenticated participant session and an open response window).
-- This lets local/staging seed scripts populate realistic response volume
-- (e.g. to validate the reporting UI's most-recent-50 cap) using the service
-- role key. Execute is restricted to service_role only — it must never be
-- reachable by anon/authenticated clients.

create or replace function public.seed_nudge_acknowledgement(
  p_nudge_id uuid,
  p_participant_id text,
  p_response_text text,
  p_encryption_key text,
  p_acknowledged_at timestamptz default now()
)
returns jsonb as $$
declare
  v_result jsonb;
begin
  insert into public.nudge_acknowledgements (
    nudge_id, participant_id, response_text, response_text_encrypted, acknowledged_at, response_due_at
  )
  values (
    p_nudge_id,
    p_participant_id,
    '',
    pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
    p_acknowledged_at,
    (select response_due_at from public.weekly_nudges where id = p_nudge_id)
  )
  on conflict (nudge_id, participant_id) do update
  set response_text = '',
      response_text_encrypted = pgp_sym_encrypt(p_response_text, p_encryption_key)::bytea,
      acknowledged_at = p_acknowledged_at
  returning json_build_object('id', id, 'acknowledged_at', acknowledged_at) into v_result;

  return coalesce(v_result, '{"error": "Failed to seed acknowledgement"}'::jsonb);
exception when others then
  return json_build_object('error', SQLERRM)::jsonb;
end;
$$ language plpgsql security definer;

revoke all on function public.seed_nudge_acknowledgement(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.seed_nudge_acknowledgement(uuid, text, text, text, timestamptz) to service_role;
