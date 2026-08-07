import { createClient } from './client'
import { createServerSupabaseClient } from './server'
import type {
  Participant, DailyWellness, Workout, Habit,
  PulseSurvey, Intervention, ParticipantWithWellness, TeamStats,
  RiskLevel, RecoveryStatus, ImportBatch, ImportRowOutcome,
  LoginActivity, RiskFlag, LeaderboardMetricSnapshot,
} from '@/types'

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

const WELLNESS_METRIC_FIELDS: Array<keyof DailyWellness> = [
  'recovery_score',
  'hrv_ms',
  'resting_hr',
  'blood_oxygen',
  'skin_temp',
  'day_strain',
  'calories',
  'sleep_perf',
  'sleep_hrs',
  'sleep_debt',
  'sleep_need',
  'deep_sleep',
  'rem_sleep',
  'light_sleep',
  'sleep_eff',
  'sleep_consistency',
  'resp_rate',
]

const WELLNESS_MEANINGFUL_FILTER = WELLNESS_METRIC_FIELDS
  .map((field) => `${field}.not.is.null`)
  .join(',')

export function hasMeaningfulWellnessData(row: Partial<DailyWellness> | null | undefined): boolean {
  return WELLNESS_METRIC_FIELDS.some((field) => row?.[field] !== null && row?.[field] !== undefined)
}

function getQueryClient() {
  try {
    return createServerSupabaseClient()
  } catch {
    return createClient()
  }
}

export async function getParticipants(): Promise<Participant[]> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('status', 'Active')
    .order('last_name')
  if (error) throw error
  return data ?? []
}

export async function getLatestWellness(date?: string, participantIds?: string[]): Promise<DailyWellness[]> {
  if (participantIds && participantIds.length === 0) return []

  const supabase = getQueryClient()
  if (date) {
    let datedQuery = supabase
      .from('daily_wellness')
      .select('*')
      .eq('date', date)
      .order('participant_id', { ascending: true })
      .order('id', { ascending: true })

    if (participantIds && participantIds.length > 0) {
      datedQuery = datedQuery.in('participant_id', participantIds)
    }

    const { data, error } = await datedQuery
    if (error) throw error
    return data ?? []
  }

  let targetParticipantIds = participantIds
  if (!targetParticipantIds || targetParticipantIds.length === 0) {
    const { data: participantRows, error: participantError } = await supabase
      .from('daily_wellness')
      .select('participant_id')
      .order('participant_id', { ascending: true })
    if (participantError) throw participantError

    const participantIdSet = new Set((participantRows ?? []).map((row) => row.participant_id))
    targetParticipantIds = Array.from(participantIdSet)
  }

  if (targetParticipantIds.length === 0) return []

  const latestRows = await Promise.all(targetParticipantIds.map(async (participantId) => {
    const meaningfulQuery = supabase
      .from('daily_wellness')
      .select('*')
      .eq('participant_id', participantId)
      .or(WELLNESS_MEANINGFUL_FILTER)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)

    const { data: meaningfulRows, error: meaningfulError } = await meaningfulQuery
    if (meaningfulError) throw meaningfulError
    if ((meaningfulRows ?? []).length > 0) {
      return meaningfulRows?.[0] ?? null
    }

    const { data: latestRows, error: latestError } = await supabase
      .from('daily_wellness')
      .select('*')
      .eq('participant_id', participantId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)

    if (latestError) throw latestError
    return latestRows?.[0] ?? null
  }))

  return latestRows.filter((row): row is DailyWellness => row !== null)
}

export async function getWellnessTrend(participantId: string, days: number = 30): Promise<DailyWellness[]> {
  const supabase = getQueryClient()
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data, error } = await supabase
    .from('daily_wellness')
    .select('*')
    .eq('participant_id', participantId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).filter((row) => hasMeaningfulWellnessData(row))
}

