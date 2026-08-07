import { createClient } from './client'
import { createServerSupabaseClient } from './server'
import type {
  Participant, DailyWellness, Workout, Habit,
  PulseSurvey, Intervention, ParticipantWithWellness, TeamStats,
  RiskLevel, RecoveryStatus, ImportBatch, ImportRowOutcome,
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
    const enrolledDays = emp.enrolled_date ? Math.floor((Date.now() - new Date(emp.enrolled_date).getTime()) / 86400000) : null
    const riskTriggers = [
      ...(w?.recovery_score != null && w.recovery_score < 34 ? ['Low recovery score'] : []),
      ...(w?.sleep_debt != null && w.sleep_debt > 2 ? ['Elevated sleep debt'] : []),
      ...(w?.day_strain != null && w.day_strain > 14 ? ['High day strain'] : []),
    ]
    return {
      ...emp,
      latest_wellness: w,
      latest_workout: workoutMap[emp.id] ?? null,
      latest_habits: habitsMap[emp.id] ?? null,
      latest_pulse: pulseMap[emp.id] ?? null,
      risk_level: getRiskLevel(w?.recovery_score ?? null, w?.sleep_debt ?? null),
      recovery_status: getRecoveryStatus(w?.recovery_score ?? null),
      engagement_score: w ? Math.round(((w.recovery_score ?? 0) * 0.35) + ((w.hrv_ms ?? 0) * 0.15) + ((w.sleep_perf ?? 0) * 0.25) + (Math.max(0, 100 - ((w.sleep_debt ?? 0) * 20)) * 0.25)) : null,
      engagement_score_components: w ? {
        recovery: Math.round((w.recovery_score ?? 0) * 0.35),
        hrv: Math.round((w.hrv_ms ?? 0) * 0.15),
        sleep: Math.round((w.sleep_perf ?? 0) * 0.25),
        debt_penalty: Math.round(Math.max(0, 100 - ((w.sleep_debt ?? 0) * 20)) * 0.25),
      } : null,
      physiological_trend: !w ? null : (w.hrv_ms != null && w.resting_hr != null && w.hrv_ms >= 65 && w.resting_hr <= 60 ? 'improving' : w.hrv_ms != null && w.resting_hr != null && w.hrv_ms < 50 && w.resting_hr > 65 ? 'declining' : 'steady'),
      physiological_trend_metrics: [
        ...(w?.hrv_ms != null ? ['HRV'] : []),
        ...(w?.resting_hr != null ? ['resting HR'] : []),
        ...(w?.resp_rate != null ? ['respiratory rate'] : []),
        ...(w?.blood_oxygen != null ? ['blood oxygen'] : []),
      ],
      risk_tier_label: riskTriggers.length > 1 ? 'High concern' : riskTriggers.length === 1 ? 'Watch' : 'Stable',
      risk_trigger_reasons: riskTriggers,
      baseline_state: enrolledDays != null && enrolledDays < 21 ? 'building' : 'ready',
      baseline_days_remaining: enrolledDays != null ? Math.max(0, 21 - enrolledDays) : null,
      override_state: null,
      override_note: null,
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
