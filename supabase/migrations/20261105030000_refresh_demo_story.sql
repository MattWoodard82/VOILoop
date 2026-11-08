create or replace function public.refresh_demo_story(
  p_anchor date, p_profiles jsonb, p_recovery jsonb, p_pulse jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched integer;
  start_date date := p_anchor - 160;
  recovery_count integer;
  pulse_count integer;
begin
  if p_anchor is null or p_anchor <> (now() at time zone 'UTC')::date then
    raise exception 'Demo refresh must be anchored to today (UTC).';
  end if;
  if not pg_try_advisory_xact_lock(hashtext('public.refresh_demo_story')) then
    raise exception 'A demo refresh is already in progress. Try again after it completes.';
  end if;
  if jsonb_typeof(p_profiles) is distinct from 'array'
    or jsonb_typeof(p_recovery) is distinct from 'array'
    or jsonb_typeof(p_pulse) is distinct from 'array' then
    raise exception 'Demo refresh requires profile, recovery, and pulse arrays.';
  end if;
  if jsonb_array_length(p_profiles) <> 30
    or jsonb_array_length(p_recovery) not between 1 and 4830
    or jsonb_array_length(p_pulse) not between 1 and 720 then
    raise exception 'Unexpected demo refresh payload size.';
  end if;
  if (select count(distinct id) from jsonb_to_recordset(p_profiles) as x(id text)) <> 30
    or exists (
      select 1 from jsonb_to_recordset(p_profiles) as x(id text)
      where id is null or id !~ '^EMP(00[1-9]|0[12][0-9]|030)$'
    ) then
    raise exception 'Unexpected synthetic participant IDs.';
  end if;

  -- Imports update existing rows without locking their participant. Lock wellness
  -- first so provenance cannot change between the check and recovery writes.
  lock table public.daily_wellness in share row exclusive mode;
  perform p.id from public.participants p
  join jsonb_to_recordset(p_profiles) as x(id text) on x.id = p.id
  order by p.id for update of p;
  select count(*) into matched from public.participants p
  join jsonb_to_recordset(p_profiles) as x(id text, first_name text, last_name text, enrolled_date date)
    on x.id = p.id and x.first_name = p.first_name and x.last_name = p.last_name
    and x.enrolled_date is not distinct from p.enrolled_date
  where p.is_exact_data = false and p.status = 'Active';
  if matched <> 30 then
    raise exception 'Demo cohort changed or does not match the synthetic seed. Refresh was not applied.';
  end if;
  if exists (
    select 1 from public.daily_wellness w
    join jsonb_to_recordset(p_profiles) as x(id text) on x.id = w.participant_id
    where w.date >= start_date and w.source_batch_id is not null
  ) then
    raise exception 'Imported wearable data exists in the demo cohort. Refusing to overwrite it.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_recovery) as x(participant_id text, date date, recovery_score integer)
    left join public.participants p on p.id = x.participant_id
    where x.participant_id is null or x.participant_id not in (select value->>'id' from jsonb_array_elements(p_profiles))
      or x.date is null or x.date not between start_date and p_anchor
      or x.date < p.enrolled_date or x.recovery_score is null or x.recovery_score not between 1 and 100
      or x.participant_id in ('EMP015', 'EMP030')
  ) or exists (
    select 1 from jsonb_to_recordset(p_pulse) as x(participant_id text, date date)
    left join public.participants p on p.id = x.participant_id
    where x.participant_id is null or x.participant_id not in (select value->>'id' from jsonb_array_elements(p_profiles))
      or x.date is null or x.date not between start_date and p_anchor or x.date < p.enrolled_date
      or x.participant_id in ('EMP017', 'EMP024')
  ) then
    raise exception 'Demo rows are outside the permitted cohort, enrollment, or date window.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_pulse) as x(participant_id text, date date)
    group by participant_id, date_trunc('week', date::timestamp) having count(*) > 1
  ) then
    raise exception 'Only one synthetic pulse response per participant per week is allowed.';
  end if;

  -- Reset only recovery within the refreshed window; other wellness fields survive.
  update public.daily_wellness set recovery_score = null
  where participant_id in (select value->>'id' from jsonb_array_elements(p_profiles))
    and date between start_date and p_anchor;
  insert into public.daily_wellness (participant_id, date, recovery_score)
  select participant_id, date, recovery_score from jsonb_to_recordset(p_recovery)
    as x(participant_id text, date date, recovery_score integer)
  on conflict (participant_id, date) do update set recovery_score = excluded.recovery_score;
  get diagnostics recovery_count = row_count;

  delete from public.pulse_surveys
  where participant_id in (select value->>'id' from jsonb_array_elements(p_profiles));
  insert into public.pulse_surveys (
    participant_id, date, confident_health, body_trending_good, energy_level,
    rest_quality, stress_level, physical_activity, mental_wellbeing,
    program_supported, whoop_reviewed, health_flag
  )
  select participant_id, date, confident_health, body_trending_good, energy_level,
    rest_quality, stress_level, physical_activity, mental_wellbeing,
    program_supported, whoop_reviewed, health_flag
  from jsonb_to_recordset(p_pulse) as x(
    participant_id text, date date, confident_health boolean, body_trending_good boolean,
    energy_level smallint, rest_quality smallint, stress_level smallint,
    physical_activity text[], mental_wellbeing smallint, program_supported text,
    whoop_reviewed text, health_flag text
  );
  get diagnostics pulse_count = row_count;
  return jsonb_build_object('anchor', p_anchor, 'pulse_count', pulse_count, 'recovery_count', recovery_count);
end;
$$;

revoke all on function public.refresh_demo_story(date, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.refresh_demo_story(date, jsonb, jsonb, jsonb) to service_role;
