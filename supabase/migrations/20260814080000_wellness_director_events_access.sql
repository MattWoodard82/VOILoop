-- Allow leadership roles to manage events and nudges end-to-end.

drop policy if exists events_admin_mutate on public.events;
drop policy if exists events_leadership_mutate on public.events;
create policy events_leadership_mutate
on public.events
for all
using (public.current_app_role() in ('admin', 'wellness_director'))
with check (public.current_app_role() in ('admin', 'wellness_director'));

drop policy if exists weekly_nudges_admin_mutate on public.weekly_nudges;
drop policy if exists weekly_nudges_leadership_mutate on public.weekly_nudges;
create policy weekly_nudges_leadership_mutate
on public.weekly_nudges
for all
using (public.current_app_role() in ('admin', 'wellness_director'))
with check (public.current_app_role() in ('admin', 'wellness_director'));

drop policy if exists nudge_targets_admin_mutate on public.nudge_targets;
drop policy if exists nudge_targets_leadership_mutate on public.nudge_targets;
create policy nudge_targets_leadership_mutate
on public.nudge_targets
for all
using (public.current_app_role() in ('admin', 'wellness_director'))
with check (public.current_app_role() in ('admin', 'wellness_director'));

create or replace function public.upsert_nudge_with_target(
  p_week_of date,
  p_message text,
  p_author text,
  p_target_type text,
  p_target_label text,
  p_participant_id text
)
returns jsonb as $$
declare
  v_nudge_id uuid;
  v_role text;
  v_response_due_at timestamptz;
begin
  v_role := coalesce(public.current_app_role(), '');
  if v_role not in ('admin', 'wellness_director') then
    return json_build_object('error', 'Only leadership users may publish nudges')::jsonb;
  end if;

  if length(btrim(p_message)) = 0 then
    return json_build_object('error', 'Message cannot be empty')::jsonb;
  end if;
  if p_target_type not in ('all', 'subgroup', 'participant') then
    return json_build_object('error', 'Invalid target type')::jsonb;
  end if;

  v_response_due_at := now() + interval '48 hours';

  insert into public.weekly_nudges (week_of, message, author, response_due_at)
  values (p_week_of, p_message, p_author, v_response_due_at)
  returning id into v_nudge_id;

  insert into public.nudge_targets (nudge_id, target_type, target_label, participant_id)
  values (
    v_nudge_id,
    p_target_type,
    coalesce(p_target_label, ''),
    p_participant_id
  );

  return json_build_object('nudge_id', v_nudge_id)::jsonb;
exception when others then
  return json_build_object('error', SQLERRM)::jsonb;
end;
$$ language plpgsql security definer;
