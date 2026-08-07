import type { DailyWellness, Workout } from '@/types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface BaselineComparison {
  metric: string
  currentLabel: string
  baselineLabel: string
  deltaLabel: string
  state: 'improved' | 'declined' | 'flat' | 'insufficient'
}

export interface PersonalStreak {
  label: string
  value: string
}

export interface PersonalBest {
  label: string
  value: string
  date: string
}

export interface PersonalTrend {
  label: string
  value: string
  state: 'up' | 'down' | 'flat' | 'insufficient'
}

function toDate(date: string) {
  return new Date(`${date}T00:00:00Z`)
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function average(values: number[]) {
  if (values.length === 0) return null
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function countDistinctDates(dates: string[]) {
  return new Set(dates).size
}

function formatSigned(value: number, unit: string) {
  if (value === 0) return `0 ${unit}`
  const sign = value > 0 ? '+' : '−'
  return `${sign}${Math.abs(value)} ${unit}`
}

function formatDateLabel(date: string) {
  return date
}

function getWindowBounds(latestDate: string) {
  const latest = toDate(latestDate)
  const recentStart = new Date(latest.getTime() - 20 * MS_PER_DAY)
  const baselineEnd = new Date(recentStart.getTime() - MS_PER_DAY)
  const baselineStart = new Date(baselineEnd.getTime() - 20 * MS_PER_DAY)

  return {
    recentStart: recentStart.toISOString().slice(0, 10),
    recentEnd: latestDate,
    baselineStart: baselineStart.toISOString().slice(0, 10),
    baselineEnd: baselineEnd.toISOString().slice(0, 10),
  }
}

export function buildParticipantInsights(wellness: DailyWellness[], workouts: Workout[]) {
  const sortedWellness = [...wellness].sort((a, b) => b.date.localeCompare(a.date))
  const latestDate = sortedWellness[0]?.date ?? null

  if (!latestDate) {
    return {
      baselineComparisons: [] as BaselineComparison[],
      streaks: [] as PersonalStreak[],
      bests: [] as PersonalBest[],
      trends: [] as PersonalTrend[],
      window: null,
    }
  }

  const window = getWindowBounds(latestDate)

  const recentWellness = sortedWellness.filter((entry) => entry.date >= window.recentStart && entry.date <= window.recentEnd)
  const baselineWellness = sortedWellness.filter((entry) => entry.date >= window.baselineStart && entry.date <= window.baselineEnd)

  const recentWorkouts = workouts.filter((w) => w.date >= window.recentStart && w.date <= window.recentEnd)
  const baselineWorkouts = workouts.filter((w) => w.date >= window.baselineStart && w.date <= window.baselineEnd)

  const avgRecentDuration = average(recentWorkouts.map((w) => w.duration_min).filter((v): v is number => v != null))
  const avgBaselineDuration = average(baselineWorkouts.map((w) => w.duration_min).filter((v): v is number => v != null))
  const recentWorkoutDays = countDistinctDates(recentWorkouts.map((w) => w.date))
  const baselineWorkoutDays = countDistinctDates(baselineWorkouts.map((w) => w.date))
  const avgRecentRecovery = average(recentWellness.map((w) => w.recovery_score).filter((v): v is number => v != null))
  const avgBaselineRecovery = average(baselineWellness.map((w) => w.recovery_score).filter((v): v is number => v != null))
  const avgRecentHrv = average(recentWellness.map((w) => w.hrv_ms).filter((v): v is number => v != null))
  const avgBaselineHrv = average(baselineWellness.map((w) => w.hrv_ms).filter((v): v is number => v != null))
  const avgRecentRestingHr = average(recentWellness.map((w) => w.resting_hr).filter((v): v is number => v != null))
  const avgBaselineRestingHr = average(baselineWellness.map((w) => w.resting_hr).filter((v): v is number => v != null))

  const baselineComparisons: BaselineComparison[] = [
    compareMetric('Exercise duration', avgRecentDuration, avgBaselineDuration, 'min', true),
    compareMetric('Workouts logged', recentWorkoutDays, baselineWorkoutDays, 'sessions', true, 1),
    compareMetric('Recovery score', avgRecentRecovery, avgBaselineRecovery, 'pts', true),
    compareMetric('HRV', avgRecentHrv, avgBaselineHrv, 'ms', true),
    compareMetric('Resting HR', avgRecentRestingHr, avgBaselineRestingHr, 'bpm', false),
  ]

  const workoutStreak = computeWorkoutStreak(recentWorkouts)
  const recoveryStreak = computeRecoveryStreak(sortedWellness, 67)

  const streaks: PersonalStreak[] = [
    { label: 'Workout days streak', value: `${workoutStreak} day${workoutStreak === 1 ? '' : 's'}` },
    { label: 'Green recovery streak', value: `${recoveryStreak} day${recoveryStreak === 1 ? '' : 's'}` },
  ]

  const bestWorkout = [...workouts]
    .filter((w) => w.duration_min != null)
    .sort((a, b) => (b.duration_min ?? 0) - (a.duration_min ?? 0))[0]
  const bestRecovery = [...wellness]
    .filter((w) => w.recovery_score != null)
    .sort((a, b) => (b.recovery_score ?? 0) - (a.recovery_score ?? 0))[0]
  const bestHrv = [...wellness]
    .filter((w) => w.hrv_ms != null)
    .sort((a, b) => (b.hrv_ms ?? 0) - (a.hrv_ms ?? 0))[0]

  const bests: PersonalBest[] = [
    bestWorkout
      ? { label: 'Longest workout', value: `${bestWorkout.duration_min} min`, date: formatDateLabel(bestWorkout.date) }
      : { label: 'Longest workout', value: 'No data', date: '—' },
    bestRecovery
      ? { label: 'Top recovery', value: `${bestRecovery.recovery_score}`, date: formatDateLabel(bestRecovery.date) }
      : { label: 'Top recovery', value: 'No data', date: '—' },
    bestHrv
      ? { label: 'Top HRV', value: `${bestHrv.hrv_ms} ms`, date: formatDateLabel(bestHrv.date) }
      : { label: 'Top HRV', value: 'No data', date: '—' },
  ]

  const trends: PersonalTrend[] = [
    trendMetric('Workout duration', avgRecentDuration, avgBaselineDuration, 'min', true),
    trendMetric('Recovery score', avgRecentRecovery, avgBaselineRecovery, 'pts', true),
    trendMetric('HRV', avgRecentHrv, avgBaselineHrv, 'ms', true),
    trendMetric('Resting HR', avgRecentRestingHr, avgBaselineRestingHr, 'bpm', false),
  ]

  return { baselineComparisons, streaks, bests, trends, window }
}

function compareMetric(label: string, recent: number | null, baseline: number | null, unit: string, higherIsBetter: boolean, minimumDataPoints: number = 2): BaselineComparison {
  if ((recent ?? 0) < minimumDataPoints || (baseline ?? 0) < minimumDataPoints) {
    return {
      metric: label,
      currentLabel: recent == null ? 'No recent data' : `${recent} ${unit}`,
      baselineLabel: baseline == null ? 'No baseline data' : `${baseline} ${unit}`,
      deltaLabel: 'Need more data',
      state: 'insufficient',
    }
  }

  if (recent == null || baseline == null) {
    return {
      metric: label,
      currentLabel: recent == null ? 'No recent data' : `${recent} ${unit}`,
      baselineLabel: baseline == null ? 'No baseline data' : `${baseline} ${unit}`,
      deltaLabel: 'Need more data',
      state: 'insufficient',
    }
  }

  const deltaRaw = round(recent - baseline)
  const state = deltaRaw === 0 ? 'flat' : (higherIsBetter ? deltaRaw > 0 : deltaRaw < 0) ? 'improved' : 'declined'

  return {
    metric: label,
    currentLabel: `${recent} ${unit}`,
    baselineLabel: `${baseline} ${unit}`,
    deltaLabel: formatSigned(deltaRaw, unit),
    state,
  }
}

function trendMetric(label: string, recent: number | null, baseline: number | null, unit: string, higherIsBetter: boolean): PersonalTrend {
  if (recent == null || baseline == null) {
    return { label, value: 'Need more data', state: 'insufficient' }
  }

  const delta = round(recent - baseline)
  if (delta === 0) return { label, value: `Flat (${recent} ${unit})`, state: 'flat' }
  const up = higherIsBetter ? delta > 0 : delta < 0
  return {
    label,
    value: `${up ? 'Improving' : 'Down'} (${formatSigned(delta, unit)})`,
    state: up ? 'up' : 'down',
  }
}

function computeWorkoutStreak(workouts: Workout[]) {
  const dates = new Set(workouts.map((w) => w.date))
  if (dates.size === 0) return 0
  const sorted = Array.from(dates).sort((a, b) => b.localeCompare(a))
  let streak = 1
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = toDate(sorted[i - 1]).getTime()
    const cur = toDate(sorted[i]).getTime()
    if (prev - cur === MS_PER_DAY) streak += 1
    else break
  }
  return streak
}

function computeRecoveryStreak(wellness: DailyWellness[], threshold: number) {
  if (wellness.length === 0) return 0
  let streak = 0
  for (const day of wellness) {
    if ((day.recovery_score ?? -1) >= threshold) streak += 1
    else break
  }
  return streak
}
