/**
 * VOILoop seed script
 * Run: npm run db:seed
 *
 * Creates auth users for each participant, links auth_user_id, seeds all
 * relevant tables to reflect the current schema, and provisions user_access
 * rows so participants can log in immediately after reset.
 *
 * test1@user.com  → Morgan Ellis (EMP005)  password: Password!
 * Other participants use synthetic voiloop.local accounts with password: Pilot1234
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { ADDITIONAL_DEMO_PARTICIPANTS, demoSeedDate } from './demo-seed-profile'
import { assertSupabaseProjectTarget } from './pilot-account-deactivation'

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

  if (isLocalSupabaseUrl(url)) {
    return
  }

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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const DATE = demoSeedDate()

function shiftIsoDate(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00.000Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function mondayOfWeek(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return shiftIsoDate(date, day === 0 ? -6 : 1 - day)
}

const WEEK_OF = mondayOfWeek(DATE)

// Keep the challenge window in the future and outside the history backfill so
// it remains active after recompute and doesn't inflate device-wear metrics.
const UTC_TODAY = new Date().toISOString().slice(0, 10)
const CHALLENGE_DATE = shiftIsoDate(DATE > UTC_TODAY ? DATE : UTC_TODAY, 1)

// Maps participant id → { email, password }
// test1@user.com is mapped to the synthetic EMP005 demo profile.
const PARTICIPANT_AUTH: Record<string, { email: string; password: string }> = {
  EMP001: { email: 'devon@voiloop.local',   password: 'Pilot1234' },
  EMP002: { email: 'riley@voiloop.local',   password: 'Pilot1234' },
  EMP003: { email: 'jordan@voiloop.local',  password: 'Pilot1234' },
  EMP004: { email: 'casey@voiloop.local',   password: 'Pilot1234' },
  EMP005: { email: 'test1@user.com',        password: 'Password!' },
  EMP006: { email: 'quinn@voiloop.local',   password: 'Pilot1234' },
  EMP007: { email: 'cameron@voiloop.local', password: 'Pilot1234' },
  EMP008: { email: 'taylor@voiloop.local',  password: 'Pilot1234' },
  EMP009: { email: 'jamie@voiloop.local',   password: 'Pilot1234' },
  EMP010: { email: 'skyler@voiloop.local',  password: 'Pilot1234' },
}

async function upsertAuthUser(email: string, password: string): Promise<string> {
  let existing: { id: string } | undefined
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Failed to list Auth users before seed: ${error.message}`)
    existing = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (existing || data.users.length < 1000) break
  }
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password, ban_duration: 'none' })
    if (error) throw new Error(`Failed to restore seeded Auth user ${email}: ${error.message}`)
    return existing.id
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`Failed to create auth user ${email}: ${error?.message}`)
  return data.user.id
}

export async function seed() {
  console.log('🌱 Seeding VOILoop database...')

  // ── Auth users + Participants ─────────────────────────────────────────────
  const participantDefs = [
    { id: 'EMP001', first_name: 'Devon',   last_name: 'Harper',  department: 'Manager',        title: 'COO',             device_id: 'WHP-001', cohort: 'management',  enrolled_date: shiftIsoDate(DATE, -270), is_exact_data: false },
    { id: 'EMP002', first_name: 'Riley',   last_name: 'Chen',    department: 'Pediatrics',     title: 'Pediatric Nurse', device_id: 'WHP-002', cohort: 'day-shift',   enrolled_date: shiftIsoDate(DATE, -270), is_exact_data: false },
    { id: 'EMP003', first_name: 'Jordan',  last_name: 'Patel',   department: 'Cardiology',     title: 'Cardio Nurse',    device_id: 'WHP-003', cohort: 'day-shift',   enrolled_date: shiftIsoDate(DATE, -250), is_exact_data: false },
    { id: 'EMP004', first_name: 'Casey',   last_name: 'Flores',  department: 'Surgery',        title: 'Surgical Tech',   device_id: 'WHP-004', cohort: 'day-shift',   enrolled_date: shiftIsoDate(DATE, -250), is_exact_data: false },
    { id: 'EMP005', first_name: 'Morgan',  last_name: 'Ellis',   department: 'Night Shift',    title: 'RN',              device_id: 'WHP-005', cohort: 'night-shift', enrolled_date: shiftIsoDate(DATE, -240), is_exact_data: false },
    { id: 'EMP006', first_name: 'Quinn',   last_name: 'Shah',    department: 'Oncology',       title: 'Oncology RN',     device_id: 'WHP-006', cohort: 'day-shift',   enrolled_date: shiftIsoDate(DATE, -220), is_exact_data: false },
    { id: 'EMP007', first_name: 'Cameron', last_name: 'Wells',   department: 'Admin',          title: 'HR Coordinator',  device_id: 'WHP-007', cohort: 'management',  enrolled_date: shiftIsoDate(DATE, -220), is_exact_data: false },
    { id: 'EMP008', first_name: 'Taylor',  last_name: 'Brooks',  department: 'ICU',            title: 'ICU Nurse',       device_id: 'WHP-008', cohort: 'night-shift', enrolled_date: shiftIsoDate(DATE, -200), is_exact_data: false },
    { id: 'EMP009', first_name: 'Jamie',   last_name: 'Alvarez', department: 'Emergency Dept', title: 'ER Tech',         device_id: 'WHP-009', cohort: 'day-shift',   enrolled_date: shiftIsoDate(DATE, -180), is_exact_data: false },
    { id: 'EMP010', first_name: 'Skyler',  last_name: 'Park',    department: 'Surgery',        title: 'Surgical RN',     device_id: 'WHP-010', cohort: 'day-shift',   enrolled_date: shiftIsoDate(DATE, -45),  is_exact_data: false },
    ...ADDITIONAL_DEMO_PARTICIPANTS.map(({ daysEnrolledAgo, scenario: _scenario, ...participant }) => ({
      ...participant,
      enrolled_date: shiftIsoDate(DATE, -daysEnrolledAgo),
      is_exact_data: false,
    })),
  ]

  const authUserIds: Record<string, string> = {}
  for (const p of participantDefs) {
    const { email, password } = PARTICIPANT_AUTH[p.id] ?? {
      email: `${p.id.toLowerCase()}@voiloop.local`,
      password: 'Pilot1234',
    }
    const userId = await upsertAuthUser(email, password)
    authUserIds[p.id] = userId
  }
  console.log('✅ Auth users provisioned')

  const participants = participantDefs.map(p => ({
    ...p,
    auth_user_id: authUserIds[p.id],
    consent: true,
    status: 'Active',
  }))

  const { error: participantErr } = await supabase
    .from('participants')
    .upsert(participants, { onConflict: 'id' })
  if (participantErr) { console.error('Participants:', participantErr); process.exit(1) }
  console.log('✅ Participants seeded')

  // ── user_access rows (role: participant, no forced password change) ────────
  const userAccessRows = participantDefs.map(p => ({
    user_id: authUserIds[p.id],
    role: 'participant',
    must_change_password: false,
    is_active: true,
  }))
  const { error: accessErr } = await supabase
    .from('user_access')
    .upsert(userAccessRows, { onConflict: 'user_id' })
  if (accessErr) { console.error('user_access:', accessErr); process.exit(1) }
  console.log('✅ user_access rows seeded')

  // ── Daily Wellness ─────────────────────────────────────────────────────────
  // EMP001 is the synthetic benchmark profile for outcomes validation.
  const wellness = [
    { participant_id: 'EMP001', date: DATE, recovery_score: 76, hrv_ms: 44, resting_hr: 61,
      blood_oxygen: 97.2, skin_temp: 33.1, day_strain: 8.7, calories: 2240,
      sleep_perf: 85, sleep_hrs: 7.8, sleep_debt: 0.3, sleep_need: 8.1,
      deep_sleep: 1.6, rem_sleep: 1.8, light_sleep: 4.4,
      sleep_eff: 93, sleep_consistency: 79, resp_rate: 15.5 },
    { participant_id: 'EMP002', date: DATE, recovery_score: 71, hrv_ms: 38, resting_hr: 65,
      blood_oxygen: 94.2, skin_temp: 33.1, day_strain: 9.3, calories: 1960,
      sleep_perf: 82, sleep_hrs: 7.2, sleep_debt: 0.7, sleep_need: 8.1,
      deep_sleep: 1.7, rem_sleep: 1.6, light_sleep: 3.9,
      sleep_eff: 93, sleep_consistency: 78, resp_rate: 15.4 },
    { participant_id: 'EMP003', date: DATE, recovery_score: 82, hrv_ms: 51, resting_hr: 59,
      blood_oxygen: 95.1, skin_temp: 32.8, day_strain: 8.4, calories: 1870,
      sleep_perf: 91, sleep_hrs: 7.8, sleep_debt: 0.1, sleep_need: 8.0,
      deep_sleep: 2.1, rem_sleep: 1.9, light_sleep: 3.8,
      sleep_eff: 97, sleep_consistency: 87, resp_rate: 14.7 },
    { participant_id: 'EMP004', date: DATE, recovery_score: 68, hrv_ms: 39, resting_hr: 64,
      blood_oxygen: 93.9, skin_temp: 33.3, day_strain: 11.9, calories: 2320,
      sleep_perf: 79, sleep_hrs: 7.1, sleep_debt: 0.9, sleep_need: 8.3,
      deep_sleep: 1.5, rem_sleep: 1.4, light_sleep: 4.2,
      sleep_eff: 91, sleep_consistency: 74, resp_rate: 15.7 },
    { participant_id: 'EMP005', date: DATE, recovery_score: 42, hrv_ms: 24, resting_hr: 76,
      blood_oxygen: 92.8, skin_temp: 34.0, day_strain: 15.3, calories: 2490,
      sleep_perf: 62, sleep_hrs: 5.9, sleep_debt: 2.2, sleep_need: 8.6,
      deep_sleep: 0.9, rem_sleep: 1.0, light_sleep: 4.0,
      sleep_eff: 86, sleep_consistency: 57, resp_rate: 16.9 },
    { participant_id: 'EMP006', date: DATE, recovery_score: 74, hrv_ms: 42, resting_hr: 63,
      blood_oxygen: 94.4, skin_temp: 33.0, day_strain: 9.7, calories: 2010,
      sleep_perf: 84, sleep_hrs: 7.4, sleep_debt: 0.5, sleep_need: 8.1,
      deep_sleep: 1.8, rem_sleep: 1.7, light_sleep: 3.9,
      sleep_eff: 95, sleep_consistency: 81, resp_rate: 15.3 },
    { participant_id: 'EMP007', date: DATE, recovery_score: 84, hrv_ms: 54, resting_hr: 57,
      blood_oxygen: 95.3, skin_temp: 32.7, day_strain: 7.1, calories: 1780,
      sleep_perf: 93, sleep_hrs: 7.9, sleep_debt: 0.0, sleep_need: 8.0,
      deep_sleep: 2.2, rem_sleep: 2.0, light_sleep: 3.7,
      sleep_eff: 98, sleep_consistency: 88, resp_rate: 14.5 },
    { participant_id: 'EMP008', date: DATE, recovery_score: 38, hrv_ms: 22, resting_hr: 79,
      blood_oxygen: 92.4, skin_temp: 34.2, day_strain: 17.1, calories: 2710,
      sleep_perf: 64, sleep_hrs: 6.0, sleep_debt: 2.4, sleep_need: 8.7,
      deep_sleep: 0.8, rem_sleep: 1.0, light_sleep: 4.2,
      sleep_eff: 85, sleep_consistency: 54, resp_rate: 17.3 },
    { participant_id: 'EMP009', date: DATE, recovery_score: 66, hrv_ms: 37, resting_hr: 67,
      blood_oxygen: 93.7, skin_temp: 33.2, day_strain: 12.2, calories: 2290,
      sleep_perf: 77, sleep_hrs: 7.0, sleep_debt: 1.0, sleep_need: 8.2,
      deep_sleep: 1.4, rem_sleep: 1.3, light_sleep: 4.3,
      sleep_eff: 90, sleep_consistency: 71, resp_rate: 16.0 },
    { participant_id: 'EMP010', date: DATE, recovery_score: 66, hrv_ms: 36, resting_hr: 68,
      blood_oxygen: 93.5, skin_temp: 33.4, day_strain: 13.1, calories: 2410,
      sleep_perf: 74, sleep_hrs: 6.8, sleep_debt: 1.3, sleep_need: 8.3,
      deep_sleep: 1.2, rem_sleep: 1.2, light_sleep: 4.4,
      sleep_eff: 89, sleep_consistency: 67, resp_rate: 16.4 },
  ]

  const { error: wellErr } = await supabase
    .from('daily_wellness')
    .upsert(wellness, { onConflict: 'participant_id,date' })
  if (wellErr) { console.error('Wellness:', wellErr); process.exit(1) }
  console.log('✅ Daily wellness seeded')

  // ── Workouts ───────────────────────────────────────────────────────────────
  const workouts = [
    { participant_id: 'EMP001', date: DATE, start_time: `${DATE}T06:15:00Z`, end_time: `${DATE}T06:50:00Z`, activity: 'Running', duration_min: 35,
      strain: 9.2, calories: 320, max_hr: 172, avg_hr: 138,
      zone1_pct: 30, zone2_pct: 22, zone3_pct: 18, zone4_pct: 20, zone5_pct: 10 },
    { participant_id: 'EMP002', date: DATE, start_time: `${DATE}T05:50:00Z`, end_time: `${DATE}T06:32:00Z`, activity: 'Yoga', duration_min: 42,
      strain: 4.2, calories: 158, max_hr: 124, avg_hr: 96,
      zone1_pct: 80, zone2_pct: 14, zone3_pct: 4, zone4_pct: 2, zone5_pct: 0 },
    { participant_id: 'EMP003', date: DATE, start_time: `${DATE}T07:00:00Z`, end_time: `${DATE}T07:48:00Z`, activity: 'Weightlifting', duration_min: 48,
      strain: 8.7, calories: 272, max_hr: 159, avg_hr: 109,
      zone1_pct: 47, zone2_pct: 15, zone3_pct: 18, zone4_pct: 15, zone5_pct: 5 },
    { participant_id: 'EMP004', date: DATE, start_time: `${DATE}T11:10:00Z`, end_time: `${DATE}T12:05:00Z`, activity: 'Cycling', duration_min: 55,
      strain: 11.8, calories: 458, max_hr: 177, avg_hr: 147,
      zone1_pct: 21, zone2_pct: 18, zone3_pct: 22, zone4_pct: 27, zone5_pct: 12 },
    { participant_id: 'EMP005', date: DATE, start_time: `${DATE}T10:20:00Z`, end_time: `${DATE}T10:38:00Z`, activity: 'Walking', duration_min: 18,
      strain: 3.1, calories: 88, max_hr: 142, avg_hr: 109,
      zone1_pct: 66, zone2_pct: 21, zone3_pct: 10, zone4_pct: 3, zone5_pct: 0 },
    { participant_id: 'EMP006', date: DATE, start_time: `${DATE}T06:40:00Z`, end_time: `${DATE}T07:16:00Z`, activity: 'Running', duration_min: 36,
      strain: 9.1, calories: 316, max_hr: 170, avg_hr: 137,
      zone1_pct: 31, zone2_pct: 23, zone3_pct: 17, zone4_pct: 20, zone5_pct: 9 },
    { participant_id: 'EMP007', date: DATE, start_time: `${DATE}T17:20:00Z`, end_time: `${DATE}T18:05:00Z`, activity: 'Yoga', duration_min: 45,
      strain: 4.7, calories: 160, max_hr: 121, avg_hr: 94,
      zone1_pct: 83, zone2_pct: 13, zone3_pct: 4, zone4_pct: 0, zone5_pct: 0 },
    { participant_id: 'EMP009', date: DATE, start_time: `${DATE}T08:10:00Z`, end_time: `${DATE}T08:54:00Z`, activity: 'Weightlifting', duration_min: 44,
      strain: 8.3, calories: 260, max_hr: 161, avg_hr: 110,
      zone1_pct: 46, zone2_pct: 15, zone3_pct: 19, zone4_pct: 15, zone5_pct: 5 },
    { participant_id: 'EMP010', date: DATE, start_time: `${DATE}T05:40:00Z`, end_time: `${DATE}T06:10:00Z`, activity: 'Running', duration_min: 30,
      strain: 7.9, calories: 267, max_hr: 168, avg_hr: 134,
      zone1_pct: 33, zone2_pct: 24, zone3_pct: 18, zone4_pct: 18, zone5_pct: 7 },
  ]

  const { error: woErr } = await supabase
    .from('workouts')
    .upsert(workouts, { onConflict: 'participant_id,start_time' })
  if (woErr) { console.error('Workouts:', woErr); process.exit(1) }
  console.log('✅ Workouts seeded')

  // ── Habits ─────────────────────────────────────────────────────────────────
  const habits = [
    { participant_id: 'EMP001', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: false, theanine: false, creatine: true,
      ashwagandha: false, tracked_calories: true, dimmed_lights: true, read_before_bed: false,
      notes: null },
    { participant_id: 'EMP002', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: true, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: true,
      notes: null },
    { participant_id: 'EMP003', date: DATE, alcohol: false, caffeine: false, ate_late: false,
      hydrated: true, protein: true, magnesium: true, theanine: true, creatine: false,
      ashwagandha: true, tracked_calories: true, dimmed_lights: true, read_before_bed: true,
      notes: null },
    { participant_id: 'EMP004', date: DATE, alcohol: false, caffeine: true, ate_late: true,
      hydrated: true, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: 'Ate late after double shift' },
    { participant_id: 'EMP005', date: DATE, alcohol: true, caffeine: true, ate_late: true,
      hydrated: false, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: '3rd consecutive poor sleep. Alcohol logged.' },
    { participant_id: 'EMP006', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: false, theanine: false, creatine: true,
      ashwagandha: false, tracked_calories: true, dimmed_lights: false, read_before_bed: false,
      notes: null },
    { participant_id: 'EMP007', date: DATE, alcohol: false, caffeine: false, ate_late: false,
      hydrated: true, protein: true, magnesium: true, theanine: true, creatine: false,
      ashwagandha: true, tracked_calories: true, dimmed_lights: true, read_before_bed: true,
      notes: null },
    { participant_id: 'EMP008', date: DATE, alcohol: true, caffeine: true, ate_late: true,
      hydrated: false, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: null },
    { participant_id: 'EMP009', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: null },
    { participant_id: 'EMP010', date: DATE, alcohol: false, caffeine: true, ate_late: true,
      hydrated: true, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: 'Intervention in progress. Recovery improving 52→66.' },
  ]

  const { error: habErr } = await supabase
    .from('habits')
    .upsert(habits, { onConflict: 'participant_id,date' })
  if (habErr) { console.error('Habits:', habErr); process.exit(1) }
  console.log('✅ Habits seeded')

  // ── Wearable challenge seed scenario (test participant 0/5 -> 1/5) ────────
  // This creates a deterministic active device-wear challenge and participant
  // progress rows, then ensures the test participant has one qualifying day from
  // import-shaped daily_wellness data inside the challenge window.
  // Narrow 5-day window anchored on the dynamic CHALLENGE_DATE (see above) —
  // wide enough to contain the single qualifying day without
  // overlapping team-health-score's historical backfill range.
  const challengeWindowStart = `${CHALLENGE_DATE}T00:00:00.000Z`
  const challengeWindowEnd = `${shiftIsoDate(CHALLENGE_DATE, 4)}T23:59:59.000Z`

  const { data: existingActiveChallenge, error: existingActiveChallengeErr } = await supabase
    .from('challenges')
    .select('id')
    .eq('status', 'active')
    .maybeSingle()
  if (existingActiveChallengeErr) { console.error('Challenge active lookup:', existingActiveChallengeErr); process.exit(1) }

  if (existingActiveChallenge) {
    const { error: cancelErr } = await supabase
      .from('challenges')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingActiveChallenge.id)
    if (cancelErr) { console.error('Challenge cancel existing active:', cancelErr); process.exit(1) }
  }

  const challengeName = 'Wearable consistency seed validation'
  const { data: existingSeedChallenge, error: existingSeedChallengeErr } = await supabase
    .from('challenges')
    .select('id,version')
    .eq('name', challengeName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingSeedChallengeErr) { console.error('Challenge seed lookup:', existingSeedChallengeErr); process.exit(1) }

  let challengeId: string
  if (existingSeedChallenge) {
    const { data: updatedChallenge, error: updateChallengeErr } = await supabase
      .from('challenges')
      .update({
        description: 'Seeded challenge for CSV wearable progress validation.',
        status: 'active',
        metric_type: 'device_wear_consistency',
        threshold_value: 5,
        window_start_at: challengeWindowStart,
        window_end_at: challengeWindowEnd,
        eligibility_mode: 'all_participants',
        eligibility_definition: null,
        activation_at: new Date().toISOString(),
        completed_at: null,
        cancelled_at: null,
        updated_at: new Date().toISOString(),
        version: existingSeedChallenge.version + 1,
      })
      .eq('id', existingSeedChallenge.id)
      .select('id')
      .single()
    if (updateChallengeErr || !updatedChallenge) { console.error('Challenge seed update:', updateChallengeErr); process.exit(1) }
    challengeId = updatedChallenge.id
  } else {
    const { data: insertedChallenge, error: insertChallengeErr } = await supabase
      .from('challenges')
      .insert({
        name: challengeName,
        description: 'Seeded challenge for CSV wearable progress validation.',
        status: 'active',
        metric_type: 'device_wear_consistency',
        threshold_value: 5,
        window_start_at: challengeWindowStart,
        window_end_at: challengeWindowEnd,
        eligibility_mode: 'all_participants',
        eligibility_definition: null,
        activation_at: new Date().toISOString(),
        version: 1,
      })
      .select('id')
      .single()
    if (insertChallengeErr || !insertedChallenge) { console.error('Challenge seed insert:', insertChallengeErr); process.exit(1) }
    challengeId = insertedChallenge.id
  }

  const challengeParticipants = participantDefs.map((participant) => ({
    challenge_id: challengeId,
    participant_id: participant.id,
    is_eligible: true,
    eligibility_reason: null,
    progress_value: 0,
    completed: false,
    completed_at: null,
    completion_source: null,
    completion_idempotency_key: null,
    updated_at: new Date().toISOString(),
  }))
  const { error: challengeParticipantsErr } = await supabase
    .from('challenge_participants')
    .upsert(challengeParticipants, { onConflict: 'challenge_id,participant_id' })
  if (challengeParticipantsErr) { console.error('Challenge participants seed:', challengeParticipantsErr); process.exit(1) }

  const testParticipantWearSeed = {
    participant_id: 'EMP005',
    date: CHALLENGE_DATE,
    recovery_score: 61,
    sleep_perf: 83,
    sleep_hrs: 7.1,
    source_batch_id: null,
  }
  const { error: testParticipantWearSeedErr } = await supabase
    .from('daily_wellness')
    .upsert(testParticipantWearSeed, { onConflict: 'participant_id,date' })
  if (testParticipantWearSeedErr) { console.error('Test participant wearable seed daily_wellness:', testParticipantWearSeedErr); process.exit(1) }
  console.log('✅ Wearable challenge + test participant CSV-shaped seed data configured')

  // ── Pulse Surveys ──────────────────────────────────────────────────────────
  const pulse = [
    { participant_id: 'EMP001', date: DATE, confident_health: true, body_trending_good: true, energy_level: 5, rest_quality: 4, stress_level: 2, physical_activity: ['fitness_center', 'outside'], mental_wellbeing: 5, program_supported: 'yes', whoop_reviewed: 'yes_regularly', health_flag: null },
    { participant_id: 'EMP002', date: DATE, confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 3, physical_activity: ['outside'], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    { participant_id: 'EMP003', date: DATE, confident_health: true, body_trending_good: true, energy_level: 5, rest_quality: 4, stress_level: 2, physical_activity: ['home_gym', 'outside'], mental_wellbeing: 5, program_supported: 'yes', whoop_reviewed: 'yes_regularly', health_flag: null },
    { participant_id: 'EMP004', date: DATE, confident_health: true, body_trending_good: false, energy_level: 3, rest_quality: 3, stress_level: 4, physical_activity: ['fitness_center'], mental_wellbeing: 3, program_supported: 'neutral', whoop_reviewed: 'yes_once', health_flag: 'Fatigue after extended shifts.' },
    { participant_id: 'EMP005', date: DATE, confident_health: false, body_trending_good: false, energy_level: 2, rest_quality: 2, stress_level: 5, physical_activity: ['none'], mental_wellbeing: 2, program_supported: 'no', whoop_reviewed: 'no', health_flag: '3rd consecutive poor sleep night this week.' },
    { participant_id: 'EMP006', date: DATE, confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 3, physical_activity: ['local_gym'], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    { participant_id: 'EMP007', date: DATE, confident_health: true, body_trending_good: true, energy_level: 5, rest_quality: 5, stress_level: 1, physical_activity: ['home_gym', 'fitness_center'], mental_wellbeing: 5, program_supported: 'yes', whoop_reviewed: 'yes_regularly', health_flag: null },
    { participant_id: 'EMP008', date: DATE, confident_health: false, body_trending_good: false, energy_level: 1, rest_quality: 1, stress_level: 5, physical_activity: ['none'], mental_wellbeing: 1, program_supported: 'no', whoop_reviewed: 'no', health_flag: 'Chronic low recovery and low energy.' },
    { participant_id: 'EMP010', date: DATE, confident_health: true, body_trending_good: true, energy_level: 3, rest_quality: 3, stress_level: 3, physical_activity: ['outside'], mental_wellbeing: 3, program_supported: 'neutral', whoop_reviewed: 'yes_once', health_flag: 'Intervention in progress; monitoring weekly energy.' },
  ]

  // Add a few prior-week responses so Pulse dashboards can show richer participant
  // distributions and week-over-week realism after a fresh local seed.
  const extraPulse = [
    { participant_id: 'EMP001', date: shiftIsoDate(DATE, -7), confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: ['fitness_center'], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_regularly', health_flag: null },
    { participant_id: 'EMP003', date: shiftIsoDate(DATE, -7), confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 5, stress_level: 2, physical_activity: ['outside'], mental_wellbeing: 5, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    { participant_id: 'EMP004', date: shiftIsoDate(DATE, -7), confident_health: false, body_trending_good: false, energy_level: 2, rest_quality: 3, stress_level: 4, physical_activity: ['none'], mental_wellbeing: 2, program_supported: 'neutral', whoop_reviewed: 'no', health_flag: 'Stress elevated after double-shift week.' },
    { participant_id: 'EMP006', date: shiftIsoDate(DATE, -7), confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 3, physical_activity: ['local_gym'], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    { participant_id: 'EMP008', date: shiftIsoDate(DATE, -7), confident_health: false, body_trending_good: false, energy_level: 1, rest_quality: 2, stress_level: 5, physical_activity: ['none'], mental_wellbeing: 1, program_supported: 'no', whoop_reviewed: 'no', health_flag: 'Continued low recovery and high stress.' },
    { participant_id: 'EMP010', date: shiftIsoDate(DATE, -7), confident_health: true, body_trending_good: true, energy_level: 3, rest_quality: 3, stress_level: 3, physical_activity: ['outside'], mental_wellbeing: 3, program_supported: 'neutral', whoop_reviewed: 'yes_once', health_flag: null },
  ]

  const { error: pulseErr } = await supabase
    .from('pulse_surveys')
    .upsert([
      ...pulse,
      ...extraPulse,
      { participant_id: 'EMP011', date: DATE, confident_health: true, body_trending_good: true, energy_level: 5, rest_quality: 5, stress_level: 1, physical_activity: ['fitness_center'], mental_wellbeing: 5, program_supported: 'yes', whoop_reviewed: 'yes_regularly', health_flag: null },
      { participant_id: 'EMP013', date: DATE, confident_health: false, body_trending_good: false, energy_level: 2, rest_quality: 2, stress_level: 5, physical_activity: ['none'], mental_wellbeing: 2, program_supported: 'neutral', whoop_reviewed: 'yes_once', health_flag: 'Recovery and energy have declined for several weeks.' },
      { participant_id: 'EMP014', date: DATE, confident_health: false, body_trending_good: false, energy_level: 1, rest_quality: 1, stress_level: 5, physical_activity: ['none'], mental_wellbeing: 1, program_supported: 'no', whoop_reviewed: 'no', health_flag: 'Reports persistent fatigue and poor sleep.' },
      { participant_id: 'EMP021', date: shiftIsoDate(DATE, -7), confident_health: false, body_trending_good: false, energy_level: 2, rest_quality: 2, stress_level: 4, physical_activity: ['outside'], mental_wellbeing: 2, program_supported: 'neutral', whoop_reviewed: 'no', health_flag: 'Missed this week’s check-in; prior week reported increasing fatigue.' },
      { participant_id: 'EMP023', date: DATE, confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: ['outside'], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    ], { onConflict: 'participant_id,date' })
  if (pulseErr) { console.error('Pulse:', pulseErr); process.exit(1) }
  console.log('✅ Pulse surveys seeded')

  // ── Interventions ──────────────────────────────────────────────────────────
  const interventions = [
    { id: 'da000000-0000-4000-8000-000000000001', participant_id: 'EMP008', date_triggered: DATE, department: 'ICU',
      trigger_metric: 'Recovery Score', trigger_value: '38',
      intervention_type: '1:1 Wellness Check-in', assigned_to: 'Wellness Director',
      outcome: 'Pending', notes: 'Reached out to schedule a check-in. Flagged by WHOOP data — low recovery trend over 3 weeks.' },
    { id: 'da000000-0000-4000-8000-000000000002', participant_id: 'EMP005', date_triggered: DATE, department: 'Night Shift',
      trigger_metric: 'Sleep Debt', trigger_value: '2.2 hrs',
      intervention_type: 'Sleep Hygiene Campaign', assigned_to: 'Wellness Director',
      outcome: 'Pending', notes: 'Discussed sleep hygiene on last call. Following up with resources this week.' },
    { id: 'da000000-0000-4000-8000-000000000003', participant_id: 'EMP010', date_triggered: shiftIsoDate(DATE, -30), department: 'Surgery',
      trigger_metric: 'Recovery Score', trigger_value: '52',
      intervention_type: 'Recovery Program', assigned_to: 'Wellness Director',
      outcome: 'In Progress', notes: 'Recovery trending up since program start. Will reassess at week 4 check-in.' },
    { id: 'da000000-0000-4000-8000-000000000004', participant_id: 'EMP004', date_triggered: shiftIsoDate(DATE, -21), department: 'Surgery',
      trigger_metric: 'Day Strain', trigger_value: '11.9',
      intervention_type: 'Manager Coaching', assigned_to: 'Dept Manager',
      outcome: 'Monitoring', notes: 'Spoke with dept manager. Monitoring weekly — strain appears workload-related.' },
    { id: 'da000000-0000-4000-8000-000000000005', participant_id: 'EMP013', date_triggered: shiftIsoDate(DATE, -14), date_actioned: shiftIsoDate(DATE, -12), date_resolved: shiftIsoDate(DATE, -7), department: 'ICU',
      trigger_metric: 'Recovery Score', trigger_value: '46',
      intervention_type: '1:1 Wellness Check-in', assigned_to: 'Wellness Director',
      outcome: 'Resolved', notes: 'Completed check-in; participant is trying a consistent sleep routine.' },
    { id: 'da000000-0000-4000-8000-000000000006', participant_id: 'EMP014', date_triggered: shiftIsoDate(DATE, -3), department: 'Surgery',
      trigger_metric: 'Sleep Performance', trigger_value: '39',
      intervention_type: 'Manager Coaching', assigned_to: 'Dept Manager',
      outcome: 'Pending', notes: 'Escalated for a supportive check-in; avoid presenting this synthetic flag as a diagnosis.' },
    { id: 'da000000-0000-4000-8000-000000000007', participant_id: 'EMP016', date_triggered: DATE, department: 'Cardiology',
      trigger_metric: 'Enrollment', trigger_value: '7 days',
      intervention_type: 'New Participant Welcome', assigned_to: 'Wellness Director',
      outcome: 'In Progress', notes: 'Welcome workflow is in progress for a recently enrolled participant.' },
  ]

  const { error: intErr } = await supabase
    .from('interventions')
    .upsert(interventions, { onConflict: 'id' })
  if (intErr) { console.error('Interventions:', intErr); process.exit(1) }
  console.log('✅ Interventions seeded')

  // ── Engagement score weights (global defaults) ────────────────────────────
  const weights = [
    { organization_id: null, weight_name: 'login_frequency_weight',         weight_value: 0.20 },
    { organization_id: null, weight_name: 'pulse_survey_completion_weight',  weight_value: 0.25 },
    { organization_id: null, weight_name: 'data_submission_weight',          weight_value: 0.25 },
    { organization_id: null, weight_name: 'intervention_follow_up_weight',   weight_value: 0.15 },
    { organization_id: null, weight_name: 'trend_consistency_weight',        weight_value: 0.15 },
  ]
  if ((process.env.VOILOOP_ENV ?? '').toLowerCase() !== 'demo') {
    const { error: weightsErr } = await supabase
      .from('engagement_score_weights')
      .upsert(weights, { onConflict: 'organization_id,weight_name' })
    if (weightsErr) { console.error('Engagement weights:', weightsErr); process.exit(1) }
    console.log('✅ Engagement score weights seeded')
  } else {
    console.log('✅ Existing demo engagement score configuration preserved')
  }

  // ── Events ────────────────────────────────────────────────────────────────
  const events = [
    { id: 'de000000-0000-4000-8000-000000000001', title: 'Group Hike — Foothills Trail', description: 'Meet at the trailhead parking lot. All fitness levels welcome.',
      event_date: shiftIsoDate(DATE, 8), event_time: '7:00 AM', location: 'Foothills Trail, Boise ID',
      event_type: 'outdoor', recurring: false, recurrence: null, rsvp_enabled: true },
    { id: 'de000000-0000-4000-8000-000000000002', title: 'Lunchtime Yoga', description: '30-minute guided yoga session in the breakroom.',
      event_date: shiftIsoDate(DATE, 3), event_time: '12:00 PM', location: 'Breakroom B',
      event_type: 'fitness', recurring: true, recurrence: 'weekly', rsvp_enabled: false },
    { id: 'de000000-0000-4000-8000-000000000003', title: 'Hospital 5K Fun Run', description: 'Annual charity 5K around the hospital campus.',
      event_date: shiftIsoDate(DATE, 21), event_time: '8:00 AM', location: 'Hospital Main Campus',
      event_type: 'race', recurring: false, recurrence: null, rsvp_enabled: true },
  ]
  const { error: eventsErr } = await supabase
    .from('events')
    .upsert(events, { onConflict: 'id' })
  if (eventsErr) { console.error('Events:', eventsErr); process.exit(1) }
  console.log('✅ Events seeded')

  // ── Weekly nudge ──────────────────────────────────────────────────────────
  // NOTE: weekly_nudges no longer has a unique constraint on week_of (dropped in
  // 20260811040000_harden_nudge_history_and_access.sql to preserve nudge history
  // across republishes/targeting), so this can't be a plain upsert keyed on
  // week_of. Find-or-update the most recent row for WEEK_OF instead, then insert
  // a matching nudge_targets row (target_type='all') so participants actually
  // see the seeded nudge — the app resolves visibility via nudge_targets, not
  // weekly_nudges alone.
  const nudgeFields = {
    message: 'Great work this week, team. Remember: small consistent habits compound over time. Even 10 minutes of movement today counts. You\'ve got this. 💪',
    author: 'Demo Wellness Director',
    response_due_at: `${shiftIsoDate(DATE, 7)}T23:59:00Z`,
  }

  const { data: existingNudge, error: existingNudgeErr } = await supabase
    .from('weekly_nudges')
    .select('id')
    .eq('week_of', WEEK_OF)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingNudgeErr) { console.error('Weekly nudge lookup:', existingNudgeErr); process.exit(1) }

  let nudgeId: string
  if (existingNudge) {
    const { error: updateErr } = await supabase
      .from('weekly_nudges')
      .update(nudgeFields)
      .eq('id', existingNudge.id)
    if (updateErr) { console.error('Weekly nudge update:', updateErr); process.exit(1) }
    nudgeId = existingNudge.id
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('weekly_nudges')
      .insert({ week_of: WEEK_OF, ...nudgeFields })
      .select('id')
      .single()
    if (insertErr) { console.error('Weekly nudge insert:', insertErr); process.exit(1) }
    nudgeId = inserted.id
  }

  // nudge_targets' unique constraint includes nullable participant_id, and
  // Postgres treats NULL as distinct from NULL in a plain unique constraint, so
  // upsert-by-onConflict never matches the existing 'all' target row and every
  // reseed would insert a duplicate. Look the row up explicitly first instead.
  const { data: existingTarget, error: existingTargetErr } = await supabase
    .from('nudge_targets')
    .select('id')
    .eq('nudge_id', nudgeId)
    .eq('target_type', 'all')
    .eq('target_label', '')
    .is('participant_id', null)
    .maybeSingle()
  if (existingTargetErr) { console.error('Weekly nudge target lookup:', existingTargetErr); process.exit(1) }

  if (!existingTarget) {
    const { error: nudgeTargetErr } = await supabase
      .from('nudge_targets')
      .insert({ nudge_id: nudgeId, target_type: 'all', target_label: '', participant_id: null })
    if (nudgeTargetErr) { console.error('Weekly nudge target:', nudgeTargetErr); process.exit(1) }
  }
  console.log('✅ Weekly nudge seeded')

  console.log('\n🎉 VOILoop database seeded successfully!')
  console.log('   Synthetic profile (EMP001)   — devon@voiloop.local / Pilot1234')
  console.log('   Test login (EMP005)          — test1@user.com / Password!')
  console.log(`   ${participantDefs.length - 2} other participants — <participant-id>@voiloop.local / Pilot1234`)
  console.log('   7 interventions             — pending, in progress, monitoring, resolved')
  console.log('   engagement_score_weights    — existing demo config retained; local defaults seeded')
  console.log('   events + weekly nudge       — sample data seeded')
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
}
