-- Replace old 1-10 numeric pulse columns with new health-focused weekly questions.

alter table if exists public.pulse_surveys
  drop column if exists wellbeing_score,
  drop column if exists burnout_score,
  drop column if exists manager_support,
  drop column if exists energy_score,
  drop column if exists psych_safety,
  drop column if exists workload_score,
  drop column if exists work_life_balance,
  drop column if exists recommend_score;

alter table if exists public.pulse_surveys
  add column if not exists confident_health   boolean,
  add column if not exists body_trending_good boolean,
  add column if not exists energy_level       smallint check (energy_level between 1 and 5),
  add column if not exists rest_quality       smallint check (rest_quality between 1 and 5),
  add column if not exists stress_level       smallint check (stress_level between 1 and 5),
  add column if not exists physical_activity  text[],
  add column if not exists mental_wellbeing   smallint check (mental_wellbeing between 1 and 5),
  add column if not exists program_supported  text check (program_supported in ('yes', 'neutral', 'no')),
  add column if not exists whoop_reviewed     text check (whoop_reviewed in ('yes_regularly', 'yes_once', 'no')),
  add column if not exists health_flag        text;
