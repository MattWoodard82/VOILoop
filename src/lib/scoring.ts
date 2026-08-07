import { DailyWellness, LoginActivity, PulseSurvey, Intervention, Workout } from '@/types'
import type {
  EngagementScoreResult,
  PhysiologicalTrendResult,
  RiskAssessmentResult,
  WeekWindow,
  RiskTier,
  ColdStartStatus,
} from '@/types'

/**
 * Get the current week's Monday-Sunday window (Monday start)
 */
export function getCurrentWeekWindow(referenceDate: Date = new Date()): WeekWindow {
  const date = new Date(referenceDate)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday

  const start_date = new Date(date.setDate(diff))
  start_date.setHours(0, 0, 0, 0)

  const end_date = new Date(start_date)
  end_date.setDate(end_date.getDate() + 6)
  end_date.setHours(23, 59, 59, 999)

  return { start_date, end_date, monday_of_week: new Date(start_date) }
}

/**
 * Get week window for a specific date
 */
export function getWeekWindowForDate(date: Date): WeekWindow {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)

  const start_date = new Date(d.setDate(diff))
  start_date.setHours(0, 0, 0, 0)

  const end_date = new Date(start_date)
  end_date.setDate(end_date.getDate() + 6)
  end_date.setHours(23, 59, 59, 999)

  return { start_date, end_date, monday_of_week: new Date(start_date) }
}

/**
 * Calculate engagement score (0-100) with configurable weights
 * Default weights: login 25%, pulse survey 20%, data submission 25%, intervention follow-up 15%, trend consistency 15%
 */
export function calculateEngagementScore(
  loginCount: number,
  pulseSurveyCount: number,
  dataSubmissionCount: number,
  interventionFollowUpCount: number,
  trendConsistencyScore: number,
  weights?: {
    login_frequency_weight?: number
    pulse_survey_completion_weight?: number
    data_submission_weight?: number
    intervention_follow_up_weight?: number
    trend_consistency_weight?: number
  }
): EngagementScoreResult {
  // Default weights (sum = 100)
  const defaultWeights = {
    login_frequency_weight: 25,
    pulse_survey_completion_weight: 20,
    data_submission_weight: 25,
    intervention_follow_up_weight: 15,
    trend_consistency_weight: 15,
  }

  const w = weights ? { ...defaultWeights, ...weights } : defaultWeights

  // Validate that total weight is positive to avoid NaN
  const totalWeight = w.login_frequency_weight + w.pulse_survey_completion_weight +
    w.data_submission_weight + w.intervention_follow_up_weight + w.trend_consistency_weight

  if (totalWeight <= 0) {
    throw new Error('Total engagement score weight must be positive')
  }

  // Normalize each component to 0-100 scale
  // Login frequency: expect 3-5 logins per week = 100
  const loginComponent = Math.min(100, (loginCount / 5) * 100)

  // Pulse survey: expect 1 per week = 100
  const pulseComponent = Math.min(100, (pulseSurveyCount / 1) * 100)

  // Data submission: expect 3-5 data submissions per week = 100
  const dataComponent = Math.min(100, (dataSubmissionCount / 5) * 100)

  // Intervention follow-up: binary, either 0 or 100
  const interventionComponent = interventionFollowUpCount > 0 ? 100 : 0

  // Trend consistency: already normalized to 0-100
  const consistencyComponent = Math.min(100, trendConsistencyScore)

  const score = Math.round(
    (loginComponent * w.login_frequency_weight +
      pulseComponent * w.pulse_survey_completion_weight +
      dataComponent * w.data_submission_weight +
      interventionComponent * w.intervention_follow_up_weight +
      consistencyComponent * w.trend_consistency_weight) / totalWeight
  )

  return {
    score: Math.min(100, Math.max(0, score)),
    login_frequency_component: Math.round(loginComponent),
    pulse_survey_component: Math.round(pulseComponent),
    data_submission_component: Math.round(dataComponent),
    intervention_follow_up_component: Math.round(interventionComponent),
    trend_consistency_component: Math.round(consistencyComponent),
  }
}

/**
 * Calculate physiological trend using 2-of-3 decline threshold
 * Examines recovery_score, hrv_ms, and sleep_perf over two trailing windows
 * Returns true if 2 or more metrics show decline
 */
