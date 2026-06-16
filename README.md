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

### 2. Set up Supabase
1. Go to [supabase.com](https://supabase.com) → New project → name it `voiloop`
2. Go to **Settings → API** and copy:
   - Project URL
   - anon public key
3. Create `.env.local`:
```bash
cp .env.example .env.local
# Paste your URL and key
```

### 3. Create the database schema
1. In Supabase → **SQL Editor → New query**
2. Paste the contents of `supabase-schema.sql`
3. Click **Run**

### 4. Seed the database
```bash
npm run db:seed
```
This inserts:
- Travis Brandenburgh (COO) — exact WHOOP data from June 9 2026
- 9 team members with generated wellness data
- 4 interventions (2 pending, 1 in progress, 1 monitoring)
- Pulse survey responses for 9 employees

### 5. Run the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

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

## Project Structure
```
src/
├── app/
│   ├── executive/        # Executive dashboard (KPIs, recovery, burnout)
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
1. Export WHOOP/Oura CSV
2. Map columns to `daily_wellness` schema
3. Import via Supabase Dashboard → Table Editor → Import CSV

### API integration (future)
- WHOOP API: `https://api.prod.whoop.com/developer/v1/`
- Oura API: `https://api.ouraring.com/v2/`
- Create a Next.js Route Handler at `src/app/api/sync/route.ts`

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
