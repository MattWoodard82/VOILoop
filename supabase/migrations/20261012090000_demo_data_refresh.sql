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

  delete from public.events where id is not null;
  get diagnostics deleted_events = row_count;

  delete from public.weekly_nudges where id is not null;
  get diagnostics deleted_nudges = row_count;

  delete from public.challenges where id is not null;
  get diagnostics deleted_challenges = row_count;

  delete from public.import_logs where id is not null;
  get diagnostics deleted_import_logs = row_count;

  delete from public.upload_batches where id is not null;
  get diagnostics deleted_upload_batches = row_count;

  -- Nullable participant links can leave orphaned rows outside the cascades.
  delete from public.daily_wellness where id is not null;
  delete from public.workouts where id is not null;
  delete from public.habits where id is not null;
  delete from public.pulse_surveys where id is not null;
  delete from public.interventions where id is not null;

  delete from public.participants where id is not null;
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