export async function getTeamWellnessTrend(months: number = 6): Promise<{ month: string; avg_recovery: number }[]> {
  const supabase = getQueryClient()
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const { data, error } = await supabase
    .from('daily_wellness')
    .select('participant_id, date, recovery_score')
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true })
  if (error) throw error

  // Build month → participantId → latest score (later dates overwrite earlier ones
  // because rows are ordered by date ASC). This matches the KPI methodology of one
  // score per participant rather than weighting heavy uploaders more.
  const byMonth: Record<string, Record<string, number>> = {}
  ;(data ?? []).forEach((row) => {
    if (row.recovery_score === null || row.recovery_score === undefined) return
    const month = row.date.slice(0, 7)
    if (!byMonth[month]) byMonth[month] = {}
    byMonth[month][row.participant_id] = row.recovery_score
  })

  return Object.entries(byMonth).map(([month, scoresByParticipant]) => ({
    month,
    avg_recovery: avg(Object.values(scoresByParticipant)),
  }))
}

export async function getLatestWorkouts(date?: string): Promise<Workout[]> {
  const supabase = getQueryClient()
  const buildQuery = (includeStartTimeSort: boolean) => {
    let q = supabase
      .from('workouts')
      .select('*')
      .order('date', { ascending: false })
    if (includeStartTimeSort) {
      q = q.order('start_time', { ascending: false })
    }
    if (date) q = q.eq('date', date)
    return q
  }

  const firstAttempt = await buildQuery(true)
  if (firstAttempt.error && isMissingStartTimeColumnError(firstAttempt.error)) {
    const fallbackAttempt = await buildQuery(false)
    if (fallbackAttempt.error) throw fallbackAttempt.error
    return fallbackAttempt.data ?? []
  }

  if (firstAttempt.error) throw firstAttempt.error
  return firstAttempt.data ?? []
}

function isMissingStartTimeColumnError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (
      message.includes('start_time') &&
      (
        message.includes('does not exist') ||
        message.includes('schema cache') ||
        message.includes('could not find')
      )
    )
  )
}

