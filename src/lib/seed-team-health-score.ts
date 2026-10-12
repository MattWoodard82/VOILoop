/**
 * Team Health Score (GH #119) local test-data generator.
 * Run: npm run db:seed:team-health-score  (after `npm run db:seed`)
 *
 * `seed.ts` only inserts one snapshot day per participant, which is enough for
 * the existing KPI cards/engagement score, but is *not* enough to
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
import { assertSupabaseProjectTarget } from './pilot-account-deactivation'
import {
  ADDITIONAL_DEMO_PARTICIPANTS,
  demoSeedDate,
  type DemoTrendDirection,
  type DemoWearableHistory,
} from './demo-seed-profile'

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
    if (voiloopEnv === 'demo') {
      assertSupabaseProjectTarget(url, voiloopEnv, 'demo', process.env.DEMO_SUPABASE_PROJECT_REF, null)
    }
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

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateKey(d)
}

const today = demoSeedDate()

// Relative enrollment dates keep the cohort recent and make seed reruns useful
// regardless of when the demo project is refreshed.
const PARTICIPANTS: {
  id: string
  enrolledDate: string
  baseOffset: number
  salt: number
  trendDirection: DemoTrendDirection
  wearableHistory: DemoWearableHistory
  staleDays?: number
  missingEveryNthDay?: number
}[] = [
  { id: 'EMP001', enrolledDate: addDays(today, -270), baseOffset: 0, salt: 100, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP002', enrolledDate: addDays(today, -270), baseOffset: 5, salt: 200, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP003', enrolledDate: addDays(today, -250), baseOffset: -8, salt: 300, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP004', enrolledDate: addDays(today, -250), baseOffset: 2, salt: 400, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP005', enrolledDate: addDays(today, -240), baseOffset: -12, salt: 500, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP006', enrolledDate: addDays(today, -220), baseOffset: 6, salt: 600, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP007', enrolledDate: addDays(today, -220), baseOffset: -3, salt: 700, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP008', enrolledDate: addDays(today, -200), baseOffset: -15, salt: 800, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP009', enrolledDate: addDays(today, -180), baseOffset: 4, salt: 900, trendDirection: 'improving', wearableHistory: 'complete' },
  { id: 'EMP010', enrolledDate: addDays(today, -45), baseOffset: -5, salt: 1000, trendDirection: 'improving', wearableHistory: 'complete' },
  ...ADDITIONAL_DEMO_PARTICIPANTS.map((participant) => ({
    id: participant.id,
    enrolledDate: addDays(today, -participant.daysEnrolledAgo),
    baseOffset: participant.scenario.baseOffset,
    salt: Number(participant.id.slice(3)) * 100,
    trendDirection: participant.scenario.trendDirection,
    wearableHistory: participant.scenario.wearableHistory,
    staleDays: participant.scenario.staleDays,
    missingEveryNthDay: participant.scenario.missingEveryNthDay,
  })),
]

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

export async function seedTeamHealthScore() {
  const { data: config, error: configErr } = await supabase
    .from('team_health_score_config')
    .select('baseline_start')
    .eq('id', 'current')
    .maybeSingle()
  if (configErr) { console.error('team_health_score_config:', configErr); process.exit(1) }

  const endDate = today
  const configuredBaselineStart = config?.baseline_start
  const baselineStart = configuredBaselineStart && configuredBaselineStart <= endDate
    ? configuredBaselineStart
    : addDays(endDate, -90)

  const wellnessRows: Record<string, unknown>[] = []
  const workoutRows: Record<string, unknown>[] = []

  for (const participant of PARTICIPANTS) {
    // Never backfill before a participant's enrolled date; recent enrollees
    // should retain short histories even when others have a full baseline.
    const startDate = baselineStart > participant.enrolledDate ? baselineStart : participant.enrolledDate
    const participantEndDate = participant.staleDays ? addDays(endDate, -participant.staleDays) : endDate
    if (participant.wearableHistory === 'none' || startDate > participantEndDate) {
      console.log(`  ${participant.id}: no wearable history (${participant.wearableHistory})`)
      continue
    }

    let cursor = startDate
    let dayIndex = 0
    let rowCount = 0
    let woCount = 0
    while (cursor <= participantEndDate) {
      const r1 = dayRandom(cursor, participant.salt + 1)
      const r2 = dayRandom(cursor, participant.salt + 2)
      const r3 = dayRandom(cursor, participant.salt + 3)
      const dow = new Date(`${cursor}T00:00:00.000Z`).getUTCDay() // 0=Sun..6=Sat

      // Gentle upward trend over the whole range so the Trend chart shows
      // visible baseline -> last week -> current movement, plus day-to-day noise,
      // offset per-participant so the cohort isn't uniform.
      const trendProgress = Math.min(dayIndex / 45, 1)
      const trend = participant.trendDirection === 'declining'
        ? -trendProgress
        : participant.trendDirection === 'steady' ? 0 : trendProgress
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

      const skipWearableDay = participant.wearableHistory === 'sparse'
        && participant.missingEveryNthDay !== undefined
        && (dayIndex + 1) % participant.missingEveryNthDay === 0

      if (!skipWearableDay) wellnessRows.push({
        participant_id: participant.id,
        date: cursor,
        recovery_score: recoveryScore,
        hrv_ms: hrvMs,
        resting_hr: 60 - Math.round(offset / 4) - Math.round(trend * 4),
        blood_oxygen: 97.5,
        skin_temp: 33.2,
        day_strain: Math.round((8 + r1 * 6 + Math.max(0, -offset) / 5) * 100) / 100,
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
      if (!skipWearableDay) rowCount += 1

      // Rest days on Tue/Thu (dow 2, 4) so zone2Score and coverage still read
      // realistically <100% workout days but with plenty of coverage for the
      // wear-consistency/coverage% calculations, which key off daily_wellness.
      if (!skipWearableDay && dow !== 2 && dow !== 4) {
        const durationMin = 25 + Math.round(r1 * 30)
        const startHour = 6 + Math.floor(r2 * 3)
        const startTime = new Date(`${cursor}T${String(startHour).padStart(2, '0')}:15:00.000Z`)
        const endTime = new Date(startTime.getTime() + durationMin * 60 * 1000)
        const zone2Pct = 20 + Math.round(trend * 8)
        const zone4Pct = 20 - Math.round(trend * 4)
        workoutRows.push({
          participant_id: participant.id,
          date: cursor,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          activity: dow % 2 === 0 ? 'Running' : 'Weightlifting',
          duration_min: durationMin,
          strain: Math.round((7 + r3 * 5) * 100) / 100,
          calories: 250 + Math.round(r1 * 200),
          max_hr: 165 + Math.round(r2 * 15),
          avg_hr: 125 + Math.round(r3 * 20),
          zone1_pct: 30,
          zone2_pct: zone2Pct,
          zone3_pct: 20,
          zone4_pct: zone4Pct,
          zone5_pct: 50 - zone2Pct - zone4Pct,
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

if (require.main === module) {
  seedTeamHealthScore().catch((error) => {
    console.error('Team Health Score seed failed:', error)
    process.exit(1)
  })
}
