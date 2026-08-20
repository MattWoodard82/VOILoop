alter table if exists public.interventions
  add column if not exists wd_notes text,
  add column if not exists date_resolved date;

-- Backfill date_resolved for rows already marked Resolved so they remain
-- visible in the recently-resolved query that filters on this column.
-- Uses date_actioned as the best available proxy for the resolution date;
-- falls back to date_triggered if date_actioned is also null.
update public.interventions
  set date_resolved = coalesce(date_actioned::date, date_triggered::date, current_date)
  where outcome = 'Resolved'
    and date_resolved is null;