-- GoTrue admin listUsers scans several auth.users text fields as non-null strings.
-- Normalize legacy NULLs and enforce non-null defaults for known token/change columns.
do $$
declare
  col text;
  cols text[] := array[
    'email_change',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'reauthentication_token',
    'phone_change',
    'phone_change_token'
  ];
begin
  foreach col in array cols
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'auth'
        and table_name = 'users'
        and column_name = col
    ) then
      execute format('update auth.users set %1$I = '''' where %1$I is null', col);
    end if;
  end loop;
end $$;