export function calculatePhysiologicalTrend(
  recentWellness: DailyWellness[],
  baselineWellness: DailyWellness[]
): PhysiologicalTrendResult {
  if (recentWellness.length === 0) {
    return {
      is_declining: false,
      decline_metric_count: 0,
      metrics_evaluated: [],
    }
  }

  const metrics = ['recovery_score', 'hrv_ms', 'sleep_perf'] as const
  const evaluated: Array<{
    metric_name: string
    is_declining: boolean
    recent_avg: number | null
    baseline_avg: number | null
  }> = []

  let declineCount = 0

  for (const metric of metrics) {
    const recentValues = recentWellness
      .map((w) => w[metric])
      .filter((v): v is number => v !== null && v !== undefined)

    const baselineValues = baselineWellness
      .map((w) => w[metric])
      .filter((v): v is number => v !== null && v !== undefined)

    if (recentValues.length === 0 || baselineValues.length === 0) {
      evaluated.push({
        metric_name: metric,
        is_declining: false,
        recent_avg: recentValues.length > 0 ? avg(recentValues) : null,
        baseline_avg: baselineValues.length > 0 ? avg(baselineValues) : null,
      })
      continue
    }

    const recentAvg = avg(recentValues)
    const baselineAvg = avg(baselineValues)

    // Check if metric is declining (recent < baseline)
    // Apply small buffer (1%) to avoid noise
    const isDeclining = recentAvg < baselineAvg * 0.99

    evaluated.push({
      metric_name: metric,
      is_declining: isDeclining,
      recent_avg: recentAvg,
      baseline_avg: baselineAvg,
    })

    if (isDeclining) declineCount++
  }

  // 2-of-3 threshold: require at least 2 metrics declining
  const is_declining = declineCount >= 2

  return {
    is_declining,
    decline_metric_count: declineCount,
    metrics_evaluated: evaluated,
  }
}

/**
 * Calculate combined risk tier based on engagement, physiological trends, and no-data hard rule
 * Risk tiers: green (low) | yellow (medium) | red (high) | no_data
 */
export function calculateRiskTier(
  engagementScore: number | null,
  physiologicalTrend: PhysiologicalTrendResult | null,
  hasNoData: boolean
): RiskTier {
  // Hard rule: no data = no_data tier
  if (hasNoData) {
    return 'no_data'
  }

  // If we have no meaningful data, return no_data
  if (engagementScore === null && physiologicalTrend === null) {
    return 'no_data'
  }

  // Score-based risk assessment (lower engagement = higher risk)
  // Explicitly check for null to distinguish from zero score
  const scoreRisk = engagementScore !== null
    ? engagementScore >= 70
      ? 'green'
      : engagementScore >= 40
        ? 'yellow'
        : 'red'
    : null

  // Physiological trend-based risk (declining trend = higher risk)
  const trendRisk = physiologicalTrend
    ? physiologicalTrend.is_declining
      ? 'red'
      : 'green'
    : null

  // Combine risks: worst case wins
  type ComparableRiskTier = Exclude<RiskTier, 'no_data'>
  const riskOrder: Record<ComparableRiskTier, number> = { red: 3, yellow: 2, green: 1 }
  let maxRisk: ComparableRiskTier = 'green'

  if (scoreRisk) {
    const scoreLevel = riskOrder[scoreRisk as ComparableRiskTier]
    if (scoreLevel > riskOrder[maxRisk]) maxRisk = scoreRisk as ComparableRiskTier
  }

  if (trendRisk) {
    const trendLevel = riskOrder[trendRisk as ComparableRiskTier]
    if (trendLevel > riskOrder[maxRisk]) maxRisk = trendRisk as ComparableRiskTier
  }

  return maxRisk
}

/**
 * Determine cold-start status based on enrollment date
 */
