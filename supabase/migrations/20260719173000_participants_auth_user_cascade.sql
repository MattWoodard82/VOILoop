-- Ensure participant records are linked to auth users with cascade delete semantics.
-- This guarantees auth user deletion removes participant-linked wellness data.
update public.participants p
set auth_user_id = null
where p.auth_user_id is not null
  and not exists (
    select 1
    from auth.users u
    where u.id = p.auth_user_id
  );

alter table public.participants
  drop constraint if exists participants_auth_user_id_fkey;

alter table public.participants
  add constraint participants_auth_user_id_fkey
  foreign key (auth_user_id)
  references auth.users(id)
  on delete cascade;
