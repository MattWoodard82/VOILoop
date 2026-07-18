-- Ensure Supabase Auth can scan confirmation_token values when listing users.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'confirmation_token'
  ) then
    update auth.users
    set confirmation_token = ''
    where confirmation_token is null;
  end if;
end $$;