export function determineColdStartStatus(
  enrolledDate: string | null,
  referenceDate: Date = new Date()
): { status: ColdStartStatus; daysEnrolled: number } {
  if (!enrolledDate) {
    return { status: 'cold_start', daysEnrolled: 0 }
  }

  const enrolled = new Date(enrolledDate)
  const now = new Date(referenceDate)
  const daysEnrolled = Math.floor(
    (now.getTime() - enrolled.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Cold-start period: first 21 days
  return {
    status: daysEnrolled < 21 ? 'cold_start' : 'active',
    daysEnrolled,
  }
}

/**
 * Perform complete risk assessment for a participant
 */
export function assessRisk(
  participantEnrolledDate: string | null,
  recentLoginCount: number,
  recentPulseSurveyCount: number,
  dataSubmissionCount: number,
  interventionFollowUpCount: number,
  recentWellnessData: DailyWellness[],
  baselineWellnessData: DailyWellness[],
  hasActiveRiskOverrides: boolean,
  referenceDate: Date = new Date()
): RiskAssessmentResult {
  // Determine cold-start status
  const { status: coldStartStatus, daysEnrolled } = determineColdStartStatus(
    participantEnrolledDate,
    referenceDate
  )

  // For cold-start participants, use baseline engagement assumptions
  const adjustedLoginCount =
    coldStartStatus === 'cold_start' ? Math.max(recentLoginCount, 2) : recentLoginCount
  const adjustedDataSubmissionCount =
    coldStartStatus === 'cold_start' ? Math.max(dataSubmissionCount, 2) : dataSubmissionCount

  // Calculate trend consistency score (higher = more consistent)
  const trendConsistencyScore =
    recentWellnessData.length > 0 ? Math.min(100, (recentWellnessData.length / 7) * 100) : 0

  // Calculate engagement score
  const engagementScore = calculateEngagementScore(
    adjustedLoginCount,
    recentPulseSurveyCount,
    adjustedDataSubmissionCount,
    interventionFollowUpCount,
    trendConsistencyScore
  )

  // Calculate physiological trend
  const physiologicalTrend = calculatePhysiologicalTrend(
    recentWellnessData,
    baselineWellnessData
  )

  // Determine if we have no meaningful data
  // No data means no wellness history, no logins, no pulse surveys, no data submissions, and no intervention follow-ups
  const hasNoData =
    recentWellnessData.length === 0 && recentLoginCount === 0 && 
    recentPulseSurveyCount === 0 && dataSubmissionCount === 0 && interventionFollowUpCount === 0

  // Calculate risk tier
  const riskTier = calculateRiskTier(
    engagementScore.score,
    physiologicalTrend,
    hasNoData
  )

  // Generate explanation
  let explanation = ''
  if (hasNoData) {
    explanation = 'No data available for assessment'
  } else if (coldStartStatus === 'cold_start') {
    explanation = `Cold-start participant (${daysEnrolled} days enrolled)`
  } else if (riskTier === 'red') {
    explanation = 'High risk detected'
  } else if (riskTier === 'yellow') {
    explanation = 'Moderate risk detected'
  } else {
    explanation = 'Low risk, healthy engagement and metrics'
  }

  return {
    risk_tier: riskTier,
    cold_start_status: coldStartStatus,
    days_enrolled: daysEnrolled,
    physiological_trend: physiologicalTrend,
    engagement_score: engagementScore,
    has_active_overrides: hasActiveRiskOverrides,
    explanation,
  }
}

/**
 * Helper function to calculate average
 */
function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Track login event by writing to login_activity table
 * Must be called from server-side context with proper authentication
 */
export async function trackLoginEvent(
  participantId: string,
  loginTime: Date
): Promise<void> {
  // Note: This function must be called from a server context with service role or proper auth
  // The actual DB write is performed by writeLoginActivity in queries.ts
  // This is a placeholder - the real implementation should import and call writeLoginActivity
  // from a server-only module with appropriate database permissions
  throw new Error(
    'trackLoginEvent must be called from server context with writeLoginActivity from queries.ts'
  )
}

/**
 * Calculate recency-weighted engagement score
 * More recent events have higher weight; events older than 30 days are excluded
 */
export function calculateRecencyWeightedScore(
  events: Array<{ date: Date; value: number }>,
  referenceDate: Date = new Date()
): number {
  if (events.length === 0) return 0

  let totalWeight = 0
  let weightedSum = 0

  // Window: only consider events within the last 30 days
  const thirtyDaysAgo = new Date(referenceDate)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  for (const event of events) {
    // Exclude events older than 30 days
    if (event.date < thirtyDaysAgo) {
      continue
    }

    const daysAgo = Math.floor((referenceDate.getTime() - event.date.getTime()) / (1000 * 60 * 60 * 24))

    // Exponential decay: weight = e^(-daysAgo/7)
    const weight = Math.exp(-daysAgo / 7)

    weightedSum += event.value * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0
}
