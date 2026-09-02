import { createClient } from './client'
import { createAdminSupabaseClient } from './admin'
import { createServerSupabaseClient } from './server'
import { DEFAULT_ENGAGEMENT_WEIGHTS, normalizeEngagementWeights, type EngagementWeights } from '@/lib/wellness-director-config'
import { DEFAULT_TEAM_HEALTH_SCORE_CONFIG, normalizeTeamHealthScoreConfig, type TeamHealthScoreConfig } from '@/lib/team-health-score-config'
import { scoreParticipant, toNightInputs, toWorkoutInputs, type ParticipantScoreResult } from '@/lib/team-health-score'
import { isTestAccountEmail } from '@/lib/test-accounts'
import { getAuthEmailsByUserId } from './auth-emails'
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

// --- Engagement score windowing helpers (GH issue #66 / FR-13) -----------------
// Date-only, UTC-anchored math so window boundaries don't drift with server timezone.
const MS_PER_DAY = 86400000

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// DECISION-1 (issue #66): week-over-week is a fixed Monday-Sunday calendar week, not rolling 7 days.
function getMondayOfWeek(date: Date): Date {
  const d = startOfDayUTC(date)
  const day = d.getUTCDay() // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diffToMonday)
  return d
}

interface WeekWindow { start: Date; end: Date }

function getRecentCalendarWeeks(referenceDate: Date, count: number): WeekWindow[] {
  const currentMonday = getMondayOfWeek(referenceDate)
  const weeks: WeekWindow[] = []
  for (let i = 0; i < count; i++) {
    const start = new Date(currentMonday)
    start.setUTCDate(start.getUTCDate() - i * 7)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    weeks.push({ start, end })
  }
  return weeks
}

function dateKeyInWindow(dateStr: string, window: WeekWindow): boolean {
  const key = dateStr.slice(0, 10)
  return key >= toDateKey(window.start) && key <= toDateKey(window.end)
}

// Weekly consistency (submission consistency / pulse completion): % of the last N
// calendar weeks with at least one matching row, truncated to weeks that occurred
// on/after the participant's enrollment so pre-enrollment weeks don't count as misses.
function computeWeeklyConsistency<T extends { date: string }>(
  rows: T[],
  weeks: WeekWindow[],
  enrolledDate: Date | null,
  matches: (row: T) => boolean,
): number | null {
  const validWeeks = weeks.filter((week) => !enrolledDate || week.end >= enrolledDate)
  if (validWeeks.length === 0) return null
  const weeksWithSubmission = validWeeks.filter((week) => rows.some((row) => matches(row) && dateKeyInWindow(row.date, week))).length
  return Math.round((weeksWithSubmission / validWeeks.length) * 100)
}

// Device-wear consistency: % of days in the trailing window (bounded by enrollment)
// with a daily_wellness row that has BOTH a valid recovery score and valid sleep data.
function computeDeviceWearConsistency(
  rows: DailyWellness[],
  windowDays: number,
  referenceDate: Date,
  enrolledDate: Date | null,
): number | null {
  const windowStart = new Date(referenceDate)
  windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1))
  const effectiveStart = enrolledDate && enrolledDate > windowStart ? enrolledDate : windowStart
  const totalDays = Math.floor((startOfDayUTC(referenceDate).getTime() - startOfDayUTC(effectiveStart).getTime()) / MS_PER_DAY) + 1
  if (totalDays <= 0) return null

  const byDate = new Map(rows.map((row) => [row.date.slice(0, 10), row]))
  let validDays = 0
  for (let i = 0; i < totalDays; i++) {
    const day = new Date(effectiveStart)
    day.setUTCDate(day.getUTCDate() + i)
    const row = byDate.get(toDateKey(day))
    if (row && row.recovery_score != null && (row.sleep_perf != null || row.sleep_hrs != null)) {
      validDays++
    }
  }
  return Math.round((validDays / totalDays) * 100)
}

