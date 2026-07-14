# VOILoop Operations Runbook (Founder-Friendly)

This is the plain-language guide for running VOILoop day to day.

## What this system is

VOILoop is a web app hosted on Vercel, with data stored in Supabase.

- **App hosting:** Vercel
- **Code + automation:** GitHub + GitHub Actions
- **Database:** Supabase (Postgres)

## Where to check health first

1. **Site availability:** open the production URL and confirm key pages load.
2. **Recent deploy status:** Vercel dashboard -> latest Production deploy.
3. **Automation status:** GitHub Actions -> latest CI and schema deploy runs.
4. **Database status:** Supabase dashboard -> project is healthy and responsive.

## Normal release process

### App-only release (no database change)

1. Merge approved PR into `main`.
2. Confirm Vercel deploys from `main`.
3. Open production and verify core pages render.

### App + database release

1. Add a new file in `supabase/migrations/` for the schema change.
2. Merge approved PR.
3. Run GitHub Action **Deploy Supabase Schema** with:
   - `environment=demo-prod`
   - `confirm=APPLY`
4. Confirm workflow success.
5. Verify production pages that rely on changed data.

## Critical configuration requirements

### Supabase schema deploy configuration

- GitHub Environment: `demo-prod`
- Secret name: `SUPABASE_DB_URL`
- Secret name: `SUPABASE_SERVICE_ROLE_KEY`
- Variable name: `PILOT_ADMIN_EMAIL`
- Secret name: `PILOT_ADMIN_PASSWORD`
- Variable or secret: `NEXT_PUBLIC_SUPABASE_URL`
- Must be a **Session Pooler** URL (`*.pooler.supabase.com`, session mode, port `5432`)
- Must include SSL (`sslmode=require`)

Do **not** use direct `db.<project-ref>.supabase.co` for GitHub-hosted runner deploys.

## If something fails

### CI or PR checks fail

1. Open the failed workflow run in GitHub Actions.
2. Read the first failed step log.
3. Fix in branch, push, and wait for checks to go green.

### Schema deploy fails

1. Confirm `SUPABASE_DB_URL` still points to Session Pooler.
2. Confirm `PILOT_ADMIN_EMAIL` and `PILOT_ADMIN_PASSWORD` are configured for the deploy environment.
3. Re-run the deploy workflow once (it re-syncs admin email/password every run).
4. If it fails again, review the SQL or admin credential sync error line in logs and patch logic safely.

### Production app issue

1. Roll back app by promoting the previous stable Vercel deployment.
2. For data issues, use Supabase backup/PITR restore process.
3. Log the incident and add prevention notes to this runbook.

## Change management rule (required)

If a commit changes how the platform is operated (deploy steps, secrets, migrations, monitoring, rollback, access, or reliability), the same PR must update this `RUNBOOK.md`.

Do not merge operational changes without updating this runbook.
