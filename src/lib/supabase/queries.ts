import { createClient } from './client'
import { createAdminSupabaseClient } from './admin'
import { createServerSupabaseClient } from './server'
import { calculateEngagementScore } from '@/lib/scoring'
import type {
  Participant, DailyWellness, Workout, Habit,
  PulseSurvey, Intervention, ParticipantWithWellness, TeamStats, ParticipantRankContext, LeaderboardMetric,
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

function getPrivilegedQueryClient() {
  return createAdminSupabaseClient()
}

const DEFAULT_ENGAGEMENT_SCORE_WEIGHTS = {
  login_frequency_weight: 25,
  pulse_survey_completion_weight: 20,
  data_submission_weight: 25,
  intervention_follow_up_weight: 15,
  trend_consistency_weight: 15,
}

type EngagementScoreWeights = typeof DEFAULT_ENGAGEMENT_SCORE_WEIGHTS

async function getEngagementScoreWeights(supabase = getQueryClient()): Promise<EngagementScoreWeights> {
  const { data, error } = await supabase
    .from('engagement_score_weights')
    .select('weight_name, weight_value')
    .is('organization_id', null)

  if (error) {
    const message = (error.message ?? '').toLowerCase()
    if (error.code === 'PGRST205' || message.includes('engagement_score_weights')) {
      return DEFAULT_ENGAGEMENT_SCORE_WEIGHTS
    }
    throw error
  }

  const weights: EngagementScoreWeights = { ...DEFAULT_ENGAGEMENT_SCORE_WEIGHTS }
  for (const row of data ?? []) {
    if (!(row.weight_name in weights)) continue
    const value = Number(row.weight_value)
    if (Number.isFinite(value)) {
      weights[row.weight_name as keyof EngagementScoreWeights] = value
    }
  }

  return weights
}

export class ParticipantRankContextError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ParticipantRankContextError'
    this.status = status
  }
}

function getEnrolledDays(enrolledDate: string | null | undefined): number | null {
  if (!enrolledDate) return null

  const enrolledDay = enrolledDate.slice(0, 10)
  const enrolledUtc = new Date(`${enrolledDay}T00:00:00Z`)
  if (Number.isNaN(enrolledUtc.getTime())) return null

  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Math.floor((todayUtc.getTime() - enrolledUtc.getTime()) / 86400000)
}

export async function getParticipants(supabase = getQueryClient()): Promise<Participant[]> {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('status', 'Active')
    .order('last_name')
  if (error) throw error
  return data ?? []
}

