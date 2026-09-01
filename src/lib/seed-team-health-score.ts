/**
 * Team Health Score (GH #119) local test-data generator.
 * Run: npm run db:seed:team-health-score  (after `npm run db:seed`)
 *
 * `seed.ts` only inserts one snapshot day (2026-06-09) per participant, which is
 * enough for the existing KPI cards/engagement score, but is *not* enough to
 * exercise the Team Health Score baseline/last-week/current windows, which each
 * need many consecutive days of daily_wellness + workouts history. This script
 * additively backfills several months of realistic daily_wellness and workouts
 * rows for every participant seeded by seed.ts, spanning from the later of the
 * admin-configured baseline window or each participant's enrolled_date through
 * "today" (computed at run time), so the Team Health Score Trend / 5-Metric
 * Breakdown cards -- and the cohort/per-participant averages block -- have real
 * data to render locally instead of "Missing data this window" / all-zero
 * averages. Each participant gets a distinct performance profile (via a
 * per-participant salt + baseline offset) so the cohort doesn't look uniform.
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

// Mirrors seed.ts's participantDefs (id + enrolled_date only -- the rest of
// each participant's profile already lives in seed.ts). Each entry also gets
// a distinct performance profile so the cohort isn't uniform: `baseOffset`
// shifts recovery/sleep/HRV up or down, and `salt` keeps each participant's
// pseudo-random day-to-day noise independent of the others.
const PARTICIPANTS: { id: string; enrolledDate: string; baseOffset: number; salt: number }[] = [
  { id: 'EMP001', enrolledDate: '2026-01-15', baseOffset: 0,   salt: 100 }, // Travis -- exact-data reference participant, unchanged
  { id: 'EMP002', enrolledDate: '2026-01-15', baseOffset: 5,   salt: 200 },
  { id: 'EMP003', enrolledDate: '2026-02-01', baseOffset: -8,  salt: 300 },
  { id: 'EMP004', enrolledDate: '2026-02-01', baseOffset: 2,   salt: 400 },
  { id: 'EMP005', enrolledDate: '2026-02-15', baseOffset: -12, salt: 500 },
  { id: 'EMP006', enrolledDate: '2026-03-01', baseOffset: 6,   salt: 600 },
  { id: 'EMP007', enrolledDate: '2026-03-01', baseOffset: -3,  salt: 700 },
  { id: 'EMP008', enrolledDate: '2026-03-15', baseOffset: -15, salt: 800 },
  { id: 'EMP009', enrolledDate: '2026-04-01', baseOffset: 4,   salt: 900 },
  { id: 'EMP010', enrolledDate: '2026-08-01', baseOffset: -5,  salt: 1000 }, // Caleb -- enrolled recently, so short history is expected
]

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

  const baselineStart = config?.baseline_start ?? '2026-07-02'
  const endDate = toDateKey(new Date()) // through "today", whenever this runs

  const wellnessRows: Record<string, unknown>[] = []
  const workoutRows: Record<string, unknown>[] = []

  for (const participant of PARTICIPANTS) {
    // Never backfill before a participant's real enrolled_date -- e.g. Caleb
    // (EMP010) enrolled 2026-08-01, so a short, recent-only history is correct
    // for him even once every other participant has a full baseline window.
    const startDate = baselineStart > participant.enrolledDate ? baselineStart : participant.enrolledDate
    if (startDate > endDate) continue

    let cursor = startDate
    let dayIndex = 0
    let rowCount = 0
    let woCount = 0
    while (cursor <= endDate) {
      const r1 = dayRandom(cursor, participant.salt + 1)
      const r2 = dayRandom(cursor, participant.salt + 2)
      const r3 = dayRandom(cursor, participant.salt + 3)
      const dow = new Date(`${cursor}T00:00:00.000Z`).getUTCDay() // 0=Sun..6=Sat

      // Gentle upward trend over the whole range so the Trend chart shows
      // visible baseline -> last week -> current movement, plus day-to-day noise,
      // offset per-participant so the cohort isn't uniform.
      const trend = Math.min(dayIndex / 45, 1) // ramps up over ~45 days then holds
      const offset = participant.baseOffset
      const sleepHrs = Math.round((6.6 + offset / 20 + trend * 0.9 + (r1 - 0.5) * 1.0) * 100) / 100
      const hrvMs = Math.round(34 + offset / 2 + trend * 10 + (r2 - 0.5) * 8)
      const recoveryScore = Math.max(1, Math.min(100, Math.round(58 + offset + trend * 20 + (r3 - 0.5) * 24)))
      // "Sleep onset" the previous night, ~22:00-23:30 local, so sleepNightDate's
      // 6am-cutoff rule maps it onto `cursor` (the night that ends this morning).
      const onsetHour = 22 + Math.floor(r1 * 2) // 22 or 23
      const onsetMinute = Math.floor(r2 * 60)
      const onsetDate = addDays(cursor, -1)
      const sleepOnsetTime = `${onsetDate}T${String(onsetHour).padStart(2, '0')}:${String(onsetMinute).padStart(2, '0')}:00.000Z`

      wellnessRows.push({
        participant_id: participant.id,
        date: cursor,
        recovery_score: recoveryScore,
        hrv_ms: hrvMs,
        resting_hr: 60 - Math.round(offset / 4) - Math.round(trend * 4),
        blood_oxygen: 97.5,
        skin_temp: 33.2,
        day_strain: Math.round((8 + r1 * 6) * 100) / 100,
        calories: 2200 + Math.round(r2 * 400),
        sleep_perf: Math.max(1, Math.min(100, Math.round(70 + offset + trend * 15 + (r3 - 0.5) * 20))),
        sleep_hrs: sleepHrs,
        sleep_debt: Math.max(0, Math.round((1.2 - offset / 20 - trend * 0.7) * 100) / 100),
        sleep_need: 8.1,
        deep_sleep: 1.3,
        rem_sleep: 1.6,
        light_sleep: sleepHrs - 2.9 > 0 ? Math.round((sleepHrs - 2.9) * 100) / 100 : 3.0,
        sleep_eff: 88,
        sleep_consistency: 75,
        resp_rate: 15.8,
        sleep_onset_time: sleepOnsetTime,
      })
      rowCount += 1

      // Rest days on Tue/Thu (dow 2, 4) so zone2Score and coverage still read
      // realistically <100% workout days but with plenty of coverage for the
      // wear-consistency/coverage% calculations, which key off daily_wellness.
      if (dow !== 2 && dow !== 4) {
        const durationMin = 25 + Math.round(r1 * 30)
        const startHour = 6 + Math.floor(r2 * 3)
        workoutRows.push({
          participant_id: participant.id,
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
        woCount += 1
      }

      cursor = addDays(cursor, 1)
      dayIndex += 1
    }
    console.log(`  ${participant.id}: ${startDate} → ${endDate} (${rowCount} wellness days, ${woCount} workouts)`)
  }

  console.log(`Upserting ${wellnessRows.length} daily_wellness rows across ${PARTICIPANTS.length} participants...`)
  const { error: wellErr } = await supabase
    .from('daily_wellness')
    .upsert(wellnessRows, { onConflict: 'participant_id,date' })
  if (wellErr) { console.error('daily_wellness backfill:', wellErr); process.exit(1) }
  console.log(`✅ ${wellnessRows.length} daily_wellness rows upserted`)

  const { error: woErr } = await supabase
    .from('workouts')
    .upsert(workoutRows, { onConflict: 'participant_id,start_time' })
  if (woErr) { console.error('workouts backfill:', woErr); process.exit(1) }
  console.log(`✅ ${workoutRows.length} workout rows upserted`)

  console.log('\n🎉 Team Health Score test data ready for the whole cohort on /wellness-director.')
}

main()
