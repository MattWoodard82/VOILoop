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

### Rewards rollout launch order

1. Merge the rewards/rules PR to production.
2. Seed or confirm the rewards rows and rule text in Supabase.
3. Verify the participant PTO request flow and the admin approval flow.

### App + database release

1. Add a new file in `supabase/migrations/` for the schema change.
2. Merge approved PR.
3. Run GitHub Action **Deploy Supabase Schema** with:
   - `environment=demo-prod`
   - `confirm=APPLY`
4. Confirm workflow success.
5. Verify production pages that rely on changed data.
6. Do **not** run `npm run db:seed` against pilot/prod except for the explicitly
   guarded pilot-to-demo cutover below. Seed data is local-development-only
   otherwise.

### Pilot account deactivation before demo cutover

The first pilot-to-demo step deactivates every current Supabase Auth account
except for the required protected accounts `test1@user.com`, `admin@voiloop.com`,
`hr@voiloop.com`, `matt@voiloop.com`, and `mattwoodard82@gmail.com`, while
retaining account and participant records. This protected list is always applied
by default; optional `--preserve-email` / `--preserve-emails` arguments and the
comma-separated `PILOT_PRESERVE_EMAILS` environment variable add accounts to it
and cannot remove any required protected account. The script
also marks linked participant rows inactive and sets `user_access.is_active`
false. The application rejects inactive accounts at login and for existing
sessions; RLS also blocks their browser access to protected public tables.

Before using the script:

1. Apply migration `20261012080000_pilot_account_deactivation.sql` to the pilot
   project, then deploy the matching application changes before deactivation.
   Both are required to deny existing sessions on browser and server/API paths.
2. On a trusted machine, configure `.env.local` with the pilot URL, anonymous
   key, and server-only service role key. Set `PILOT_SUPABASE_PROJECT_REF` to
   the exact project ref and `VOILOOP_ENV=pilot`. Never expose or commit the
   service role key.
3. Run the disposable-account verification. It creates and removes a temporary
   Auth user, checks whether an Auth ban blocks new password sign-in, checks an
   existing access token, and tests password rotation if the ban test fails:

   ```powershell
   $env:PILOT_SUPABASE_PROJECT_REF = 'exact-pilot-project-ref'
   npm run admin:deactivate-pilot-accounts -- --verify-ban --confirm-project-ref $env:PILOT_SUPABASE_PROJECT_REF
   ```

4. Preview the exact accounts to be changed. Keep the output private because
   it contains account email addresses:

   ```powershell
   npm run admin:deactivate-pilot-accounts -- --confirm-project-ref $env:PILOT_SUPABASE_PROJECT_REF
   ```

5. If verification confirms that Auth bans block new sign-ins, apply the ban
   method. If the ban test fails but password rotation is verified, use the
   password-rotation fallback instead:

   ```powershell
   npm run admin:deactivate-pilot-accounts -- --apply --method ban --confirm-project-ref $env:PILOT_SUPABASE_PROJECT_REF
   # Only when the ban test fails and the password-rotation probe succeeds:
   npm run admin:deactivate-pilot-accounts -- --apply --method password-rotation --confirm-project-ref $env:PILOT_SUPABASE_PROJECT_REF
   ```

The apply command repeats the disposable verification, requires an exact
project-ref confirmation, and defaults to no changes unless `--apply` is
provided. Password-rotation passwords are unique random values and are neither
printed nor stored. The required protected accounts are `test1@user.com`,
`admin@voiloop.com`, `hr@voiloop.com`, `matt@voiloop.com`, and
`mattwoodard82@gmail.com`. Additional accounts may be preserved additively with
`--preserve-email` / `--preserve-emails` or `PILOT_PRESERVE_EMAILS`; no other
`testN@user.com` account is implicitly exempted. This operation does not delete
pilot data. Use the existing manual backup process and verify its result before
the later destructive data refresh. The repository's `admin:delete-accounts`
command is destructive and must not be used for this deactivation step.

### Pilot-to-demo data refresh

This cutover reuses the existing pilot Supabase project. It first deactivates
pilot accounts, then clears pilot rows and replaces them with a 30-person
synthetic demo cohort. The seed scenarios include improving, steady, declining,
and red-flag trends; incomplete and stale wearable history; no-device users;
new enrollees; and varied pulse/intervention states.

