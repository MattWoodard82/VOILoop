-- Disposable seeded local database only; run as the local superuser
-- (supabase_admin). Both sessions roll back all changes.
begin;
create extension if not exists dblink with schema extensions;

do $$
declare
  profiles jsonb;
  today date := (now() at time zone 'UTC')::date;
  updated text;
begin
  select jsonb_agg(jsonb_build_object(
    'id', id, 'first_name', first_name, 'last_name', last_name, 'enrolled_date', enrolled_date
  ) order by id) into profiles
  from public.participants where id ~ '^EMP(00[1-9]|0[12][0-9]|030)$';
  perform extensions.dblink_connect('concurrent_import', format('dbname=%s user=%s', current_database(), current_user));
  perform extensions.dblink_exec('concurrent_import', 'begin');
  -- Like a WHOOP upsert, updating an existing row does not lock its participant.
  updated := extensions.dblink_exec('concurrent_import', $sql$
    update public.daily_wellness set recovery_score = 99
    where participant_id = 'EMP001'
      and date = (select max(date) from public.daily_wellness where participant_id = 'EMP001')
  $sql$);
  if updated <> 'UPDATE 1' then
    raise exception 'Seed EMP001 wearable history before running this test.';
  end if;
  perform set_config('lock_timeout', '250ms', true);
  begin
    perform public.refresh_demo_story(today, profiles,
      jsonb_build_array(jsonb_build_object('participant_id', 'EMP001', 'date', today, 'recovery_score', 77)),
      jsonb_build_array(jsonb_build_object('participant_id', 'EMP001', 'date', today, 'energy_level', 4)));
    raise exception 'Refresh did not serialize against the concurrent wearable write.';
  exception when lock_not_available then
    null;
  end;
  perform extensions.dblink_exec('concurrent_import', 'rollback');
  perform set_config('lock_timeout', '0', true);
  perform public.refresh_demo_story(today, profiles,
    jsonb_build_array(jsonb_build_object('participant_id', 'EMP001', 'date', today, 'recovery_score', 77)),
    jsonb_build_array(jsonb_build_object('participant_id', 'EMP001', 'date', today, 'energy_level', 4)));
  perform extensions.dblink_exec('concurrent_import', 'begin');
  perform extensions.dblink_exec('concurrent_import', 'set local lock_timeout = ''250ms''');
  begin
    perform extensions.dblink_exec('concurrent_import',
      'update public.daily_wellness set recovery_score = 99 where participant_id = ''EMP001''');
    raise exception 'Concurrent wearable write did not wait for the refresh transaction.';
  exception when lock_not_available then
    null;
  end;
  perform extensions.dblink_exec('concurrent_import', 'rollback');
  perform extensions.dblink_disconnect('concurrent_import');
exception when others then
  if 'concurrent_import' = any(extensions.dblink_get_connections()) then
    perform extensions.dblink_exec('concurrent_import', 'rollback');
    perform extensions.dblink_disconnect('concurrent_import');
  end if;
  raise;
end;
$$;
rollback;
