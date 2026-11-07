-- Run only in a disposable local database after migrations and db:seed.
-- All fixtures and refresh effects are rolled back.
begin;

do $$
declare
  profiles jsonb;
  recovery jsonb;
  pulse jsonb;
  result jsonb;
  today date := (now() at time zone 'UTC')::date;
  original_sleep numeric;
  original_pulse_count integer;
  original_score integer;
  original_profiles jsonb;
  batch_id uuid;
begin
  select jsonb_agg(jsonb_build_object(
    'id', id, 'first_name', first_name, 'last_name', last_name, 'enrolled_date', enrolled_date
  ) order by id) into profiles from public.participants where id ~ '^EMP(00[1-9]|0[12][0-9]|030)$';
  if jsonb_array_length(profiles) is distinct from 30 then
    raise exception 'Seed the complete synthetic demo cohort before running this local test.';
  end if;
  select jsonb_agg(to_jsonb(p) order by p.id) into original_profiles from public.participants p;
  insert into public.participants (id, first_name, last_name, enrolled_date)
  values ('DEMO-REFRESH-OUTSIDE', 'Retained', 'Outside cohort', today - 300);
  insert into public.daily_wellness (participant_id, date, recovery_score, sleep_hrs)
  values ('DEMO-REFRESH-OUTSIDE', today, 65, 8);
  insert into public.pulse_surveys (participant_id, date, energy_level)
  values ('DEMO-REFRESH-OUTSIDE', today, 3);
  recovery := jsonb_build_array(jsonb_build_object('participant_id', 'EMP001', 'date', today, 'recovery_score', 77));
  pulse := jsonb_build_array(jsonb_build_object(
    'participant_id', 'EMP001', 'date', today, 'energy_level', 4,
    'rest_quality', 4, 'stress_level', 2, 'mental_wellbeing', 4,
    'confident_health', true, 'body_trending_good', true, 'physical_activity', jsonb_build_array('outside'),
    'program_supported', 'yes', 'whoop_reviewed', 'yes_regularly', 'health_flag', null
  ));
  insert into public.daily_wellness (participant_id, date, recovery_score, sleep_hrs)
  values ('EMP001', today, 50, 7.25)
  on conflict (participant_id, date) do update set sleep_hrs = 7.25, recovery_score = 50;
  select sleep_hrs into original_sleep from public.daily_wellness where participant_id = 'EMP001' and date = today;

  result := public.refresh_demo_story(today, profiles, recovery, pulse);
  if result->>'anchor' <> today::text or (result->>'recovery_count')::integer <> 1
    or (result->>'pulse_count')::integer <> 1 then
    raise exception 'Incorrect committed refresh result.';
  end if;
  if (select sleep_hrs from public.daily_wellness where participant_id = 'EMP001' and date = today) <> original_sleep
    or (select recovery_score from public.daily_wellness where participant_id = 'EMP001' and date = today) <> 77 then
    raise exception 'Refresh failed to preserve unrelated wellness fields.';
  end if;
  if (select count(*) from public.participants where id ~ '^EMP(00[1-9]|0[12][0-9]|030)$') <> 30 then
    raise exception 'Refresh changed participant accounts.';
  end if;
  if (select jsonb_agg(to_jsonb(p) order by p.id) from public.participants p where id <> 'DEMO-REFRESH-OUTSIDE') <> original_profiles
    or (select recovery_score from public.daily_wellness where participant_id = 'DEMO-REFRESH-OUTSIDE' and date = today) <> 65
    or (select energy_level from public.pulse_surveys where participant_id = 'DEMO-REFRESH-OUTSIDE' and date = today) <> 3 then
    raise exception 'Refresh modified accounts or data outside the demo cohort.';
  end if;
  result := public.refresh_demo_story(today, profiles, recovery, pulse);
  if (select count(*) from public.pulse_surveys where participant_id = 'EMP001' and date = today) <> 1 then
    raise exception 'Repeated refresh created duplicate responses.';
  end if;

  select count(*) into original_pulse_count from public.pulse_surveys;
  select recovery_score into original_score from public.daily_wellness where participant_id = 'EMP001' and date = today;
  begin
    perform public.refresh_demo_story(today, profiles,
      jsonb_build_array(jsonb_build_object('participant_id', 'EMP001', 'date', today, 'recovery_score', 88)),
      jsonb_set(pulse, '{0,energy_level}', '9'::jsonb));
    raise exception 'Invalid pulse unexpectedly succeeded.';
  exception when check_violation then null;
  end;
  if (select count(*) from public.pulse_surveys) <> original_pulse_count
    or (select recovery_score from public.daily_wellness where participant_id = 'EMP001' and date = today) <> original_score then
    raise exception 'Failed pulse insertion did not roll back recovery and pulse writes.';
  end if;

  begin
    perform public.refresh_demo_story(today, jsonb_set(profiles, '{0,first_name}', '"Real identity"'), recovery, pulse);
    raise exception 'Mismatched identity unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm not like 'Demo cohort changed%' then raise; end if;
  end;
  begin
    perform public.refresh_demo_story(today - 1, profiles, recovery, pulse);
    raise exception 'Old anchor unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm not like 'Demo refresh must be anchored%' then raise; end if;
  end;
  begin
    perform public.refresh_demo_story(today, profiles, recovery, pulse || pulse);
    raise exception 'Duplicate weekly response unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm not like 'Only one synthetic pulse%' then raise; end if;
  end;
  insert into public.upload_batches (file_name, file_hash_sha256)
  values ('local-regression.csv', repeat('0', 64)) returning id into batch_id;
  update public.daily_wellness set source_batch_id = batch_id
  where participant_id = 'EMP001' and date = today;
  begin
    perform public.refresh_demo_story(today, profiles, recovery, pulse);
    raise exception 'Imported wearable data was overwritten.';
  exception when raise_exception then
    if sqlerrm not like 'Imported wearable data exists%' then raise; end if;
  end;
  if has_function_privilege('authenticated', 'public.refresh_demo_story(date,jsonb,jsonb,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.refresh_demo_story(date,jsonb,jsonb,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.refresh_demo_story(date,jsonb,jsonb,jsonb)', 'execute') then
    raise exception 'Unsafe demo refresh RPC grants.';
  end if;
end;
$$;

rollback;
