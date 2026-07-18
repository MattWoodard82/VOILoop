-- Ensure every auth user has a corresponding access row used by app login/authorization.
insert into public.user_access (user_id, role, must_change_password)
select u.id, 'employee', true
from auth.users u
where not exists (
  select 1
  from public.user_access ua
  where ua.user_id = u.id
);

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_access (user_id, role, must_change_password)
  values (new.id, 'employee', true)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_auth_user_created();
