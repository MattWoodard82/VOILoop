import { createClient } from './client'
import type {
  Employee, DailyWellness, Workout, Habit,
  PulseSurvey, Intervention, EmployeeWithWellness, TeamStats,
  RiskLevel, RecoveryStatus,
} from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getRecoveryStatus(score: number | null): RecoveryStatus {
  if (!score) return 'yellow'
  if (score >= 67) return 'green'
  if (score >= 34) return 'yellow'
  return 'red'
}

export function getRiskLevel(score: number | null, sleepDebt: number | null): RiskLevel {
  if (!score) return 'Medium'
  if (score < 34 || (sleepDebt ?? 0) > 2) return 'High'
  if (score < 67 || (sleepDebt ?? 0) > 1) return 'Medium'
  return 'Low'
}

export function avg(nums: (number | null)[]): number {
  const valid = nums.filter((n): n is number => n !== null)
  if (!valid.length) return 0
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

// ─── Employees ───────────────────────────────────────────────────────────────

export async function getEmployees(): Promise<Employee[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'Active')
    .order('last_name')
  if (error) throw error
  return data ?? []
}

// ─── Daily Wellness ───────────────────────────────────────────────────────────

export async function getLatestWellness(date?: string): Promise<DailyWellness[]> {
  const supabase = createClient()
  let query = supabase
    .from('daily_wellness')
    .select('*')
    .order('date', { ascending: false })

  if (date) {
    query = query.eq('date', date)
  } else {
    // Get the most recent date available
    const { data: latestDate } = await supabase
      .from('daily_wellness')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (latestDate) {
      query = query.eq('date', latestDate.date)
    }
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getWellnessTrend(
  employeeId: string,
  days: number = 30
): Promise<DailyWellness[]> {
  const supabase = createClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('daily_wellness')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getTeamWellnessTrend(months: number = 5): Promise<
  { month: string; avg_recovery: number }[]
> {
  const supabase = createClient()
  const since = new Date()
  since.setMonth(since.getMonth() - months)

  const { data, error } = await supabase
    .from('daily_wellness')
    .select('date, recovery_score')
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) throw error

  // Group by month and average
  const byMonth: Record<string, number[]> = {}
  ;(data ?? []).forEach((row) => {
    const month = row.date.slice(0, 7) // YYYY-MM
    if (!byMonth[month]) byMonth[month] = []
    if (row.recovery_score) byMonth[month].push(row.recovery_score)
  })

  return Object.entries(byMonth).map(([month, scores]) => ({
    month,
    avg_recovery: avg(scores),
  }))
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export async function getLatestWorkouts(date?: string): Promise<Workout[]> {
  const supabase = createClient()
  let q = supabase.from('workouts').select('*').order('date', { ascending: false })
  if (date) q = q.eq('date', date)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// ─── Habits ──────────────────────────────────────────────────────────────────

export async function getLatestHabits(date?: string): Promise<Habit[]> {
  const supabase = createClient()
  let q = supabase.from('habits').select('*').order('date', { ascending: false })
  if (date) q = q.eq('date', date)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// ─── Pulse Surveys ───────────────────────────────────────────────────────────

export async function getLatestPulse(): Promise<PulseSurvey[]> {
  const supabase = createClient()
  const { data: latestDate } = await supabase
    .from('pulse_surveys')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!latestDate) return []

  const { data, error } = await supabase
    .from('pulse_surveys')
    .select('*')
    .eq('date', latestDate.date)

  if (error) throw error
  return data ?? []
}

export async function getPulseTrend(): Promise<
  { date: string; avg_wellbeing: number; avg_burnout: number }[]
> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('pulse_surveys')
    .select('date, wellbeing_score, burnout_score')
    .order('date', { ascending: true })

  if (error) throw error

  const byDate: Record<string, { w: number[]; b: number[] }> = {}
  ;(data ?? []).forEach((row) => {
    if (!byDate[row.date]) byDate[row.date] = { w: [], b: [] }
    if (row.wellbeing_score) byDate[row.date].w.push(row.wellbeing_score)
    if (row.burnout_score) byDate[row.date].b.push(row.burnout_score)
  })

  return Object.entries(byDate).map(([date, v]) => ({
    date,
    avg_wellbeing: avg(v.w),
    avg_burnout: avg(v.b),
  }))
}

// ─── Interventions ───────────────────────────────────────────────────────────

export async function getInterventions(status?: string): Promise<Intervention[]> {
  const supabase = createClient()
  let q = supabase
    .from('interventions')
    .select('*')
    .order('date_triggered', { ascending: false })

  if (status) q = q.eq('outcome', status)

  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createIntervention(
  intervention: Omit<Intervention, 'id'>
): Promise<Intervention> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interventions')
    .insert(intervention)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIntervention(
  id: string,
  updates: Partial<Intervention>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('interventions')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

// ─── Combined team view ───────────────────────────────────────────────────────

export async function getTeamDashboard(): Promise<{
  employees: EmployeeWithWellness[]
  stats: TeamStats
}> {
  const [employees, wellness, workouts, habits, pulse] = await Promise.all([
    getEmployees(),
    getLatestWellness(),
    getLatestWorkouts(),
    getLatestHabits(),
    getLatestPulse(),
  ])

  const wellnessMap = Object.fromEntries(wellness.map((w) => [w.employee_id, w]))
  const workoutMap = Object.fromEntries(workouts.map((w) => [w.employee_id, w]))
  const habitsMap = Object.fromEntries(habits.map((h) => [h.employee_id, h]))
  const pulseMap = Object.fromEntries(pulse.map((p) => [p.employee_id, p]))

  const enriched: EmployeeWithWellness[] = employees.map((emp) => {
    const w = wellnessMap[emp.id] ?? null
    return {
      ...emp,
      latest_wellness: w,
      latest_workout: workoutMap[emp.id] ?? null,
      latest_habits: habitsMap[emp.id] ?? null,
      latest_pulse: pulseMap[emp.id] ?? null,
      risk_level: getRiskLevel(w?.recovery_score ?? null, w?.sleep_debt ?? null),
      recovery_status: getRecoveryStatus(w?.recovery_score ?? null),
    }
  })

  const recoveries = enriched.map((e) => e.latest_wellness?.recovery_score ?? null)
  const hrvs = enriched.map((e) => e.latest_wellness?.hrv_ms ?? null)
  const sleeps = enriched.map((e) => e.latest_wellness?.sleep_perf ?? null)
  const pulseResponded = pulse.length

  const stats: TeamStats = {
    avg_recovery: avg(recoveries),
    avg_hrv: avg(hrvs),
    avg_sleep_perf: avg(sleeps),
    high_risk_count: enriched.filter((e) => e.risk_level === 'High').length,
    total_employees: employees.length,
    participation_rate: Math.round((pulseResponded / employees.length) * 100),
  }

  return { employees: enriched, stats }
}