Do not start until the existing manual backup has completed and its contents
have been verified. The backup reference passed to the command is an operator acknowledgement;
the script cannot validate the backup itself or store a durable audit record.
Privately record the backup location, recovery point, verification result,
cutover approver, and command output. Confirm the manual backup covers public
data and Auth accounts needed for recovery before authorizing account deletion.

1. Apply migrations `20261012080000_pilot_account_deactivation.sql` and
   `20261012090000_demo_data_refresh.sql` to the exact pilot project. Before
   using **Deploy Supabase Schema**, verify its `demo-prod` environment
   `SUPABASE_DB_URL` points to this pilot project, not another environment.
2. Configure `.env.local` with that project's URL and server-only service role
   key, `PILOT_ADMIN_EMAIL`, and `DEMO_SUPABASE_PROJECT_REF` set to the exact
   project ref. The Auth deletion step always preserves the five required accounts
   listed above, plus `PILOT_ADMIN_EMAIL`; additional accounts can be preserved
   with `--preserve-email` / `--preserve-emails` or the additive
   `PILOT_PRESERVE_EMAILS` environment variable. For the refresh command, set
   `VOILOOP_ENV=demo`; this selects the guarded demo operation and does not
   change which Supabase project is targeted. The deactivation step separately
   requires `VOILOOP_ENV=pilot`.
3. Preview the deletion. Review every Auth email and table count in the private
   output, and stop if anything is unexpected:

   ```powershell
   $env:DEMO_SUPABASE_PROJECT_REF = 'exact-pilot-project-ref'
   $env:VOILOOP_ENV = 'demo'
   npm run admin:refresh-demo-data -- --confirm-project-ref $env:DEMO_SUPABASE_PROJECT_REF
   ```

4. After confirming the backup and preview, run the guarded refresh. Use the
   actual backup reference from the manual process:

   ```powershell
   $env:VERIFIED_BACKUP_REFERENCE = 'backup-id-from-manual-process'
   npm run admin:refresh-demo-data -- --apply --confirm-project-ref $env:DEMO_SUPABASE_PROJECT_REF --confirm-demo-refresh DELETE_PILOT_DATA --backup-reference $env:VERIFIED_BACKUP_REFERENCE
   ```

   The SQL cleanup is transactional, but subsequent Auth-user deletion is
   separate; if it stops partway, review the error and rerun the dry-run before
   continuing. The command preserves `test1@user.com` and the configured admin,
   deletes other Auth accounts, and keeps schema/configuration.
5. Restore/provision the demo admin and seed the refreshed cohort. Remote
   seeding requires the explicit opt-in below; use it only after verifying the
   project ref again:

   ```powershell
   npm run admin:bootstrap
   $env:VOILOOP_ENV = 'demo'
   $env:VOILOOP_ALLOW_NON_LOCAL_SEED = 'true'
   $env:DEMO_SEED_DATE = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
   npm run db:seed
   npm run db:seed:team-health-score
   npm run db:seed:nudge-responses -- 30
   ```

   `test1@user.com` remains the protected participant login (`Password!`).
   The first ten seeded profiles use their listed synthetic
   `@voiloop.local` emails; the 20 additional edge-case profiles use
   `<participant-id>@voiloop.local`. All use `Pilot1234`. Keep credentials and
   refresh output private. Do not run `admin:delete-accounts` during this
   procedure.

   Configure `PILOT_ADMIN_PASSWORD` explicitly for the hosted admin and
   `NUDGE_RESPONSE_ENCRYPTION_KEY` to match the app before running these commands.
   Remote demo seeds require a URL matching `DEMO_SUPABASE_PROJECT_REF` and do
   not overwrite existing scoring configuration. Keep the same
   `DEMO_SEED_DATE` when rerunning a seed to preserve enrollment ages and gaps;
   use a full guarded refresh when changing the date to renew demo freshness.
   The default date when unset is the current UTC day.

6. Verify two retained logins: the configured admin opens the leadership
   dashboard, and `test1@user.com` opens its participant dashboard. An old pilot
   login and a previously authenticated pilot session must both be denied.
   Confirm 30 active synthetic profiles, 7 interventions (including a resolved
   record with a resolution date), 3 upcoming events, and 30 nudge replies.
   Check `EMP014` for declining/red-flag history, `EMP015`/`EMP030` for no
   wearable history, `EMP016` for an 8-day history, `EMP018` for a 21-day stale
   history, and `EMP019` for intermittent coverage. Confirm the wellness,
   pulse, intervention, and outcomes pages show these expected states and no
   pilot identities remain.

### Cutover recovery and local SQL verification

