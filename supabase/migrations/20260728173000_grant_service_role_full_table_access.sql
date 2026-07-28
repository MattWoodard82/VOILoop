-- Local/admin automation paths (seed/bootstrap/import) use service_role.
-- Grant full table + sequence privileges so service_role can bypass RLS by policy.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
