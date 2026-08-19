alter table if exists public.interventions
  add column if not exists wd_notes text,
  add column if not exists date_resolved date;
