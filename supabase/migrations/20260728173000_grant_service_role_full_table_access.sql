-- Local/admin automation paths (seed/bootstrap/import) use service_role.
-- service_role bypasses RLS because of the BYPASSRLS attribute on the Supabase role,
-- NOT because of these grants. These grants are still required so the role can
-- reach table data at the privilege layer before RLS is evaluated.
-- ALTER DEFAULT PRIVILEGES ensures new tables/sequences created after this migration
-- are also automatically covered.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