export async function getLatestWellness(
  date?: string,
  participantIds?: string[],
  supabase = getQueryClient(),
): Promise<DailyWellness[]> {
  if (participantIds && participantIds.length === 0) return []
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

export async function getLatestWorkouts(date?: string, supabase = getQueryClient()): Promise<Workout[]> {
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

export async function getLatestHabits(date?: string, supabase = getQueryClient()): Promise<Habit[]> {
  let q = supabase.from('habits').select('*').order('date', { ascending: false })
  if (date) q = q.eq('date', date)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getLatestPulse(supabase = getQueryClient()): Promise<PulseSurvey[]> {
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
  const scoreWeights = await getEngagementScoreWeights()
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
    const enrolledDays = getEnrolledDays(emp.enrolled_date)
    const recentWellness = wellness.filter((row) => row.participant_id === emp.id).sort((a, b) => a.date.localeCompare(b.date)).slice(-21)
    const recentPulse = pulse.filter((row) => row.participant_id === emp.id)
    const recentWorkouts = workouts.filter((row) => row.participant_id === emp.id)
    const recentHabits = habits.filter((row) => row.participant_id === emp.id)
    const submissionConsistency = recentWellness.length > 0
      ? Math.round((recentWellness.filter((row) => row.recovery_score != null).length / recentWellness.length) * 100)
      : null
    const pulseCompletion = recentPulse.length > 0 ? 100 : 0
    const nudgeResponse = recentHabits.length > 0 ? Math.round((recentHabits.filter((row) => row.notes != null).length / recentHabits.length) * 100) : null
    const workoutVolume = recentWorkouts.length > 0 ? Math.min(100, Math.round((recentWorkouts.length / 3) * 100)) : null
    const engagementComponents: Record<string, number> = {
      login_frequency: Math.min(100, Math.round((recentWellness.length / 5) * 100)),
      pulse_survey_completion: pulseCompletion,
      data_submission: submissionConsistency ?? 0,
      intervention_follow_up: nudgeResponse ?? 0,
      trend_consistency: workoutVolume ?? 0,
    }
    const engagementScore = calculateEngagementScore(
      recentWellness.length,
      recentPulse.length,
      recentWellness.filter((row) => row.recovery_score != null).length,
      recentHabits.filter((row) => row.notes != null).length,
      workoutVolume ?? 0,
      scoreWeights,
    )
    const baselineState = enrolledDays != null && enrolledDays < 21 ? 'building' : 'ready'
    const trendCompare = (rows: DailyWellness[], field: keyof DailyWellness) => {
      const earlier = rows.slice(0, Math.max(1, rows.length - 7))
      const later = rows.slice(-7)
      return avg(later.map((row) => typeof row[field] === 'number' ? row[field] as number : null)) - avg(earlier.map((row) => typeof row[field] === 'number' ? row[field] as number : null))
    }
    const recoveryDelta = trendCompare(recentWellness, 'recovery_score')
    const hrvDelta = trendCompare(recentWellness, 'hrv_ms')
    const sleepDelta = trendCompare(recentWellness, 'sleep_perf')
    const decliningCount = [recoveryDelta, hrvDelta, sleepDelta].filter((delta) => delta < 0).length
    const physiologicalTrend: ParticipantWithWellness['physiological_trend'] = decliningCount >= 2 ? 'declining' : recoveryDelta > 0 && hrvDelta > 0 && sleepDelta > 0 ? 'improving' : 'steady'
    const physiologicalMetrics = [
      ...(recoveryDelta !== 0 ? [`Recovery ${recoveryDelta > 0 ? 'up' : 'down'}`] : []),
      ...(hrvDelta !== 0 ? [`HRV ${hrvDelta > 0 ? 'up' : 'down'}`] : []),
      ...(sleepDelta !== 0 ? [`Sleep performance ${sleepDelta > 0 ? 'up' : 'down'}`] : []),
    ]
    const zeroDataFor14Days = !w && enrolledDays != null && enrolledDays >= 14
    const riskTriggers = [
      ...(engagementScore.score < 35 ? ['Low engagement score'] : []),
      ...(physiologicalTrend === 'declining' ? ['Physiological trend declining'] : []),
      ...(zeroDataFor14Days ? ['No wellness data for 14 days'] : []),
    ]
    const riskLevel = zeroDataFor14Days || (engagementScore.score < 35 && physiologicalTrend === 'declining') ? 'High' : engagementScore.score < 65 || physiologicalTrend === 'declining' ? 'Medium' : 'Low'
    return {
      ...emp,
      latest_wellness: w,
      latest_workout: workoutMap[emp.id] ?? null,
      latest_habits: habitsMap[emp.id] ?? null,
      latest_pulse: pulseMap[emp.id] ?? null,
      risk_level: riskLevel,
      recovery_status: getRecoveryStatus(w?.recovery_score ?? null),
      engagement_score: engagementScore.score,
      engagement_score_components: engagementComponents,
      physiological_trend: physiologicalTrend,
      physiological_trend_metrics: physiologicalMetrics,
      risk_tier_label: riskLevel === 'High' ? 'High concern' : riskLevel === 'Medium' ? 'Watch' : 'Stable',
      risk_trigger_reasons: riskTriggers,
      baseline_state: baselineState,
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

function buildParticipantRankContext(
  metric: LeaderboardMetric,
  participantValue: number,
  rank: number,
  cohortSize: number,
  rankContext: { ahead: number; behind: number },
): ParticipantRankContext {
  const cohortPercentile = cohortSize > 0 ? Math.round(((cohortSize - rank + 1) / cohortSize) * 100) : 0
  const { ahead, behind } = rankContext
  const percentileLabel = cohortPercentile >= 90 ? 'Top 10%'
    : cohortPercentile >= 75 ? 'Top quartile'
      : cohortPercentile >= 50 ? 'Upper half'
        : cohortPercentile >= 25 ? 'Lower half'
          : 'Bottom quartile'
  const cohortBand = cohortPercentile >= 75 ? 'top' : cohortPercentile >= 40 ? 'middle' : 'bottom'

  const config: Record<LeaderboardMetric, { metric_label: string; metric_value_label: string; metric_description: string }> = {
    recovery: {
      metric_label: 'Recovery',
      metric_value_label: `${participantValue}`,
      metric_description: 'Higher recovery scores rank better.',
    },
    workouts_logged: {
      metric_label: 'Workouts logged',
      metric_value_label: `${participantValue}`,
      metric_description: 'More logged workouts rank better.',
    },
    points_earned: {
      metric_label: 'Points earned',
      metric_value_label: `${participantValue}`,
      metric_description: 'Higher point totals rank better.',
    },
    consistency_streak: {
      metric_label: 'Sleep consistency',
      metric_value_label: `${participantValue}`,
      metric_description: 'Higher sleep consistency scores rank better.',
    },
  }

  return {
    metric,
    participant_rank: rank,
    participant_value: participantValue,
    cohort_size: cohortSize,
    cohort_percentile: cohortPercentile,
    percentile_label: percentileLabel,
    comparison_text: `Ahead of ${ahead} participant${ahead === 1 ? '' : 's'}, behind ${behind}.`,
    metric_label: config[metric].metric_label,
    metric_value_label: config[metric].metric_value_label,
    metric_description: config[metric].metric_description,
    rank_context: { ahead, behind },
    cohort_band: cohortBand,
    safe_context_note: 'Only participant-facing rank context is returned; no peer identities are exposed.',
  }
}

export async function getParticipantRankContext(participantId: string, metric: LeaderboardMetric): Promise<ParticipantRankContext> {
  const supabase = getPrivilegedQueryClient()
  const participants = await getParticipants(supabase)
  const participant = participants.find((row) => row.auth_user_id === participantId)
  if (!participant) {
    throw new ParticipantRankContextError('Participant not found.', 404)
  }
  const participantIds = participants.map((participant) => participant.id)
  const cohortSize = participantIds.length
  const [wellness, workouts, habits, pulse] = await Promise.all([
    getLatestWellness(undefined, participantIds, supabase),
    getLatestWorkouts(undefined, supabase),
    getLatestHabits(undefined, supabase),
    getLatestPulse(supabase),
  ])

  const wellnessMap = Object.fromEntries(wellness.map((w) => [w.participant_id, w]))
  const workoutMap = workouts.reduce<Record<string, Workout>>((map, workout) => {
    if (!map[workout.participant_id]) map[workout.participant_id] = workout
    return map
  }, {})
  const workoutCounts = workouts.reduce<Record<string, number>>((map, workout) => {
    map[workout.participant_id] = (map[workout.participant_id] ?? 0) + 1
    return map
  }, {})
  const habitsMap = habits.reduce<Record<string, Habit>>((map, habit) => {
    if (!map[habit.participant_id]) map[habit.participant_id] = habit
    return map
  }, {})
  const pulseMap = Object.fromEntries(pulse.map((p) => [p.participant_id, p]))

  const rows = participantIds.map((id) => {
    const wellnessRow = wellnessMap[id] ?? null
    const workoutRow = workoutMap[id] ?? null
    const habitRow = habitsMap[id] ?? null
    const pulseRow = pulseMap[id] ?? null
    const recovery = wellnessRow?.recovery_score ?? 0
    const workoutsLogged = workoutCounts[id] ?? 0
    const pointsEarned = Math.round(
      recovery +
      (workoutRow?.strain ?? 0) * 2 +
      (habitRow?.hydrated ? 5 : 0) +
      (pulseRow?.energy_level ?? 0) * 3,
    )
    const consistencyStreak = wellnessRow?.sleep_consistency ?? 0
    return { id, recovery, workoutsLogged, pointsEarned, consistencyStreak }
  })

  const metricValue = {
    recovery: (row: typeof rows[number]) => row.recovery,
    workouts_logged: (row: typeof rows[number]) => row.workoutsLogged,
    points_earned: (row: typeof rows[number]) => row.pointsEarned,
    consistency_streak: (row: typeof rows[number]) => row.consistencyStreak,
  }[metric]

  const resolved = rows.find((row) => row.id === participant.id)
  if (!resolved) {
    throw new ParticipantRankContextError('Participant not found.', 404)
  }

  const participantValue = metricValue(resolved)
  const ahead = rows.filter((row) => metricValue(row) < participantValue).length
  const behind = rows.filter((row) => metricValue(row) > participantValue).length
  const rank = behind + 1

  return buildParticipantRankContext(metric, participantValue, rank, cohortSize, { ahead, behind })
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
    .or(WELLNESS_MEANINGFUL_FILTER)
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
    .select('*', { count: 'exact', head: true })
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
  // Note: These mutations should be called from server context with service role or admin auth
  // getQueryClient() provides anon user client for reads; writes require server-side auth
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
  // Always update the updated_at timestamp when modifying a flag
  const { error } = await supabase
    .from('risk_flags')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
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
  // Include updated_at timestamp so consumers can tell when snapshot was computed
  const { data, error } = await supabase
    .from('leaderboard_metric_snapshots')
    .upsert(
      {
        ...snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'participant_id,week_start_date' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}
