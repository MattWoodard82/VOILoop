# VOILoop — Workforce Wellbeing Outcomes Platform

> Close the loop on workforce wellness ROI.
> Insight → Action → Validation → Optimization

Built with Next.js 14, Supabase, Recharts, Tailwind CSS.
Seahawks brand: Navy #002244 · Action Green #69BE28 · Wolf Grey #A5ACAF

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase (local)
```bash
npx supabase init
npx supabase start
```
Use these local values in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase start output>`
- `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from supabase start output>`

### 3. Create environment file
```bash
cp .env.example .env.local
# PowerShell:
# Copy-Item .env.example .env.local
```
Then update the Supabase keys in `.env.local`.

### 4. Create the database schema
```bash
npx supabase db query --local -f supabase-schema.sql
```

### 5. Seed the database
```bash
npm run db:seed
```
This inserts:
- Travis Brandenburgh (COO) — exact WHOOP data from June 9 2026
- 9 team members with generated wellness data
- 4 interventions (2 pending, 1 in progress, 1 monitoring)
- Pulse survey responses for 9 employees

### 6. Run the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 7. Bootstrap admin account
```bash
npm run admin:bootstrap
```
Default local credentials come from `.env.local`:
- `PILOT_ADMIN_EMAIL` (default `admin@voiloop.local`)
- `PILOT_ADMIN_PASSWORD` (default `Admin1234`)

Login is email/password only. Users created through account provisioning are forced to change password on first login.

---

## Deploy to Vercel
```bash
# Push to GitHub first
git init && git add . && git commit -m "VOILoop MVP"
gh repo create voiloop --public --push

# Then in Vercel:
# 1. Import the GitHub repo
# 2. Add environment variables (same as .env.local)
# 3. Deploy
```

---

## CI Build & Demo Checks

The repository includes a CI workflow at `.github/workflows/ci.yml` with these gates:

1. `npm ci` (or `npm install` fallback if no lockfile exists)
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`
5. `npm test` (full test suite)
6. `npm run smoke:routes -- http://127.0.0.1:3000` (non-blocking demo route smoke check)

**Required:** lint, typecheck, build, and full test execution.

**Non-blocking for now:** route smoke check for demo paths (`/`, `/wellness-director`, `/team`, `/interventions`, `/outcomes`, `/admin/import`) so demo regressions are visible while pilot infrastructure is still being finalized.

**Build env requirement:** CI build needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` configured as repository variables or secrets, because pages fetch Supabase data during build/prerender.

## Production Deploy Safeguards

To protect live demo production while PRs are in flight:

1. **PR deployment guard:** `.github/workflows/deployment-guard.yml` fails a PR if its head SHA has any deployment marked as Production.
2. **Vercel project setting:** set **Production Branch** to `main` only.
3. **GitHub branch protection:** require PR + required checks before merge into `main`.
4. **Vercel access control:** limit who can manually promote/deploy to Production.

---

## Project Structure
```
src/
├── app/
│   ├── wellness-director/ # Wellness Director dashboard (KPIs, recovery, burnout)
│   ├── team/             # Team roster with click-through employee detail
│   ├── pulse/            # Pulse survey scores and question breakdown
│   ├── interventions/    # Intervention log and recommendations
│   └── outcomes/         # Before/after validation + VOILoop cycle
├── components/
│   ├── layout/           # Sidebar, Topbar, DashboardShell
│   └── ui/               # KpiCard, Badge, Alert, BarRow, Card, etc.
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Browser Supabase client
│   │   └── queries.ts    # All data fetching functions
│   ├── seed.ts           # Database seed script
│   └── utils.ts          # Brand colors, helpers, formatters
└── types/index.ts        # TypeScript types matching Supabase schema
```

---

## Adding Real Wearable Data

### Manual upload (Excel → Supabase)
1. Export the WHOOP workbook (`.xlsx`)
2. Upload it through `/admin/import`
3. Review the import summary and any row-level errors

### API integration (future)
- WHOOP API: `https://api.prod.whoop.com/developer/v1/`
- Oura API: `https://api.ouraring.com/v2/`
- Create a Next.js Route Handler at `src/app/api/sync/route.ts`

---

## WHOOP Import Persistence (Issue #2)

The importer now persists each upload as a tracked batch:
- `upload_batches` stores upload metadata + run status/counts.
- Normalized records in `workouts`, `daily_wellness`, and `habits` are linked to `source_batch_id`.
- `import_row_outcomes` stores row-level failures/skips for review/export.

### Local verification runbook (no hosted demo changes)
1. Use a local/dev Supabase project for schema testing.
2. Apply `supabase-schema.sql` to that local/dev project.
3. Run the app and import a WHOOP workbook (`.xlsx`) or WHOOP CSV (`.csv`) from `/admin/import`.
4. Verify:
   - `upload_batches` has a run with `completed`, `partial`, or `failed` status.
   - Upserts landed in normalized tables with `source_batch_id` set.
   - `import_row_outcomes` contains row-level failures when validation or DB writes fail.
5. Re-upload the same file and confirm there are no duplicate logical records.

> This branch does not apply schema changes to the hosted demo Supabase automatically.  
> Schema updates are repository SQL changes and should be applied only to the environment you choose.

### Retention/archival guidance
- Keep `upload_batches` + `import_row_outcomes` online for active troubleshooting and auditability.
- Archive older raw upload artifacts and historical row outcomes to cold storage based on pilot policy.
- Preserve file hash + batch status history so replay/idempotency behavior remains explainable.

---

## Key Data Fields (Travis — exact June 9 2026)
| Metric | Value |
|--------|-------|
| Recovery Score | 72 |
| HRV | 37ms |
| Resting HR | 63 bpm |
| Sleep Performance | 89% |
| Sleep Hours | 7.4hrs |
| Sleep Debt | 0.5hrs |
| Day Strain | 10.4 |
| Workout | Running 35min |
| Calories | 2,100 |