export async function getLatestHabits(date?: string): Promise<Habit[]> {
  const supabase = getQueryClient()
  let q = supabase.from('habits').select('*').order('date', { ascending: false })
  if (date) q = q.eq('date', date)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getLatestPulse(): Promise<PulseSurvey[]> {
  const supabase = getQueryClient()
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

export async function getPulseTrend(): Promise<{ date: string; avg_mental_wellbeing: number; avg_energy_level: number }[]> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('pulse_surveys')
    .select('date, mental_wellbeing, energy_level')
    .order('date', { ascending: true })
  if (error) throw error
  const byDate: Record<string, { w: number[]; e: number[] }> = {}
  ;(data ?? []).forEach((row) => {
    if (!byDate[row.date]) byDate[row.date] = { w: [], e: [] }
    if (row.mental_wellbeing) byDate[row.date].w.push(row.mental_wellbeing)
    if (row.energy_level) byDate[row.date].e.push(row.energy_level)
  })
  return Object.entries(byDate).map(([date, v]) => ({
    date,
    avg_mental_wellbeing: avg(v.w),
    avg_energy_level: avg(v.e),
  }))
}

export async function getInterventions(status?: string): Promise<Intervention[]> {
  const supabase = getQueryClient()
  let q = supabase
    .from('interventions')
    .select('*')
    .order('date_triggered', { ascending: false })
  if (status) q = q.eq('outcome', status)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createIntervention(intervention: Omit<Intervention, 'id'>): Promise<Intervention> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('interventions')
    .insert(intervention)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIntervention(id: string, updates: Partial<Intervention>): Promise<void> {
  const supabase = getQueryClient()
  const { error } = await supabase
    .from('interventions')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function getTeamDashboard(): Promise<{
  participants: ParticipantWithWellness[]
  stats: TeamStats
  interventions: Intervention[]
}> {
  const participants = await getParticipants()
  const participantIds = participants.map((participant) => participant.id)
  const [wellness, workouts, habits, pulse, interventions] = await Promise.all([
    getLatestWellness(undefined, participantIds),
    getLatestWorkouts(),
    getLatestHabits(),
    getLatestPulse(),
    getInterventions(),
  ])

  const wellnessMap = Object.fromEntries(wellness.map((w) => [w.participant_id, w]))
  const workoutMap = workouts.reduce<Record<string, Workout>>((map, workout) => {
    if (!map[workout.participant_id]) map[workout.participant_id] = workout
    return map
  }, {})
  const habitsMap = Object.fromEntries(habits.map((h) => [h.participant_id, h]))
  const pulseMap = Object.fromEntries(pulse.map((p) => [p.participant_id, p]))

  const enriched: ParticipantWithWellness[] = participants.map((emp) => {
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
    total_participants: participants.length,
    participation_rate: participants.length > 0
      ? Math.round((pulseResponded / participants.length) * 100)
      : 0,
  }

  return { participants: enriched, stats, interventions }
}

export async function getRecentImportBatches(limit: number = 20): Promise<ImportBatch[]> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('upload_batches')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getParticipantImportBatches(participantId: string, limit: number = 5): Promise<ImportBatch[]> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('upload_batches')
    .select('*')
    .eq('participant_id', participantId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getImportRowOutcomes(batchId: string): Promise<ImportRowOutcome[]> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('import_row_outcomes')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Scoring and engagement tracking queries
export async function getLoginActivityForWeek(
  participantId: string,
  weekStartDate: Date
): Promise<LoginActivity[]> {
  const supabase = getQueryClient()
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekEndDate.getDate() + 7)

  const { data, error } = await supabase
    .from('login_activity')
    .select('*')
    .eq('participant_id', participantId)
    .gte('logged_in_at', weekStartDate.toISOString())
    .lt('logged_in_at', weekEndDate.toISOString())
    .order('logged_in_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getWellnessDataForDateRange(
  participantId: string,
  startDate: Date,
  endDate: Date
): Promise<DailyWellness[]> {
  const supabase = getQueryClient()
  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_wellness')
    .select('*')
    .eq('participant_id', participantId)
    .gte('date', startDateStr)
    .lte('date', endDateStr)
    .order('date', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getPulseSurveyCountForDateRange(
  participantId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const supabase = getQueryClient()
  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const { count, error } = await supabase
    .from('pulse_surveys')
    .select('*', { count: 'exact' })
    .eq('participant_id', participantId)
    .gte('date', startDateStr)
    .lte('date', endDateStr)

  if (error) throw error
  return count ?? 0
}

export async function getRiskFlagsForParticipant(
  participantId: string,
  activeOnly: boolean = false
): Promise<RiskFlag[]> {
  const supabase = getQueryClient()
  let query = supabase
    .from('risk_flags')
    .select('*')
    .eq('participant_id', participantId)

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createRiskFlag(flag: Omit<RiskFlag, 'id' | 'created_at' | 'updated_at'>): Promise<RiskFlag> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('risk_flags')
    .insert(flag)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateRiskFlag(
  flagId: string,
  updates: Partial<RiskFlag>
): Promise<void> {
  const supabase = getQueryClient()
  const { error } = await supabase
    .from('risk_flags')
    .update(updates)
    .eq('id', flagId)

  if (error) throw error
}

export async function writeLoginActivity(
  participantId: string,
  loggedInAt: Date
): Promise<LoginActivity> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('login_activity')
    .insert({
      participant_id: participantId,
      logged_in_at: loggedInAt.toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getLeaderboardSnapshot(
  participantId: string,
  weekStartDate: Date
): Promise<LeaderboardMetricSnapshot | null> {
  const supabase = getQueryClient()
  const weekStartStr = weekStartDate.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('leaderboard_metric_snapshots')
    .select('*')
    .eq('participant_id', participantId)
    .eq('week_start_date', weekStartStr)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows found
  return data ?? null
}

export async function saveLeaderboardSnapshot(
  snapshot: Omit<LeaderboardMetricSnapshot, 'id' | 'created_at' | 'updated_at'>
): Promise<LeaderboardMetricSnapshot> {
  const supabase = getQueryClient()
  const { data, error } = await supabase
    .from('leaderboard_metric_snapshots')
    .upsert(snapshot, { onConflict: 'participant_id,week_start_date' })
    .select()
    .single()

  if (error) throw error
  return data
}
