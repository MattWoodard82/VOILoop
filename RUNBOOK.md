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
6. Do **not** run `npm run db:seed` against pilot/prod. Seed data is local-development only.

### RLS-sensitive release checklist (required for PHI tables)

Use this checklist whenever a PR changes Supabase schema, policies, auth checks, or any browser/API data path.

1. Confirm new/modified public tables have **RLS enabled**.
2. Confirm explicit policies exist for intended roles (`participant`, `wellness_director`, `admin`).
3. Confirm privileged writes are server-mediated (API route/server action) unless policy is intentionally allowing browser writes.
4. Verify participant users cannot read or write another participant's data via direct API calls.
5. Verify leadership/admin dashboards still load with expected access.
6. Include rollback notes (which migration to revert with PITR if needed).

## Critical configuration requirements

### Supabase schema deploy configuration

- GitHub Environment: `demo-prod`
- Secret name: `SUPABASE_DB_URL`
- Variable name: `PILOT_ADMIN_EMAIL`
- Secret name: `PILOT_ADMIN_PASSWORD`
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

## Encryption & Key Management (Issue #66)

### Overview
Participant nudge responses and related health data are encrypted at rest using AES-256-GCM (application-layer encryption via `src/lib/crypto.ts`).

### Key Configuration

#### Local Development
1. Copy `.env.example` to `.env.local`
2. Set `NUDGE_RESPONSE_ENCRYPTION_KEY` to a test value (e.g., `local-dev-key-not-production`)
3. Set `NUDGE_RESPONSE_KMS_KEY_ID=local-dev`
4. Encrypted data round-trips correctly during local testing

#### Pilot Environment (Vercel)
1. Set Vercel environment variable `NUDGE_RESPONSE_ENCRYPTION_KEY` to pilot key
2. Set `NUDGE_RESPONSE_KMS_KEY_ID=pilot`
3. Database migrations apply automatically via GitHub Actions
4. New nudge responses are encrypted on write; decrypted on read

#### Production (Future)
- Pilot currently uses inline key; no external KMS required
- For future hardening: external KMS (Azure Key Vault, AWS Secrets Manager) can be integrated by updating `src/lib/crypto.ts` and providing `NUDGE_RESPONSE_WRAPPED_KEY` 
- Schema and code remain unchanged; only environment variables change

### Data Model
- Table: `public.nudge_acknowledgements`
- Encrypted column: `response_text_encrypted` (bytea)
- Migration: PR1 creates table + column; backfill uses pgcrypto with staging key
- New API calls use `encryptNudgeResponseText()` / `decryptNudgeResponseText()` from crypto lib

### Monitoring
- Log decrypt failures (crypto.ts returns error if key mismatch)
- Monitor API response times for encrypt/decrypt operations (should be <10ms per operation)
- No plaintext responses should appear in Supabase logs or API responses

### Rollback
- If decryption fails: check that `NUDGE_RESPONSE_ENCRYPTION_KEY` matches what was used to encrypt
- Old encrypted data remains valid if key is accessible
- Staging key (`staging-placeholder-key-rotate-before-prod`) used in migration; new data uses pilot key

## Change management rule (required)

If a commit changes how the platform is operated (deploy steps, secrets, migrations, monitoring, rollback, access, or reliability), the same PR must update this `RUNBOOK.md`.

Do not merge operational changes without updating this runbook.
