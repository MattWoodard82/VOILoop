-- Migration: drop stale RLS policies that reference legacy employee terms.
-- RLS is not enabled on any public tables in this project (all enable row
-- level security statements are commented out in the schema). Policies that
-- still reference 'employee_id', 'employees', or 'all_employees' in their
-- expressions are therefore safe to drop outright rather than rewrite.

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '')        ilike '%employee%'
        or coalesce(with_check, '') ilike '%employee%'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;
