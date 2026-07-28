-- Ensure table privileges are granted for roles that rely on RLS policies.
-- Without these grants, PostgREST requests fail before policy evaluation.

grant usage on schema public to authenticated, service_role;

grant select on public.participants to authenticated, service_role;
grant select on public.daily_wellness to authenticated, service_role;
grant select on public.workouts to authenticated, service_role;
grant select on public.habits to authenticated, service_role;

grant select, insert on public.pulse_surveys to authenticated, service_role;

grant select, update on public.interventions to authenticated, service_role;

grant select on public.upload_batches to authenticated, service_role;
grant select on public.import_logs to authenticated, service_role;
grant select on public.import_row_outcomes to authenticated, service_role;

grant select on public.challenges to authenticated, service_role;
grant select on public.challenge_participants to authenticated, service_role;
grant select on public.challenge_audit_log to authenticated, service_role;

grant select on public.events to authenticated, service_role;
grant select on public.weekly_nudges to authenticated, service_role;
grant select, insert, delete on public.event_rsvps to authenticated, service_role;

grant insert, update, delete on public.events to authenticated, service_role;
grant insert, update, delete on public.weekly_nudges to authenticated, service_role;

grant insert, update, delete on public.upload_batches to service_role;
grant insert, update, delete on public.import_logs to service_role;
grant insert, update, delete on public.import_row_outcomes to service_role;
grant insert, update, delete on public.challenges to service_role;
grant insert, update, delete on public.challenge_participants to service_role;
grant insert, update, delete on public.challenge_audit_log to service_role;