// Workout volume vs. own historical average: compares the trailing window's workout
// count against the participant's own pre-window average rate (normalized to the
// same window length). Returns null when there isn't enough prior history to form a
// baseline, rather than defaulting to a flat/constant score.
function computeWorkoutVolumeVsBaseline(
  workouts: Workout[],
  windowDays: number,
  referenceDate: Date,
): number | null {
  const windowStart = new Date(referenceDate)
  windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1))
  const windowStartKey = toDateKey(windowStart)

  const currentCount = workouts.filter((w) => w.date.slice(0, 10) >= windowStartKey).length
  const historical = workouts.filter((w) => w.date.slice(0, 10) < windowStartKey)
  if (historical.length === 0) return null

  const earliestDate = historical.reduce((min, w) => (w.date < min ? w.date : min), historical[0].date)
  const historicalDays = Math.max(1, Math.floor((windowStart.getTime() - new Date(`${earliestDate.slice(0, 10)}T00:00:00Z`).getTime()) / MS_PER_DAY))
  const historicalAvgPerWindow = (historical.length / historicalDays) * windowDays
  if (historicalAvgPerWindow <= 0) return null

  const ratio = currentCount / historicalAvgPerWindow
  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
}

// Average minutes spent in each HR zone (1-5) per workout, over a trailing window.
// WHOOP only reports zone percentages + total duration per workout (not raw zone minutes),
// so each workout's zone minutes are approximated as duration_min * (zoneN_pct / 100).
// Returns null for a zone (or the whole result) when there isn't enough data in the window.
function computeAverageZoneMinutes(
  workouts: Workout[],
  windowDays: number,
  referenceDate: Date,
): { zone1: number | null; zone2: number | null; zone3: number | null; zone4: number | null; zone5: number | null } | null {
  const windowStart = new Date(referenceDate)
  windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1))
  const windowStartKey = toDateKey(windowStart)
  const windowEndKey = toDateKey(referenceDate)

  // Bound the window on both ends: without the upper bound, future-dated or
  // otherwise out-of-order imported workouts (dated after referenceDate) would
  // still be included and could inflate the trailing-window averages.
  const windowed = workouts.filter((w) => {
    const dateKey = w.date.slice(0, 10)
    return dateKey >= windowStartKey && dateKey <= windowEndKey
  })
  if (windowed.length === 0) return null

  const zoneKeys = ['zone1_pct', 'zone2_pct', 'zone3_pct', 'zone4_pct', 'zone5_pct'] as const
  const resultKeys = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'] as const
  const result: { zone1: number | null; zone2: number | null; zone3: number | null; zone4: number | null; zone5: number | null } = {
    zone1: null, zone2: null, zone3: null, zone4: null, zone5: null,
  }

  zoneKeys.forEach((zoneKey, i) => {
    const minutes = windowed
      .map((w) => (w.duration_min != null && w[zoneKey] != null ? w.duration_min * ((w[zoneKey] as number) / 100) : null))
      .filter((v): v is number => v !== null)
    if (minutes.length > 0) {
      result[resultKeys[i]] = Math.round((minutes.reduce((a, b) => a + b, 0) / minutes.length) * 10) / 10
    }
  })

  return result
}

interface NudgeRecord { id: string; week_of: string }
interface NudgeTargetRecord { nudge_id: string; target_type: string; target_label: string | null; participant_id: string | null }
interface NudgeAcknowledgementRecord { nudge_id: string; participant_id: string }

// Nudge response rate (trailing 21d): % of nudges targeted at this participant
// (directly, via 'all', or via matching cohort subgroup) that they acknowledged,
// per DECISION-2 (acknowledge/receipt click within the response window).
function computeNudgeResponseRate(
  participant: Pick<Participant, 'id' | 'cohort'>,
  nudges: NudgeRecord[],
  targets: NudgeTargetRecord[],
  acknowledgements: NudgeAcknowledgementRecord[],
): number | null {
  const nudgeIdsInWindow = new Set(nudges.map((n) => n.id))
  const targetedNudgeIds = new Set<string>()
  for (const target of targets) {
    if (!nudgeIdsInWindow.has(target.nudge_id)) continue
    if (target.target_type === 'all') {
      targetedNudgeIds.add(target.nudge_id)
    } else if (target.target_type === 'participant' && target.participant_id === participant.id) {
      targetedNudgeIds.add(target.nudge_id)
    } else if (target.target_type === 'subgroup' && participant.cohort && target.target_label === participant.cohort) {
      targetedNudgeIds.add(target.nudge_id)
    }
  }
  if (targetedNudgeIds.size === 0) return null

  const ackNudgeIds = new Set(
    acknowledgements.filter((ack) => ack.participant_id === participant.id).map((ack) => ack.nudge_id),
  )
  const respondedCount = Array.from(targetedNudgeIds).filter((id) => ackNudgeIds.has(id)).length
  return Math.round((respondedCount / targetedNudgeIds.size) * 100)
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
  try {
    return createAdminSupabaseClient()
  } catch {
    return getQueryClient()
  }
}