Deactivation can be reversed deliberately by removing the Auth ban
(`ban_duration=none`), restoring the affected access flags and participant
statuses, and resetting passwords when the password-rotation fallback was used.
Automatic admin login repair does not reactivate an inactive account.
`admin:bootstrap` intentionally restores the configured admin only.

Data refresh is irreversible without the verified manual backup/PITR recovery
procedure. If cleanup or Auth deletion fails, stop before seeding; preserve
private output and use the recovery owner and recovery point recorded above.
An app rollback alone neither restores deleted data nor reverses Auth changes.
Do not disable the active-account RLS gate to work around a deployment problem.

On a disposable migrated Postgres/Supabase database, run
`supabase\tests\pilot-demo-refresh.sql` with `psql -v ON_ERROR_STOP=1`.
It exercises inactive-session RLS, the privileged nudge path, backup refusal,
orphan cleanup, configuration/Auth preservation, and repeat cleanup. Its
fixtures and destructive test operations run in a rolled-back transaction;
never point this verification at the hosted pilot.

### Application-layer encryption for participant text

Use application-layer encryption for any participant-authored free text stored in Supabase.

1. Encrypt/decrypt in server code only; browser clients must never receive raw encryption keys.
2. Store ciphertext in `bytea` columns and keep plaintext columns only for temporary staged backfills or controlled cutovers.
3. Use an external KMS pattern so the app can swap providers without schema changes:
   - Store a KMS key identifier in app config (`NUDGE_RESPONSE_KMS_KEY_ID`).
   - Resolve or unwrap the data-encryption key in server code.
   - Encrypt with AES-256-GCM in the application layer before writing to Supabase.
   - Decrypt in server code after reading from Supabase.
4. For Azure portability, the decryption provider should be an adapter around Azure Key Vault or another external KMS, not a database-managed secret store.
5. Rotate staged placeholder keys before production cutover and document the rotation in the release notes.

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

### WHOOP workout counts change after a historical re-upload

The Sept 25, 2026 timezone correction changed workout timestamps from local
wall-clock values stored as UTC to actual UTC instants. Workouts are keyed by
participant and start timestamp, not a WHOOP workout ID; historical re-uploads
can therefore leave both representations in the database. Baseline dates are
fixed, but baseline values are recalculated from stored data, not locked.

New inserts reject rows whose legacy wall-clock key is already present, with
an actionable row error. Existing canonical keys still update normally; an
update does not repair any older duplicate. This is intentionally conservative: even a genuinely
different workout at that time requires review rather than risking another
copy. Other valid rows still import and the summary reports partial/failed
status. Duplicate keys within one upload are collapsed (last row wins) and
counted as skipped.
Each discarded source row has a persisted skipped outcome. Collision lookups
finish before workout writes begin, so this upload's earlier chunks cannot
create false legacy collisions for its later chunks.

1. Pause nudges that rely on suspect workout counts or baseline comparisons.
2. On a trusted machine, configure `.env.local` for the intended Supabase
   project using its server-only service role key. Never paste credentials or
   raw health records into tickets.
3. Find the participant ID in the admin participant record and run
   `npm run admin:audit-workout-duplicates -- <participant ID>`.
   This command only reads data, paginates workout history, and reports suspect
   row IDs, batch IDs, timestamp offsets, and associated batch timestamps.
   Keep the output private. Compare batch timestamps to the Sept 25-Oct 1
   interval to investigate re-uploads; this is not proof of a backfill.
4. Compare each candidate pair with the original CSVs and the WHOOP app.
   The audit requires matching metrics and equally shifted start/end times;
   it can miss copies whose metrics changed, missing-end-time rows, or other
   import defects. A clean report does not certify the data.
5. Before any repair SQL, verify the live schema through
   `information_schema.columns` / `information_schema.tables`. Back up the
   exact affected rows, obtain approval for the specific IDs, and reconcile
   them transactionally, preserving canonical UTC timestamps and provenance.
   Do not delete by metric similarity alone. This release performs no repair.
6. Re-run the audit and re-upload the source files. Verify workout counts,
   Zone 2 minutes, baseline values, and recent-week counts before resuming
   nudges. Audit both partial and exact count increases: equally shifted
   start/end timestamps can indicate duplicates even when totals do not double.

No schema deployment is needed. Rollback is an application rollback; it does
not restore prior baseline values or remove existing duplicates. Baseline
locking/versioning is deliberately deferred until historical data is corrected.

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
