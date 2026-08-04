alter table if exists public.upload_batches
  add column if not exists participant_id text references public.participants(id) on delete set null;

create index if not exists idx_upload_batches_participant_started_at
  on public.upload_batches(participant_id, started_at desc);

with batch_participants as (
  select source_batch_id as batch_id, participant_id
  from public.daily_wellness
  where source_batch_id is not null

  union all

  select source_batch_id as batch_id, participant_id
  from public.workouts
  where source_batch_id is not null

  union all

  select source_batch_id as batch_id, participant_id
  from public.habits
  where source_batch_id is not null
),
attributable_batches as (
  select
    batch_id,
    min(participant_id) as participant_id
  from batch_participants
  where participant_id is not null
  group by batch_id
  having count(distinct participant_id) = 1
)
update public.upload_batches as ub
set participant_id = ab.participant_id
from attributable_batches as ab
where ub.id = ab.batch_id
  and ub.participant_id is null;

drop policy if exists upload_batches_select_scoped on public.upload_batches;

create policy upload_batches_select_scoped
on public.upload_batches
for select
using (
  participant_id in (
    select p.id
    from public.participants p
    where p.auth_user_id = auth.uid()
  )
  or imported_by = auth.uid()
  or public.current_app_role() in ('admin', 'wellness_director')
);