export class ParticipantRankContextError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ParticipantRankContextError'
    this.status = status
  }
}

export async function getParticipants(supabase = getQueryClient()): Promise<Participant[]> {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('status', 'Active')
    .order('first_name')
  if (error) throw error
  return data ?? []
}

// Excludes pilot/test participant accounts (emails matching isTestAccountEmail,
// e.g. test3@user.com) from cohort-wide Wellness Director dashboard calculations
// (Average Weighted Score, KPI stats, dropdowns/filters). Resolves each
// participant's auth.users email via the service-role admin client.
//
// MUST fail open: if service-role credentials are unavailable or the email
// lookup errors for any reason, this returns the unfiltered list rather than
// throwing - the dashboard should never break because pilot-account filtering
// couldn't run.
export async function excludeTestAccountParticipants(participants: Participant[]): Promise<Participant[]> {
  const authUserIds = participants
    .map((participant) => participant.auth_user_id)
    .filter((value): value is string => Boolean(value))

  if (!authUserIds.length) return participants

  try {
    const adminClient = createAdminSupabaseClient()
    const emailByUserId = await getAuthEmailsByUserId(adminClient, authUserIds)
    return participants.filter((participant) => {
      const email = participant.auth_user_id ? emailByUserId.get(participant.auth_user_id) : undefined
      return !email || !isTestAccountEmail(email)
    })
  } catch {
    return participants
  }
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

// Used by the wellness-director pulse dashboard (src/app/pulse/page.tsx) so response
// counts reflect the full current Monday-Sunday calendar week rather than only the
// single most recent submission date. Kept separate from getLatestPulse (which many
// other callers rely on for a "most recent snapshot regardless of week" semantics,
// e.g. leaderboard/rank scoring and team dashboard enrichment) to avoid changing
// their behavior.
export async function getCurrentWeekPulse(supabase = getQueryClient()): Promise<PulseSurvey[]> {
  const now = new Date()
  const utcDay = now.getUTCDay() // 0 = Sunday ... 6 = Saturday
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday))
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6))
  const weekStart = monday.toISOString().slice(0, 10)
  const weekEnd = sunday.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('pulse_surveys')
    .select('*')
    .gte('date', weekStart)
    .order('date', { ascending: false })
  if (error) throw error

  return (data ?? []).filter((row) => row.date <= weekEnd)
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

