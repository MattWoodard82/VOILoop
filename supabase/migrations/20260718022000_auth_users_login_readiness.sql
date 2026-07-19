-- Ensure every auth user has a corresponding access row used by app login/authorization.
insert into public.user_access (user_id, role, must_change_password)
select u.id, 'participant', true
from auth.users u
where not exists (
  select 1
  from public.user_access ua
  where ua.user_id = u.id
);
