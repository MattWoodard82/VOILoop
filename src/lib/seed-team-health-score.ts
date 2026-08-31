/**
 * Team Health Score (GH #119) local test-data generator.
 * Run: npm run db:seed:team-health-score  (after `npm run db:seed`)
 *
 * `seed.ts` only inserts one snapshot day (2026-06-09) per participant, which is
 * enough for the existing KPI cards/engagement score, but is *not* enough to
 * exercise the Team Health Score baseline/last-week/current windows, which each
 * need many consecutive days of daily_wellness + workouts history. This script
 * additively backfills several months of realistic daily_wellness and workouts
 * rows for one participant (EMP001 / Travis Brandenburgh) spanning from the
 * admin-configured baseline window through "today" (computed at run time), so
 * the Team Health Score Trend / 5-Metric Breakdown cards have real data to
 * render locally instead of "Missing data this window".
 *
 * Safe to re-run: every insert is an upsert keyed on the same unique
 * constraints seed.ts uses (participant_id+date for daily_wellness,
 * participant_id+start_time for workouts), and it reuses the same
 * local-only-by-default guard as seed.ts.
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

function assertSeedingAllowed(url: string) {
  const voiloopEnv = (process.env.VOILOOP_ENV ?? '').toLowerCase()
  const allowNonLocalSeed = process.env.VOILOOP_ALLOW_NON_LOCAL_SEED === 'true'

  if (voiloopEnv === 'pilot' || voiloopEnv === 'production') {
    throw new Error(`Refusing to seed when VOILOOP_ENV=${voiloopEnv}. Seeding is local-only by default.`)
  }
  if (isLocalSupabaseUrl(url)) return
  if (allowNonLocalSeed) {
    console.warn('⚠ VOILOOP_ALLOW_NON_LOCAL_SEED=true set. Proceeding to seed non-local Supabase environment.')
    return
  }
  throw new Error(
    `Refusing to seed non-local Supabase URL (${url}). ` +
    'Set VOILOOP_ALLOW_NON_LOCAL_SEED=true only when you explicitly intend to seed a remote environment.'
  )
}

assertSeedingAllowed(supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PARTICIPANT_ID = 'EMP001'

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateKey(d)
}

// Cheap deterministic pseudo-random in [0, 1), seeded per-day so re-runs
// produce identical data (idempotent upserts stay byte-for-byte stable).
function dayRandom(dateKey: string, salt: number): number {
  let hash = 0
  const str = `${dateKey}:${salt}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return (Math.abs(hash) % 10000) / 10000
}

async function main() {
  const { data: config, error: configErr } = await supabase
    .from('team_health_score_config')
    .select('baseline_start')
    .eq('id', 'current')
    .maybeSingle()
  if (configErr) { console.error('team_health_score_config:', configErr); process.exit(1) }

  const startDate = config?.baseline_start ?? '2026-07-02'
  const endDate = toDateKey(new Date()) // through "today", whenever this runs
  console.log(`Backfilling ${PARTICIPANT_ID} daily_wellness + workouts from ${startDate} to ${endDate}...`)

  const wellnessRows: Record<string, unknown>[] = []
  const workoutRows: Record<string, unknown>[] = []

  let cursor = startDate
  let dayIndex = 0
  while (cursor <= endDate) {
    const r1 = dayRandom(cursor, 1)
    const r2 = dayRandom(cursor, 2)
    const r3 = dayRandom(cursor, 3)
    const dow = new Date(`${cursor}T00:00:00.000Z`).getUTCDay() // 0=Sun..6=Sat

    // Gentle upward trend over the whole range so the Trend chart shows
    // visible baseline -> last week -> current movement, plus day-to-day noise.
    const trend = Math.min(dayIndex / 45, 1) // ramps up over ~45 days then holds
    const sleepHrs = Math.round((6.6 + trend * 0.9 + (r1 - 0.5) * 1.0) * 100) / 100
    const hrvMs = Math.round(34 + trend * 10 + (r2 - 0.5) * 8)
    const recoveryScore = Math.max(1, Math.min(100, Math.round(58 + trend * 20 + (r3 - 0.5) * 24)))
    // "Sleep onset" the previous night, ~22:00-23:30 local, so sleepNightDate's
    // 6am-cutoff rule maps it onto `cursor` (the night that ends this morning).
    const onsetHour = 22 + Math.floor(r1 * 2) // 22 or 23
    const onsetMinute = Math.floor(r2 * 60)
    const onsetDate = addDays(cursor, -1)
    const sleepOnsetTime = `${onsetDate}T${String(onsetHour).padStart(2, '0')}:${String(onsetMinute).padStart(2, '0')}:00.000Z`

    wellnessRows.push({
      participant_id: PARTICIPANT_ID,
      date: cursor,
      recovery_score: recoveryScore,
      hrv_ms: hrvMs,
      resting_hr: 60 - Math.round(trend * 4),
      blood_oxygen: 97.5,
      skin_temp: 33.2,
      day_strain: Math.round((8 + r1 * 6) * 100) / 100,
      calories: 2200 + Math.round(r2 * 400),
      sleep_perf: Math.max(1, Math.min(100, Math.round(70 + trend * 15 + (r3 - 0.5) * 20))),
      sleep_hrs: sleepHrs,
      sleep_debt: Math.round((1.2 - trend * 0.7) * 100) / 100,
      sleep_need: 8.1,
      deep_sleep: 1.3,
      rem_sleep: 1.6,
      light_sleep: sleepHrs - 2.9 > 0 ? Math.round((sleepHrs - 2.9) * 100) / 100 : 3.0,
      sleep_eff: 88,
      sleep_consistency: 75,
      resp_rate: 15.8,
      sleep_onset_time: sleepOnsetTime,
    })

    // Rest days on Tue/Thu (dow 2, 4) so zone2Score and coverage still read
    // realistically <100% workout days but with plenty of coverage for the
    // wear-consistency/coverage% calculations, which key off daily_wellness.
    if (dow !== 2 && dow !== 4) {
      const durationMin = 25 + Math.round(r1 * 30)
      const startHour = 6 + Math.floor(r2 * 3)
      workoutRows.push({
        participant_id: PARTICIPANT_ID,
        date: cursor,
        start_time: `${cursor}T${String(startHour).padStart(2, '0')}:15:00Z`,
        end_time: `${cursor}T${String(startHour).padStart(2, '0')}:${String(15 + (durationMin % 45)).padStart(2, '0')}:00Z`,
        activity: dow % 2 === 0 ? 'Running' : 'Weightlifting',
        duration_min: durationMin,
        strain: Math.round((7 + r3 * 5) * 100) / 100,
        calories: 250 + Math.round(r1 * 200),
        max_hr: 165 + Math.round(r2 * 15),
        avg_hr: 125 + Math.round(r3 * 20),
        zone1_pct: 30,
        zone2_pct: 20 + Math.round(trend * 8),
        zone3_pct: 20,
        zone4_pct: 20 - Math.round(trend * 4),
        zone5_pct: 10 - Math.round(trend * 4),
      })
    }

    cursor = addDays(cursor, 1)
    dayIndex += 1
  }

  const { error: wellErr } = await supabase
    .from('daily_wellness')
    .upsert(wellnessRows, { onConflict: 'participant_id,date' })
  if (wellErr) { console.error('daily_wellness backfill:', wellErr); process.exit(1) }
  console.log(`✅ ${wellnessRows.length} daily_wellness rows upserted for ${PARTICIPANT_ID}`)

  const { error: woErr } = await supabase
    .from('workouts')
    .upsert(workoutRows, { onConflict: 'participant_id,start_time' })
  if (woErr) { console.error('workouts backfill:', woErr); process.exit(1) }
  console.log(`✅ ${workoutRows.length} workout rows upserted for ${PARTICIPANT_ID}`)

  console.log('\n🎉 Team Health Score test data ready. Select Travis Brandenburgh on /wellness-director to see it.')
}

main()
