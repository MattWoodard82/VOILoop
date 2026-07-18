-- Ensure Supabase Auth can scan confirmation_token values when listing users.
update auth.users
set confirmation_token = ''
where confirmation_token is null;

alter table auth.users
  alter column confirmation_token set default '',
  alter column confirmation_token set not null;
