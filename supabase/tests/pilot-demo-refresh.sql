-- Run with psql -v ON_ERROR_STOP=1 against a disposable migrated database only.
begin;

insert into auth.users (id, email) values
  ('dc000000-0000-4000-8000-000000000001', 'inactive-demo-check@example.invalid'),
  ('dc000000-0000-4000-8000-000000000002', 'active-demo-check@example.invalid');
insert into public.user_access (user_id, role, is_active) values
  ('dc000000-0000-4000-8000-000000000001', 'participant', false),
  ('dc000000-0000-4000-8000-000000000002', 'participant', true);
insert into public.participants (id, auth_user_id, first_name, last_name) values
  ('DEMO_REFRESH_CHECK_INACTIVE', 'dc000000-0000-4000-8000-000000000001', 'Demo', 'Inactive'),
  ('DEMO_REFRESH_CHECK_ACTIVE', 'dc000000-0000-4000-8000-000000000002', 'Demo', 'Active');
insert into public.daily_wellness (participant_id, date, recovery_score) values
  ('DEMO_REFRESH_CHECK_INACTIVE', current_date, 40),
  ('DEMO_REFRESH_CHECK_ACTIVE', current_date, 80),
  (null, current_date, 55);
insert into public.workouts (participant_id, date, start_time) values (null, current_date, now());
insert into public.habits (participant_id, date) values (null, current_date);
insert into public.pulse_surveys (participant_id, date) values (null, current_date);
insert into public.interventions (participant_id, outcome) values (null, 'Pending');

select set_config('request.jwt.claim.sub', 'dc000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
begin
  if public.current_app_user_is_active() or public.current_app_role() is distinct from '' then
    raise exception 'Inactive account still has an active role';
  end if;
  if exists (select 1 from public.daily_wellness) then
    raise exception 'Inactive session can still read wellness rows';
  end if;
  if not exists (select 1 from public.user_access where user_id = auth.uid() and not is_active) then
    raise exception 'Application cannot read the inactive flag';
  end if;
  if public.upsert_nudge_acknowledgement(
    'dc000000-0000-4000-8000-000000000099', 'DEMO_REFRESH_CHECK_INACTIVE', 'test', 'test-key'
  )->>'error' is distinct from 'Only participants may submit nudge responses' then
    raise exception 'Inactive session can enter the SECURITY DEFINER nudge RPC';
  end if;
  if has_function_privilege(current_user, 'public.prepare_demo_data_refresh(text)', 'EXECUTE') then
    raise exception 'Authenticated role can execute destructive refresh';
  end if;
end
$$;
reset role;

select set_config('request.jwt.claim.sub', 'dc000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
begin
  if public.current_app_role() is distinct from 'participant' then
    raise exception 'Active participant role is broken';
  end if;
  if (select count(*) from public.daily_wellness) <> 1 then
    raise exception 'Active participant ownership scope is broken';
  end if;
end
$$;
reset role;

do $$
declare
  configuration_before jsonb;
  result jsonb;
begin
  select jsonb_agg(to_jsonb(w)) into configuration_before from public.engagement_score_weights w;
  begin
    perform public.prepare_demo_data_refresh('');
    raise exception 'Blank backup reference was accepted';
  exception when raise_exception then
    if sqlerrm <> 'A verified manual-backup reference is required before demo refresh.' then
      raise;
    end if;
  end;
  if not exists (select 1 from public.participants where id = 'DEMO_REFRESH_CHECK_ACTIVE') then
    raise exception 'Rejected refresh changed pilot data';
  end if;
  result := public.prepare_demo_data_refresh('disposable-test-backup');
  if result->>'backup_reference' <> 'disposable-test-backup' then
    raise exception 'Backup reference missing from result';
  end if;
  if exists (select 1 from public.participants)
    or exists (select 1 from public.daily_wellness)
    or exists (select 1 from public.workouts)
    or exists (select 1 from public.habits)
    or exists (select 1 from public.pulse_surveys)
    or exists (select 1 from public.interventions) then
    raise exception 'Refresh left participant or orphaned health data';
  end if;
  if configuration_before is distinct from (
    select jsonb_agg(to_jsonb(w)) from public.engagement_score_weights w
  ) then
    raise exception 'Refresh changed scoring configuration';
  end if;
  if (select count(*) from auth.users where id in (
    'dc000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000002'
  )) <> 2 then
    raise exception 'SQL cleanup changed Auth accounts';
  end if;
  perform public.prepare_demo_data_refresh('disposable-test-backup');
end
$$;

rollback;