export async function getInterventions(status?: string, supabase = getQueryClient()): Promise<Intervention[]> {
  let q = supabase
    .from('interventions')
    .select('*')
    .order('date_triggered', { ascending: false })
  if (status) q = q.eq('outcome', status)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getRecentlyResolvedInterventions(
  limit = 10,
  supabase = getQueryClient(),
): Promise<Intervention[]> {
  const normalizedLimit = Math.max(1, limit)
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .eq('outcome', 'Resolved')
    .order('date_resolved', { ascending: false })
    .order('id', { ascending: false })
    .limit(normalizedLimit)

  if (error) throw error

  return (data ?? []).filter((intervention) => intervention.date_resolved)
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

// PostgREST/Supabase caps unbounded result sets (commonly 1,000 rows). Page through
// results so a large team's trailing-window history queries below can't silently
// truncate to an ascending-ordered prefix and drop the most recent (and most
// relevant) days once a team crosses that row-count threshold.
const HISTORY_PAGE_SIZE = 1000

async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  // Bounded by page size shrinking below a full page, so this always terminates.
  for (;;) {
    const { data, error } = await buildPage(from, from + HISTORY_PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < HISTORY_PAGE_SIZE) break
    from += HISTORY_PAGE_SIZE
  }
  return rows
}

// Fetches full daily_wellness history (not just the latest row) for a set of
// participants since a given date, used for windowed engagement components.
export async function getWellnessHistoryForParticipants(
  participantIds: string[],
  sinceDate: string,
  supabase = getQueryClient(),
): Promise<DailyWellness[]> {
  if (participantIds.length === 0) return []
  return fetchAllPages<DailyWellness>((from, to) =>
    supabase
      .from('daily_wellness')
      .select('*')
      .in('participant_id', participantIds)
      .gte('date', sinceDate)
      .order('date', { ascending: true })
      .range(from, to)
  )
}

// Fetches full pulse_surveys history (not just the latest date's snapshot) for a
// set of participants since a given date, used for pulse completion consistency.
export async function getPulseHistoryForParticipants(
  participantIds: string[],
  sinceDate: string,
  supabase = getQueryClient(),
): Promise<PulseSurvey[]> {
  if (participantIds.length === 0) return []
  return fetchAllPages<PulseSurvey>((from, to) =>
    supabase
      .from('pulse_surveys')
      .select('*')
      .in('participant_id', participantIds)
      .gte('date', sinceDate)
      .order('date', { ascending: true })
      .range(from, to)
  )
}

// Fetches full workouts history (not just the latest date's snapshot) for a set
// of participants, optionally since a given date. Used by getTeamHealthScore
// (GH #119), which needs every workout back to the fixed baseline window, and by
// getTeamDashboard's workout-volume/zone-minutes averages, which need the full
// history (no lower bound) so computeWorkoutVolumeVsBaseline can still see each
// participant's pre-window baseline rate - a bounded page from getLatestWorkouts
// can silently truncate that once a cohort's total workout rows cross
// PostgREST's page cap (see HISTORY_PAGE_SIZE above).
export async function getWorkoutHistoryForParticipants(
  participantIds: string[],
  sinceDate?: string,
  supabase = getQueryClient(),
): Promise<Workout[]> {
  if (participantIds.length === 0) return []
  return fetchAllPages<Workout>((from, to) => {
    let query = supabase
      .from('workouts')
      .select('*')
      .in('participant_id', participantIds)
    if (sinceDate) query = query.gte('date', sinceDate)
    return query.order('date', { ascending: true }).range(from, to)
  })
}

// Fetches the nudge/target/acknowledgement data needed to compute nudge response
// rate (trailing 21d) for a set of participants, per DECISION-2 in issue #66.
export async function getNudgeEngagementData(
  sinceDate: string,
  supabase = getQueryClient(),
): Promise<{ nudges: NudgeRecord[]; targets: NudgeTargetRecord[]; acknowledgements: NudgeAcknowledgementRecord[] }> {
  const { data: nudges, error: nudgeError } = await supabase
    .from('weekly_nudges')
    .select('id, week_of')
    .gte('week_of', sinceDate)
  if (nudgeError) throw nudgeError

  const nudgeIds = (nudges ?? []).map((nudge: NudgeRecord) => nudge.id)
  if (nudgeIds.length === 0) return { nudges: nudges ?? [], targets: [], acknowledgements: [] }

  const [{ data: targets, error: targetError }, { data: acknowledgements, error: ackError }] = await Promise.all([
    supabase
      .from('nudge_targets')
      .select('nudge_id, target_type, target_label, participant_id')
      .in('nudge_id', nudgeIds),
    supabase
      .from('nudge_acknowledgements')
      .select('nudge_id, participant_id')
      .in('nudge_id', nudgeIds),
  ])
  if (targetError) throw targetError
  if (ackError) throw ackError

  return { nudges: nudges ?? [], targets: targets ?? [], acknowledgements: acknowledgements ?? [] }
}

// Reads the admin-configured FR-13 engagement-score weights so getTeamDashboard's score
// calculation reflects whatever the admin actually saved, instead of a fixed default that
// silently ignores the "Engagement-score weights" card. Falls back to defaults when no
// config row has been saved yet, or when the read fails for any reason (dashboard should
// never hard-fail just because the config table is unreachable).
export async function getEngagementWeights(supabase = getQueryClient()): Promise<EngagementWeights> {
  const { data, error } = await supabase
    .from('wellness_director_config')
    .select('weights')
    .eq('id', 'current')
    .maybeSingle()
  if (error || !data) return DEFAULT_ENGAGEMENT_WEIGHTS
  return normalizeEngagementWeights(data.weights)
}

// Reads the admin-configured Team Health Score baseline window (GH #119). Separate
// table/config from FR-13's engagement weights above — this is a date range, not
// scoring weights, and applies cohort-wide. Falls back to Matt's original fixed
// window when no row has been saved yet or the read fails.
export async function getTeamHealthScoreConfig(supabase = getQueryClient()): Promise<TeamHealthScoreConfig> {
  const { data, error } = await supabase
    .from('team_health_score_config')
    .select('baseline_start, baseline_end')
    .eq('id', 'current')
    .maybeSingle()
  if (error || !data) return DEFAULT_TEAM_HEALTH_SCORE_CONFIG
  return normalizeTeamHealthScoreConfig(data)
}

// Computes one participant's Team Health Score (baseline/last-week/current windows)
// per Matt's spec in GH #119. Fetches wellness + workout history back to the earlier
// of the configured baseline start or the requested current window, then runs the
// pure scoring engine in team-health-score.ts.
export async function getTeamHealthScore(
  participantId: string,
  currentStart: string,
  supabase = getQueryClient(),
): Promise<ParticipantScoreResult> {
  const config = await getTeamHealthScoreConfig(supabase)
  // scoreParticipant also needs the full "last week" window (the 7 days immediately
  // before currentStart) even when the configured baseline starts on or after
  // currentStart (e.g. after navigating to a week before the baseline). Anchor the
  // fetch to whichever of baselineStart or (currentStart - 7 days) is earliest so
  // lastWeekWindow's rows are never excluded.
  const lastWeekSinceDate = toDateKey(new Date(new Date(`${currentStart}T00:00:00Z`).getTime() - 7 * MS_PER_DAY))
  const historySinceDate = [config.baselineStart, lastWeekSinceDate].sort()[0]

  const [wellnessRows, workoutRows] = await Promise.all([
    getWellnessHistoryForParticipants([participantId], historySinceDate, supabase),
    getWorkoutHistoryForParticipants([participantId], historySinceDate, supabase),
  ])

  const nights = toNightInputs(wellnessRows)
  const workouts = toWorkoutInputs(workoutRows)
  return scoreParticipant(nights, workouts, currentStart, config)
}

export async function getTeamDashboard(options?: { includeTestAccounts?: boolean }): Promise<{
  participants: ParticipantWithWellness[]
  stats: TeamStats
  interventions: Intervention[]
}> {
  const supabase = getQueryClient()
  const privilegedSupabase = getPrivilegedQueryClient()
  const allParticipants = await getParticipants(supabase)
  // The Wellness Director's header toggle defaults to "excluded" (current/default
  // behavior). Passing includeTestAccounts: true lets the WD explicitly opt out of
  // that exclusion for this request, skipping the admin-email lookup entirely.
  const participants = options?.includeTestAccounts
    ? allParticipants
    : await excludeTestAccountParticipants(allParticipants)
  const participantIds = participants.map((participant) => participant.id)
  const now = new Date()
  // 28-day lookback comfortably covers both the trailing-21-day windows (device wear,
  // nudge response, workout volume) and the "last 3 calendar weeks" windows
  // (submission consistency, pulse completion) regardless of where "today" falls
  // within its own Monday-Sunday week. This is an intentionally wide *fetch* margin;
  // the actual window boundaries are enforced precisely downstream by
  // computeWeeklyConsistency/computeDeviceWearConsistency, so over-fetching here is
  // harmless (extra rows are filtered out by those functions).
  const historySinceDate = toDateKey(new Date(now.getTime() - 28 * MS_PER_DAY))
  // Trailing 21-day window is inclusive of today, so the cutoff is 20 days back
  // (matching computeDeviceWearConsistency/computeWorkoutVolumeVsBaseline's
  // `windowDays - 1` convention) - unlike historySinceDate above, this value is used
  // directly as the query's hard boundary with no further downstream trimming, so an
  // off-by-one here would leak an extra day's nudges into the result.
  const nudgeSinceDate = toDateKey(new Date(now.getTime() - 20 * MS_PER_DAY))
  const [wellness, workouts, habits, pulse, interventions, riskFlags, wellnessHistory, pulseHistory, workoutHistory, nudgeData, engagementWeights] = await Promise.all([
    getLatestWellness(undefined, participantIds, supabase),
    getLatestWorkouts(undefined, supabase),
    getLatestHabits(undefined, supabase),
    getLatestPulse(supabase),
    getInterventions(undefined, supabase),
    getRiskFlagsForParticipantGroup(participantIds, privilegedSupabase),
    getWellnessHistoryForParticipants(participantIds, historySinceDate, supabase),
    getPulseHistoryForParticipants(participantIds, historySinceDate, supabase),
    // Trailing-window workout metrics (workoutVolume/avgZoneMinutes below) need
    // every workout ever logged for every participant (computeWorkoutVolumeVsBaseline
    // compares the trailing window against each participant's own pre-window
    // historical rate, with no fixed lookback limit). getLatestWorkouts above is
    // unpaginated and globally ordered by date/start_time, so once a cohort's total
    // workout row count crosses PostgREST's page cap it silently truncates to the
    // most-recent rows only - which can drop an entire participant's history. Use
    // the paginated, per-participant-filtered fetch instead for these metrics.
    getWorkoutHistoryForParticipants(participantIds, undefined, supabase),
    getNudgeEngagementData(nudgeSinceDate, supabase),
    getEngagementWeights(supabase),
  ])

  const wellnessMap = Object.fromEntries(wellness.map((w) => [w.participant_id, w]))
  const workoutMap = workouts.reduce<Record<string, Workout>>((map, workout) => {
    if (!map[workout.participant_id]) map[workout.participant_id] = workout
    return map
  }, {})
  const habitsMap = Object.fromEntries(habits.map((h) => [h.participant_id, h]))
  const pulseMap = Object.fromEntries(pulse.map((p) => [p.participant_id, p]))
  const recentWeeks = getRecentCalendarWeeks(now, 3)

  const enriched: ParticipantWithWellness[] = participants.map((emp) => {
    const w = wellnessMap[emp.id] ?? null
    const enrolledDate = emp.enrolled_date ? startOfDayUTC(new Date(emp.enrolled_date)) : null
    const enrolledDays = enrolledDate != null ? Math.floor((startOfDayUTC(now).getTime() - enrolledDate.getTime()) / MS_PER_DAY) : null
    // Participant-scoped history (not just the single latest row) so windowed
    // components reflect real variation instead of a single-point snapshot.
    const wellnessRows = wellnessHistory.filter((row) => row.participant_id === emp.id).sort((a, b) => a.date.localeCompare(b.date))
    const pulseRows = pulseHistory.filter((row) => row.participant_id === emp.id)
    const workoutRows = workoutHistory.filter((row) => row.participant_id === emp.id)

    // FR-13 component formulas (GH issue #66): each is participant-scoped, uses its
    // own defined window, and returns null (not a flattened default) when there's
    // insufficient data to measure it.
    const submissionConsistency = computeWeeklyConsistency(
      wellnessRows, recentWeeks, enrolledDate,
      (row) => hasMeaningfulWellnessData(row),
    )
    const deviceWearConsistency = computeDeviceWearConsistency(wellnessRows, 21, now, enrolledDate)
    const pulseCompletion = computeWeeklyConsistency(pulseRows, recentWeeks, enrolledDate, () => true)
    const nudgeResponse = computeNudgeResponseRate(emp, nudgeData.nudges, nudgeData.targets, nudgeData.acknowledgements)
    const workoutVolume = computeWorkoutVolumeVsBaseline(workoutRows, 21, now)
    const avgZoneMinutes = computeAverageZoneMinutes(workoutRows, 21, now)
    const engagementComponents: Record<string, number> = {
      submission_consistency: submissionConsistency ?? 0,
      device_wear_consistency: deviceWearConsistency ?? 0,
      pulse_completion: pulseCompletion ?? 0,
      nudge_response: nudgeResponse ?? 0,
      workout_volume: workoutVolume ?? 0,
    }
    const engagementScore: number = Math.round(
      [
        submissionConsistency != null ? (submissionConsistency * engagementWeights.submission_consistency) / 100 : 0,
        deviceWearConsistency != null ? (deviceWearConsistency * engagementWeights.device_wear_consistency) / 100 : 0,
        pulseCompletion != null ? (pulseCompletion * engagementWeights.pulse_completion) / 100 : 0,
        nudgeResponse != null ? (nudgeResponse * engagementWeights.nudge_response) / 100 : 0,
        workoutVolume != null ? (workoutVolume * engagementWeights.workout_volume) / 100 : 0,
      ].reduce((sum, part) => sum + part, 0),
    )
    const baselineState = enrolledDays != null && enrolledDays < 21 ? 'building' : 'ready'
    const trendCompare = (rows: DailyWellness[], field: keyof DailyWellness) => {
      const last21 = rows.slice(-21)
      const earlier = last21.slice(0, Math.max(1, last21.length - 7))
      const later = last21.slice(-7)
      return avg(later.map((row) => typeof row[field] === 'number' ? row[field] as number : null)) - avg(earlier.map((row) => typeof row[field] === 'number' ? row[field] as number : null))
    }
    const recoveryDelta = trendCompare(wellnessRows, 'recovery_score')
    const hrvDelta = trendCompare(wellnessRows, 'hrv_ms')
    const sleepDelta = trendCompare(wellnessRows, 'sleep_perf')
    const decliningCount = [recoveryDelta, hrvDelta, sleepDelta].filter((delta) => delta < 0).length
    const physiologicalTrend: ParticipantWithWellness['physiological_trend'] = decliningCount >= 2 ? 'declining' : recoveryDelta > 0 && hrvDelta > 0 && sleepDelta > 0 ? 'improving' : 'steady'
    const physiologicalMetrics = [
      ...(recoveryDelta !== 0 ? [`Recovery ${recoveryDelta > 0 ? 'up' : 'down'}`] : []),
      ...(hrvDelta !== 0 ? [`HRV ${hrvDelta > 0 ? 'up' : 'down'}`] : []),
      ...(sleepDelta !== 0 ? [`Sleep performance ${sleepDelta > 0 ? 'up' : 'down'}`] : []),
    ]
    const zeroDataFor14Days = !w && enrolledDays != null && enrolledDays >= 14
    const riskTriggers = [
      ...(engagementScore < 35 ? ['Low engagement score'] : []),
      ...(physiologicalTrend === 'declining' ? ['Physiological trend declining'] : []),
      ...(zeroDataFor14Days ? ['No wellness data for 14 days'] : []),
    ]
    const riskLevel = zeroDataFor14Days || (engagementScore < 35 && physiologicalTrend === 'declining') ? 'High' : engagementScore < 65 || physiologicalTrend === 'declining' ? 'Medium' : 'Low'
    return {
      ...emp,
      latest_wellness: w,
      latest_workout: workoutMap[emp.id] ?? null,
      latest_habits: habitsMap[emp.id] ?? null,
      latest_pulse: pulseMap[emp.id] ?? null,
      risk_level: riskLevel,
      recovery_status: getRecoveryStatus(w?.recovery_score ?? null),
      engagement_score: engagementScore,
      engagement_score_components: engagementComponents,
      avg_zone_minutes: avgZoneMinutes,
      physiological_trend: physiologicalTrend,
      physiological_trend_metrics: physiologicalMetrics,
      risk_tier_label: riskLevel === 'High' ? 'High concern' : riskLevel === 'Medium' ? 'Watch' : 'Stable',
      risk_trigger_reasons: riskTriggers,
      baseline_state: baselineState,
      baseline_days_remaining: enrolledDays != null ? Math.max(0, 21 - enrolledDays) : null,
      override_state: null,
      override_note: null,
      override_expires_at: null,
    }
  })

  const activeOverrideByParticipant = new Map<string, RiskFlag>()
  for (const flag of riskFlags) {
    if (
      flag.flag_type !== 'wellness_director' ||
      flag.is_active !== true ||
      !flag.override_state ||
      (flag.override_expires_at && new Date(flag.override_expires_at).getTime() < Date.now())
    ) {
      continue
    }
    if (!activeOverrideByParticipant.has(flag.participant_id)) {
      activeOverrideByParticipant.set(flag.participant_id, flag)
    }
  }

  for (const participant of enriched) {
    const override = activeOverrideByParticipant.get(participant.id)
    if (!override) continue
    participant.override_state = override.override_state
    participant.override_note = override.override_reason
    participant.override_expires_at = override.override_expires_at
  }

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

export async function getRiskFlagsForParticipantGroup(
  participantIds: string[],
  supabase = getQueryClient(),
): Promise<RiskFlag[]> {
  if (participantIds.length === 0) return []

  const { data, error } = await supabase
    .from('risk_flags')
    .select('*')
    .in('participant_id', participantIds)
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

// --- Recent nudges & responses (WD dashboard "Recent nudges & responses" card) ---

export interface NudgeHistoryEntry {
  nudge_id: string
  week_of: string
  message: string
  created_at: string
  responded: boolean
  responded_at: string | null
}

// A nudge target row is visible to a participant if it was sent directly to them
// (target_type='participant'), to everyone (target_type='all'), or to their cohort
// via a matching subgroup label (target_type='subgroup') - the same three targeting
// rules used by computeNudgeResponseRate above and by isParticipantTarget in
// src/app/api/participant/events/route.ts, kept in sync here so "no history" doesn't
// wrongly hide cohort-wide nudges the participant actually received/acknowledged.
function isNudgeTargetVisibleToParticipant(
  target: { target_type: string; target_label: string | null; participant_id: string | null },
  participantId: string,
  cohort: string | null,
): boolean {
  if (target.target_type === 'all') return true
  if (target.target_type === 'participant') return target.participant_id === participantId
  if (target.target_type === 'subgroup') return !!cohort && target.target_label === cohort
  return false
}

// Fetches the participant-visible nudge history for one participant - nudges sent
// directly to them (target_type='participant', which is what the WD dashboard's
// "Send a nudge to {name}" action creates), to the whole cohort (target_type='all'),
// or to their matching subgroup (target_type='subgroup') - paired with whether/when
// the participant acknowledged each one via nudge_acknowledgements.
export async function getNudgeHistoryForParticipant(
  participantId: string,
  limit = 10,
  supabase = getQueryClient(),
): Promise<NudgeHistoryEntry[]> {
  const { data: participantRow, error: participantError } = await supabase
    .from('participants')
    .select('cohort')
    .eq('id', participantId)
    .maybeSingle()
  if (participantError) throw participantError
  const cohort = (participantRow?.cohort as string | null | undefined) ?? null

  const { data: targets, error: targetsError } = await supabase
    .from('nudge_targets')
    .select('nudge_id, target_type, target_label, participant_id')
    .in('target_type', ['all', 'participant', 'subgroup'])
  if (targetsError) throw targetsError

  const nudgeIds = Array.from(new Set(
    (targets ?? [])
      .filter((target) => isNudgeTargetVisibleToParticipant(target, participantId, cohort))
      .map((row) => row.nudge_id as string),
  ))
  if (nudgeIds.length === 0) return []

  const { data: nudges, error: nudgesError } = await supabase
    .from('weekly_nudges')
    .select('id, week_of, message, created_at')
    .in('id', nudgeIds)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (nudgesError) throw nudgesError

  const { data: acks, error: acksError } = await supabase
    .from('nudge_acknowledgements')
    .select('nudge_id, acknowledged_at')
    .eq('participant_id', participantId)
    .in('nudge_id', nudgeIds)
  if (acksError) throw acksError

  const ackByNudgeId = new Map((acks ?? []).map((row) => [row.nudge_id as string, row.acknowledged_at as string]))

  return (nudges ?? []).map((nudge) => ({
    nudge_id: nudge.id,
    week_of: nudge.week_of,
    message: nudge.message,
    created_at: nudge.created_at,
    responded: ackByNudgeId.has(nudge.id),
    responded_at: ackByNudgeId.get(nudge.id) ?? null,
  }))
}

// --- Weekly response rate (WD dashboard "Weekly response rate" card) -------------

export interface WeeklyResponseRateRow {
  participant_id: string
  // Mon..Sun submission presence for the requested week.
  days: boolean[]
  week_pct: number
}

// Date-only, UTC-anchored day shift, mirroring the shiftDateStr convention used in
// WellnessDirectorClient (and getTeamHealthScore's Mon-Sun windowing, GH #119/PR
// #117) so all Mon-Sun windowing in this codebase stays consistent.
function shiftDateStrUTC(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Returns, for each requested participant, which of the 7 days (Mon-Sun) of the
// given week had at least one daily_wellness row (i.e. a submitted CSV/WHOOP
// entry), plus the resulting week completion percentage. `weekStart` must be the
// Monday of the target week (see mostRecentCompletedMonday in
// WellnessDirectorClient for the "most recently completed week" convention).
export async function getWeeklyResponseRate(
  weekStart: string,
  participantIds: string[],
  supabase = getQueryClient(),
): Promise<WeeklyResponseRateRow[]> {
  if (participantIds.length === 0) return []
  const weekEnd = shiftDateStrUTC(weekStart, 6)

  // Paged via fetchAllPages: a large cohort's Mon-Sun submission rows can exceed
  // PostgREST's default ~1000-row cap, which would otherwise silently drop rows and
  // make omitted participants/days look like missed submissions.
  const data = await fetchAllPages<{ participant_id: string; date: string }>((from, to) =>
    supabase
      .from('daily_wellness')
      .select('participant_id, date')
      .in('participant_id', participantIds)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .range(from, to)
  )

  const datesByParticipant = new Map<string, Set<string>>()
  for (const row of data) {
    const set = datesByParticipant.get(row.participant_id) ?? new Set<string>()
    set.add(row.date.slice(0, 10))
    datesByParticipant.set(row.participant_id, set)
  }

  return participantIds.map((participantId) => {
    const dates = datesByParticipant.get(participantId) ?? new Set<string>()
    const days = Array.from({ length: 7 }, (_, i) => dates.has(shiftDateStrUTC(weekStart, i)))
    const week_pct = Math.round((days.filter(Boolean).length / 7) * 100)
    return { participant_id: participantId, days, week_pct }
  })
}
