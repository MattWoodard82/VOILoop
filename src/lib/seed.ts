/**
 * VOILoop seed script
 * Run: npm run db:seed
 * Inserts Travis Brandenburgh's exact WHOOP data + 9 generated team members
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DATE = '2026-06-09'

async function seed() {
  console.log('🌱 Seeding VOILoop database...')

  // ── Employees ──────────────────────────────────────────────────────────────
  const employees = [
    // Travis — exact data, COO
    { id: 'EMP001', first_name: 'Travis', last_name: 'Brandenburgh',
      department: 'Manager', title: 'COO', device_id: 'WHP-001',
      consent: true, enrolled_date: '2026-01-15', status: 'Active', is_exact_data: true },
    { id: 'EMP002', first_name: 'Tina', last_name: 'Turley',
      department: 'Pediatrics', title: 'Pediatric Nurse', device_id: 'WHP-002',
      consent: true, enrolled_date: '2026-01-15', status: 'Active', is_exact_data: false },
    { id: 'EMP003', first_name: 'Nicole', last_name: 'Revis',
      department: 'Cardiology', title: 'Cardio Nurse', device_id: 'WHP-003',
      consent: true, enrolled_date: '2026-02-01', status: 'Active', is_exact_data: false },
    { id: 'EMP004', first_name: 'Kyle', last_name: 'Schuppan',
      department: 'Surgery', title: 'Surgical Tech', device_id: 'WHP-004',
      consent: true, enrolled_date: '2026-02-01', status: 'Active', is_exact_data: false },
    { id: 'EMP005', first_name: 'Colin', last_name: 'Stephenson',
      department: 'Night Shift', title: 'RN', device_id: 'WHP-005',
      consent: true, enrolled_date: '2026-02-15', status: 'Active', is_exact_data: false },
    { id: 'EMP006', first_name: 'Franklin', last_name: 'Turley',
      department: 'Oncology', title: 'Oncology RN', device_id: 'WHP-006',
      consent: true, enrolled_date: '2026-03-01', status: 'Active', is_exact_data: false },
    { id: 'EMP007', first_name: 'David', last_name: 'Rosamond',
      department: 'Admin', title: 'HR Coordinator', device_id: 'WHP-007',
      consent: true, enrolled_date: '2026-03-01', status: 'Active', is_exact_data: false },
    { id: 'EMP008', first_name: 'Dzenan', last_name: 'Blambic',
      department: 'ICU', title: 'ICU Nurse', device_id: 'WHP-008',
      consent: true, enrolled_date: '2026-03-15', status: 'Active', is_exact_data: false },
    { id: 'EMP009', first_name: 'Eddie', last_name: 'Rediske',
      department: 'Emergency Dept', title: 'ER Tech', device_id: 'WHP-009',
      consent: true, enrolled_date: '2026-04-01', status: 'Active', is_exact_data: false },
    { id: 'EMP010', first_name: 'Caleb', last_name: 'Stone',
      department: 'Surgery', title: 'Surgical RN', device_id: 'WHP-010',
      consent: true, enrolled_date: '2026-04-01', status: 'Active', is_exact_data: false },
  ]

  const { error: empErr } = await supabase
    .from('employees')
    .upsert(employees, { onConflict: 'id' })
  if (empErr) { console.error('Employees:', empErr); process.exit(1) }
  console.log('✅ Employees seeded')

  // ── Daily Wellness ─────────────────────────────────────────────────────────
  // EMP001 = Travis exact WHOOP data from Excel
  const wellness = [
    { employee_id: 'EMP001', date: DATE, recovery_score: 72, hrv_ms: 37, resting_hr: 63,
      blood_oxygen: 94.6, skin_temp: 33.0, day_strain: 10.4, calories: 2100,
      sleep_perf: 89, sleep_hrs: 7.4, sleep_debt: 0.5, sleep_need: 8.2,
      deep_sleep: 1.8, rem_sleep: 1.7, light_sleep: 3.9,
      sleep_eff: 97, sleep_consistency: 82, resp_rate: 15.2 },
    { employee_id: 'EMP002', date: DATE, recovery_score: 71, hrv_ms: 38, resting_hr: 65,
      blood_oxygen: 94.2, skin_temp: 33.1, day_strain: 9.3, calories: 1960,
      sleep_perf: 82, sleep_hrs: 7.2, sleep_debt: 0.7, sleep_need: 8.1,
      deep_sleep: 1.7, rem_sleep: 1.6, light_sleep: 3.9,
      sleep_eff: 93, sleep_consistency: 78, resp_rate: 15.4 },
    { employee_id: 'EMP003', date: DATE, recovery_score: 82, hrv_ms: 51, resting_hr: 59,
      blood_oxygen: 95.1, skin_temp: 32.8, day_strain: 8.4, calories: 1870,
      sleep_perf: 91, sleep_hrs: 7.8, sleep_debt: 0.1, sleep_need: 8.0,
      deep_sleep: 2.1, rem_sleep: 1.9, light_sleep: 3.8,
      sleep_eff: 97, sleep_consistency: 87, resp_rate: 14.7 },
    { employee_id: 'EMP004', date: DATE, recovery_score: 68, hrv_ms: 39, resting_hr: 64,
      blood_oxygen: 93.9, skin_temp: 33.3, day_strain: 11.9, calories: 2320,
      sleep_perf: 79, sleep_hrs: 7.1, sleep_debt: 0.9, sleep_need: 8.3,
      deep_sleep: 1.5, rem_sleep: 1.4, light_sleep: 4.2,
      sleep_eff: 91, sleep_consistency: 74, resp_rate: 15.7 },
    { employee_id: 'EMP005', date: DATE, recovery_score: 42, hrv_ms: 24, resting_hr: 76,
      blood_oxygen: 92.8, skin_temp: 34.0, day_strain: 15.3, calories: 2490,
      sleep_perf: 62, sleep_hrs: 5.9, sleep_debt: 2.2, sleep_need: 8.6,
      deep_sleep: 0.9, rem_sleep: 1.0, light_sleep: 4.0,
      sleep_eff: 86, sleep_consistency: 57, resp_rate: 16.9 },
    { employee_id: 'EMP006', date: DATE, recovery_score: 74, hrv_ms: 42, resting_hr: 63,
      blood_oxygen: 94.4, skin_temp: 33.0, day_strain: 9.7, calories: 2010,
      sleep_perf: 84, sleep_hrs: 7.4, sleep_debt: 0.5, sleep_need: 8.1,
      deep_sleep: 1.8, rem_sleep: 1.7, light_sleep: 3.9,
      sleep_eff: 95, sleep_consistency: 81, resp_rate: 15.3 },
    { employee_id: 'EMP007', date: DATE, recovery_score: 84, hrv_ms: 54, resting_hr: 57,
      blood_oxygen: 95.3, skin_temp: 32.7, day_strain: 7.1, calories: 1780,
      sleep_perf: 93, sleep_hrs: 7.9, sleep_debt: 0.0, sleep_need: 8.0,
      deep_sleep: 2.2, rem_sleep: 2.0, light_sleep: 3.7,
      sleep_eff: 98, sleep_consistency: 88, resp_rate: 14.5 },
    { employee_id: 'EMP008', date: DATE, recovery_score: 38, hrv_ms: 22, resting_hr: 79,
      blood_oxygen: 92.4, skin_temp: 34.2, day_strain: 17.1, calories: 2710,
      sleep_perf: 64, sleep_hrs: 6.0, sleep_debt: 2.4, sleep_need: 8.7,
      deep_sleep: 0.8, rem_sleep: 1.0, light_sleep: 4.2,
      sleep_eff: 85, sleep_consistency: 54, resp_rate: 17.3 },
    { employee_id: 'EMP009', date: DATE, recovery_score: 66, hrv_ms: 37, resting_hr: 67,
      blood_oxygen: 93.7, skin_temp: 33.2, day_strain: 12.2, calories: 2290,
      sleep_perf: 77, sleep_hrs: 7.0, sleep_debt: 1.0, sleep_need: 8.2,
      deep_sleep: 1.4, rem_sleep: 1.3, light_sleep: 4.3,
      sleep_eff: 90, sleep_consistency: 71, resp_rate: 16.0 },
    { employee_id: 'EMP010', date: DATE, recovery_score: 66, hrv_ms: 36, resting_hr: 68,
      blood_oxygen: 93.5, skin_temp: 33.4, day_strain: 13.1, calories: 2410,
      sleep_perf: 74, sleep_hrs: 6.8, sleep_debt: 1.3, sleep_need: 8.3,
      deep_sleep: 1.2, rem_sleep: 1.2, light_sleep: 4.4,
      sleep_eff: 89, sleep_consistency: 67, resp_rate: 16.4 },
  ]

  const { error: wellErr } = await supabase
    .from('daily_wellness')
    .upsert(wellness, { onConflict: 'employee_id,date' })
  if (wellErr) { console.error('Wellness:', wellErr); process.exit(1) }
  console.log('✅ Daily wellness seeded')

  // ── Workouts ───────────────────────────────────────────────────────────────
  const workouts = [
    { employee_id: 'EMP001', date: DATE, start_time: `${DATE}T06:15:00Z`, end_time: `${DATE}T06:50:00Z`, activity: 'Running', duration_min: 35,
      strain: 9.2, calories: 320, max_hr: 172, avg_hr: 138,
      zone1_pct: 30, zone2_pct: 22, zone3_pct: 18, zone4_pct: 20, zone5_pct: 10 },
    { employee_id: 'EMP002', date: DATE, start_time: `${DATE}T05:50:00Z`, end_time: `${DATE}T06:32:00Z`, activity: 'Yoga', duration_min: 42,
      strain: 4.2, calories: 158, max_hr: 124, avg_hr: 96,
      zone1_pct: 80, zone2_pct: 14, zone3_pct: 4, zone4_pct: 2, zone5_pct: 0 },
    { employee_id: 'EMP003', date: DATE, start_time: `${DATE}T07:00:00Z`, end_time: `${DATE}T07:48:00Z`, activity: 'Weightlifting', duration_min: 48,
      strain: 8.7, calories: 272, max_hr: 159, avg_hr: 109,
      zone1_pct: 47, zone2_pct: 15, zone3_pct: 18, zone4_pct: 15, zone5_pct: 5 },
    { employee_id: 'EMP004', date: DATE, start_time: `${DATE}T11:10:00Z`, end_time: `${DATE}T12:05:00Z`, activity: 'Cycling', duration_min: 55,
      strain: 11.8, calories: 458, max_hr: 177, avg_hr: 147,
      zone1_pct: 21, zone2_pct: 18, zone3_pct: 22, zone4_pct: 27, zone5_pct: 12 },
    { employee_id: 'EMP005', date: DATE, start_time: `${DATE}T10:20:00Z`, end_time: `${DATE}T10:38:00Z`, activity: 'Walking', duration_min: 18,
      strain: 3.1, calories: 88, max_hr: 142, avg_hr: 109,
      zone1_pct: 66, zone2_pct: 21, zone3_pct: 10, zone4_pct: 3, zone5_pct: 0 },
    { employee_id: 'EMP006', date: DATE, start_time: `${DATE}T06:40:00Z`, end_time: `${DATE}T07:16:00Z`, activity: 'Running', duration_min: 36,
      strain: 9.1, calories: 316, max_hr: 170, avg_hr: 137,
      zone1_pct: 31, zone2_pct: 23, zone3_pct: 17, zone4_pct: 20, zone5_pct: 9 },
    { employee_id: 'EMP007', date: DATE, start_time: `${DATE}T17:20:00Z`, end_time: `${DATE}T18:05:00Z`, activity: 'Yoga', duration_min: 45,
      strain: 4.7, calories: 160, max_hr: 121, avg_hr: 94,
      zone1_pct: 83, zone2_pct: 13, zone3_pct: 4, zone4_pct: 0, zone5_pct: 0 },
    { employee_id: 'EMP009', date: DATE, start_time: `${DATE}T08:10:00Z`, end_time: `${DATE}T08:54:00Z`, activity: 'Weightlifting', duration_min: 44,
      strain: 8.3, calories: 260, max_hr: 161, avg_hr: 110,
      zone1_pct: 46, zone2_pct: 15, zone3_pct: 19, zone4_pct: 15, zone5_pct: 5 },
    { employee_id: 'EMP010', date: DATE, start_time: `${DATE}T05:40:00Z`, end_time: `${DATE}T06:10:00Z`, activity: 'Running', duration_min: 30,
      strain: 7.9, calories: 267, max_hr: 168, avg_hr: 134,
      zone1_pct: 33, zone2_pct: 24, zone3_pct: 18, zone4_pct: 18, zone5_pct: 7 },
  ]

  const { error: woErr } = await supabase
    .from('workouts')
    .upsert(workouts, { onConflict: 'employee_id,start_time' })
  if (woErr) { console.error('Workouts:', woErr); process.exit(1) }
  console.log('✅ Workouts seeded')

  // ── Habits ─────────────────────────────────────────────────────────────────
  const habits = [
    { employee_id: 'EMP001', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: false, theanine: false, creatine: true,
      ashwagandha: false, tracked_calories: true, dimmed_lights: true, read_before_bed: false,
      notes: null },
    { employee_id: 'EMP002', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: true, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: true,
      notes: null },
    { employee_id: 'EMP003', date: DATE, alcohol: false, caffeine: false, ate_late: false,
      hydrated: true, protein: true, magnesium: true, theanine: true, creatine: false,
      ashwagandha: true, tracked_calories: true, dimmed_lights: true, read_before_bed: true,
      notes: null },
    { employee_id: 'EMP004', date: DATE, alcohol: false, caffeine: true, ate_late: true,
      hydrated: true, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: 'Ate late after double shift' },
    { employee_id: 'EMP005', date: DATE, alcohol: true, caffeine: true, ate_late: true,
      hydrated: false, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: '3rd consecutive poor sleep. Alcohol logged.' },
    { employee_id: 'EMP006', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: false, theanine: false, creatine: true,
      ashwagandha: false, tracked_calories: true, dimmed_lights: false, read_before_bed: false,
      notes: null },
    { employee_id: 'EMP007', date: DATE, alcohol: false, caffeine: false, ate_late: false,
      hydrated: true, protein: true, magnesium: true, theanine: true, creatine: false,
      ashwagandha: true, tracked_calories: true, dimmed_lights: true, read_before_bed: true,
      notes: null },
    { employee_id: 'EMP008', date: DATE, alcohol: true, caffeine: true, ate_late: true,
      hydrated: false, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: 'Chronic low recovery. Immediate 1:1 required.' },
    { employee_id: 'EMP009', date: DATE, alcohol: false, caffeine: true, ate_late: false,
      hydrated: true, protein: true, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: null },
    { employee_id: 'EMP010', date: DATE, alcohol: false, caffeine: true, ate_late: true,
      hydrated: true, protein: false, magnesium: false, theanine: false, creatine: false,
      ashwagandha: false, tracked_calories: false, dimmed_lights: false, read_before_bed: false,
      notes: 'Intervention in progress. Recovery improving 52→66.' },
  ]

  const { error: habErr } = await supabase
    .from('habits')
    .upsert(habits, { onConflict: 'employee_id,date' })
  if (habErr) { console.error('Habits:', habErr); process.exit(1) }
  console.log('✅ Habits seeded')

  // ── Pulse Surveys ──────────────────────────────────────────────────────────
  const pulse = [
    { employee_id: 'EMP001', date: DATE, wellbeing_score: 7.4, burnout_score: 3.6,
      manager_support: 8.0, energy_score: 7.2, psych_safety: 8.1,
      workload_score: 6.8, work_life_balance: 7.0, recommend_score: 8.2 },
    { employee_id: 'EMP002', date: DATE, wellbeing_score: 6.9, burnout_score: 4.0,
      manager_support: 7.4, energy_score: 6.5, psych_safety: 7.2,
      workload_score: 5.8, work_life_balance: 6.4, recommend_score: 7.1 },
    { employee_id: 'EMP003', date: DATE, wellbeing_score: 7.8, burnout_score: 3.0,
      manager_support: 8.2, energy_score: 7.9, psych_safety: 8.4,
      workload_score: 7.1, work_life_balance: 7.6, recommend_score: 8.5 },
    { employee_id: 'EMP004', date: DATE, wellbeing_score: 6.3, burnout_score: 4.9,
      manager_support: 6.8, energy_score: 5.9, psych_safety: 6.5,
      workload_score: 4.8, work_life_balance: 5.6, recommend_score: 6.4 },
    { employee_id: 'EMP005', date: DATE, wellbeing_score: 4.1, burnout_score: 7.3,
      manager_support: 5.2, energy_score: 3.8, psych_safety: 5.0,
      workload_score: 3.2, work_life_balance: 3.6, recommend_score: 4.4 },
    { employee_id: 'EMP006', date: DATE, wellbeing_score: 7.0, burnout_score: 3.8,
      manager_support: 7.6, energy_score: 7.0, psych_safety: 7.4,
      workload_score: 6.2, work_life_balance: 6.8, recommend_score: 7.3 },
    { employee_id: 'EMP007', date: DATE, wellbeing_score: 8.1, burnout_score: 2.3,
      manager_support: 8.6, energy_score: 8.2, psych_safety: 8.8,
      workload_score: 7.8, work_life_balance: 8.0, recommend_score: 8.9 },
    { employee_id: 'EMP008', date: DATE, wellbeing_score: 3.6, burnout_score: 8.2,
      manager_support: 4.4, energy_score: 3.2, psych_safety: 4.1,
      workload_score: 2.8, work_life_balance: 3.0, recommend_score: 3.5 },
    { employee_id: 'EMP010', date: DATE, wellbeing_score: 5.8, burnout_score: 5.6,
      manager_support: 6.2, energy_score: 5.5, psych_safety: 6.0,
      workload_score: 4.6, work_life_balance: 5.2, recommend_score: 5.9 },
  ]

  const { error: pulseErr } = await supabase
    .from('pulse_surveys')
    .upsert(pulse, { onConflict: 'employee_id,date' })
  if (pulseErr) { console.error('Pulse:', pulseErr); process.exit(1) }
  console.log('✅ Pulse surveys seeded')

  // ── Interventions ──────────────────────────────────────────────────────────
  const interventions = [
    { employee_id: 'EMP008', date_triggered: DATE, department: 'ICU',
      trigger_metric: 'Recovery Score', trigger_value: '38',
      intervention_type: '1:1 Wellness Check-in', assigned_to: 'Wellness Director',
      outcome: 'Pending', notes: 'Chronic low recovery. Alcohol + late eating. Immediate review.' },
    { employee_id: 'EMP005', date_triggered: DATE, department: 'Night Shift',
      trigger_metric: 'Sleep Debt', trigger_value: '2.2 hrs',
      intervention_type: 'Sleep Hygiene Campaign', assigned_to: 'Wellness Director',
      outcome: 'Pending', notes: '3rd consecutive poor sleep night.' },
    { employee_id: 'EMP010', date_triggered: '2026-05-15', department: 'Surgery',
      trigger_metric: 'Recovery Score', trigger_value: '52',
      intervention_type: 'Recovery Program', assigned_to: 'Wellness Director',
      outcome: 'In Progress', notes: 'Recovery improving 52→66. Reassess at week 4.' },
    { employee_id: 'EMP004', date_triggered: '2026-05-20', department: 'Surgery',
      trigger_metric: 'Day Strain', trigger_value: '11.9',
      intervention_type: 'Manager Coaching', assigned_to: 'Dept Manager',
      outcome: 'Monitoring', notes: 'Elevated strain from double shifts.' },
  ]

  const { error: intErr } = await supabase
    .from('interventions')
    .upsert(interventions)
  if (intErr) { console.error('Interventions:', intErr); process.exit(1) }
  console.log('✅ Interventions seeded')

  console.log('\n🎉 VOILoop database seeded successfully!')
  console.log('   Travis Brandenburgh (EMP001) — exact WHOOP data locked in')
  console.log('   9 team members — generated data')
  console.log('   4 interventions — 2 pending, 1 in progress, 1 monitoring')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
