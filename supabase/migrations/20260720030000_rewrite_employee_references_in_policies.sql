-- Migration: rewrite lingering policy references from employees/employee_id
-- Some environments still have policy expressions compiled against the legacy
-- employees table, which causes runtime errors after the rename.

-- Ensure policy helper exists before recreating policies. Some environments
-- depend on get_participant_id() in RLS expressions but may be missing it.
do $$
begin
  if to_regprocedure('public.get_participant_id()') is null then
    execute $function$
      create function public.get_participant_id()
      returns text
      language sql
      stable
      as $$
        select p.id
        from public.participants p
        where p.auth_user_id = auth.uid()
        order by p.created_at asc
        limit 1
      $$;
    $function$;
  end if;
end $$;

do $$
declare
  policy_record record;
  role_name text;
  role_clause text;
  command_clause text;
  using_clause text;
  with_check_clause text;
  create_policy_sql text;
begin
  for policy_record in
    select
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%employee%'
        or coalesce(with_check, '') ilike '%employee%'
      )
  loop
    role_clause := '';
    foreach role_name in array policy_record.roles loop
      if role_clause <> '' then
        role_clause := role_clause || ', ';
      end if;
      role_clause := role_clause || quote_ident(role_name);
    end loop;

    if role_clause = '' then
      role_clause := 'public';
    end if;

    command_clause :=
      case policy_record.cmd
        when '*' then 'ALL'
        else upper(policy_record.cmd)
      end;

    using_clause := replace(
      replace(
        replace(
          coalesce(policy_record.qual, ''),
          'all_employees',
          'all_participants'
        ),
        'employee_id',
        'participant_id'
      ),
      'employees',
      'participants'
    );

    with_check_clause := replace(
      replace(
        replace(
          coalesce(policy_record.with_check, ''),
          'all_employees',
          'all_participants'
        ),
        'employee_id',
        'participant_id'
      ),
      'employees',
      'participants'
    );

    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );

    create_policy_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename,
      lower(policy_record.permissive),
      command_clause,
      role_clause
    );

    if using_clause <> '' then
      create_policy_sql := create_policy_sql || ' using (' || using_clause || ')';
    end if;

    if with_check_clause <> '' then
      create_policy_sql := create_policy_sql || ' with check (' || with_check_clause || ')';
    end if;

    execute create_policy_sql;
  end loop;
end $$;
