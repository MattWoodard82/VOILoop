create or replace function public.prepare_demo_data_refresh(p_backup_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_events integer;
  deleted_nudges integer;
  deleted_challenges integer;
  deleted_import_logs integer;
  deleted_upload_batches integer;
  deleted_participants integer;
begin
  if length(btrim(coalesce(p_backup_reference, ''))) < 3 then
    raise exception 'A verified manual-backup reference is required before demo refresh.';
  end if;

  delete from public.events;
  get diagnostics deleted_events = row_count;

  delete from public.weekly_nudges;
  get diagnostics deleted_nudges = row_count;

  delete from public.challenges;
  get diagnostics deleted_challenges = row_count;

  delete from public.import_logs;
  get diagnostics deleted_import_logs = row_count;

  delete from public.upload_batches;
  get diagnostics deleted_upload_batches = row_count;

  -- Nullable participant links can leave orphaned rows outside the cascades.
  delete from public.daily_wellness;
  delete from public.workouts;
  delete from public.habits;
  delete from public.pulse_surveys;
  delete from public.interventions;

  delete from public.participants;
  get diagnostics deleted_participants = row_count;

  return jsonb_build_object(
    'backup_reference', btrim(p_backup_reference),
    'deleted_events', deleted_events,
    'deleted_weekly_nudges', deleted_nudges,
    'deleted_challenges', deleted_challenges,
    'deleted_import_logs', deleted_import_logs,
    'deleted_upload_batches', deleted_upload_batches,
    'deleted_participants', deleted_participants
  );
end;
$$;

revoke all on function public.prepare_demo_data_refresh(text) from public, anon, authenticated;
grant execute on function public.prepare_demo_data_refresh(text) to service_role;
