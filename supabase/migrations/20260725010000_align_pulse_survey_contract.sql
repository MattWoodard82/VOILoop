-- Align pulse_surveys to canonical application contract.
-- This migration is idempotent and safely handles environments that picked up
-- temporary drift columns from earlier survey payload experiments.

alter table if exists public.pulse_surveys
  add column if not exists psych_safety numeric(4,2),
  add column if not exists recommend_score numeric(4,2);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pulse_surveys'
      and column_name = 'psychological_safety'
  ) then
    update public.pulse_surveys
    set psych_safety = coalesce(psych_safety, psychological_safety)
    where psychological_safety is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pulse_surveys'
      and column_name = 'self_image_score'
  ) then
    update public.pulse_surveys
    set recommend_score = coalesce(recommend_score, self_image_score)
    where self_image_score is not null;
  end if;
end $$;

alter table if exists public.pulse_surveys
  drop column if exists stress_score,
  drop column if exists sleep_satisfaction,
  drop column if exists psychological_safety,
  drop column if exists self_image_score;
