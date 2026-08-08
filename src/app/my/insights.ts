import type { DailyWellness, Workout } from '@/types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MIN_WORKOUT_DAY_COUNT = 2

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

interface NumericMetricWindow {
  average: number | null
}

function toDate(date: string) {
  return new Date(`${date}T00:00:00Z`)
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function getAverageMetric(values: Array<number | null | undefined>): NumericMetricWindow {
  const presentValues = values.filter((value): value is number => value != null)
  return {
    average: presentValues.length > 0
      ? round(presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length)
      : null,
  }
}

function countDistinctDates(dates: string[]) {
  return new Set(dates).size
}

function formatSigned(value: number, unit: string) {
  if (value === 0) return `0 ${unit}`
  // Use the Unicode minus so metric deltas align visually with existing KPI formatting.
  const sign = value > 0 ? '+' : '−'
  return `${sign}${Math.abs(value)} ${unit}`
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
  const recentWorkouts = workouts.filter((workout) => workout.date >= window.recentStart && workout.date <= window.recentEnd)
  const baselineWorkouts = workouts.filter((workout) => workout.date >= window.baselineStart && workout.date <= window.baselineEnd)

  const recentDuration = getAverageMetric(recentWorkouts.map((workout) => workout.duration_min))
  const baselineDuration = getAverageMetric(baselineWorkouts.map((workout) => workout.duration_min))
  const recentRecovery = getAverageMetric(recentWellness.map((entry) => entry.recovery_score))
  const baselineRecovery = getAverageMetric(baselineWellness.map((entry) => entry.recovery_score))
  const recentHrv = getAverageMetric(recentWellness.map((entry) => entry.hrv_ms))
  const baselineHrv = getAverageMetric(baselineWellness.map((entry) => entry.hrv_ms))
  const recentRestingHr = getAverageMetric(recentWellness.map((entry) => entry.resting_hr))
  const baselineRestingHr = getAverageMetric(baselineWellness.map((entry) => entry.resting_hr))
  const recentWorkoutDays = countDistinctDates(recentWorkouts.map((workout) => workout.date))
  const baselineWorkoutDays = countDistinctDates(baselineWorkouts.map((workout) => workout.date))

  const baselineComparisons: BaselineComparison[] = [
    compareAverageMetric('Exercise duration', recentDuration, baselineDuration, 'min', true),
    compareCountMetric('Workouts logged', recentWorkoutDays, baselineWorkoutDays, 'sessions', true, MIN_WORKOUT_DAY_COUNT),
    compareAverageMetric('Recovery score', recentRecovery, baselineRecovery, 'pts', true),
    compareAverageMetric('HRV', recentHrv, baselineHrv, 'ms', true),
    compareAverageMetric('Resting HR', recentRestingHr, baselineRestingHr, 'bpm', false),
  ]

  const workoutStreak = computeWorkoutStreak(workouts)
  const recoveryStreak = computeRecoveryStreak(sortedWellness, 67)
  const streaks: PersonalStreak[] = [
    { label: 'Workout days streak', value: `${workoutStreak} day${workoutStreak === 1 ? '' : 's'}` },
    { label: 'Green recovery streak', value: `${recoveryStreak} day${recoveryStreak === 1 ? '' : 's'}` },
  ]

  const bestWorkout = [...workouts]
    .filter((workout) => workout.duration_min != null)
    .sort((a, b) => (b.duration_min ?? 0) - (a.duration_min ?? 0))[0]
  const bestRecovery = [...wellness]
    .filter((entry) => entry.recovery_score != null)
    .sort((a, b) => (b.recovery_score ?? 0) - (a.recovery_score ?? 0))[0]
  const bestHrv = [...wellness]
    .filter((entry) => entry.hrv_ms != null)
    .sort((a, b) => (b.hrv_ms ?? 0) - (a.hrv_ms ?? 0))[0]

  const bests: PersonalBest[] = [
    bestWorkout
      ? { label: 'Longest workout', value: `${bestWorkout.duration_min} min`, date: bestWorkout.date }
      : { label: 'Longest workout', value: 'No data', date: '—' },
    bestRecovery
      ? { label: 'Top recovery', value: `${bestRecovery.recovery_score}`, date: bestRecovery.date }
      : { label: 'Top recovery', value: 'No data', date: '—' },
    bestHrv
      ? { label: 'Top HRV', value: `${bestHrv.hrv_ms} ms`, date: bestHrv.date }
      : { label: 'Top HRV', value: 'No data', date: '—' },
  ]

  const trends: PersonalTrend[] = [
    trendMetric('Workout duration', recentDuration.average, baselineDuration.average, 'min', true),
    trendMetric('Recovery score', recentRecovery.average, baselineRecovery.average, 'pts', true),
    trendMetric('HRV', recentHrv.average, baselineHrv.average, 'ms', true),
    trendMetric('Resting HR', recentRestingHr.average, baselineRestingHr.average, 'bpm', false),
  ]

  return { baselineComparisons, streaks, bests, trends, window }
}

function compareAverageMetric(
  label: string,
  recent: NumericMetricWindow,
  baseline: NumericMetricWindow,
  unit: string,
  higherIsBetter: boolean,
): BaselineComparison {
  if (recent.average == null || baseline.average == null) {
    return {
      metric: label,
      currentLabel: recent.average == null ? 'No recent data' : `${recent.average} ${unit}`,
      baselineLabel: baseline.average == null ? 'No baseline data' : `${baseline.average} ${unit}`,
      deltaLabel: 'Need more data',
      state: 'insufficient',
    }
  }

  const deltaRaw = round(recent.average - baseline.average)
  const state = deltaRaw === 0 ? 'flat' : (higherIsBetter ? deltaRaw > 0 : deltaRaw < 0) ? 'improved' : 'declined'

  return {
    metric: label,
    currentLabel: `${recent.average} ${unit}`,
    baselineLabel: `${baseline.average} ${unit}`,
    deltaLabel: formatSigned(deltaRaw, unit),
    state,
  }
}

function compareCountMetric(
  label: string,
  recent: number,
  baseline: number,
  unit: string,
  higherIsBetter: boolean,
  minimumCount: number,
): BaselineComparison {
  if (recent < minimumCount || baseline < minimumCount) {
    return {
      metric: label,
      currentLabel: `${recent} ${unit}`,
      baselineLabel: `${baseline} ${unit}`,
      deltaLabel: 'Need more data',
      state: 'insufficient',
    }
  }

  const deltaRaw = recent - baseline
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

export function computeWorkoutStreak(workouts: Workout[]) {
  const dates = Array.from(new Set(workouts.map((workout) => workout.date))).sort((a, b) => b.localeCompare(a))
  if (dates.length === 0) return 0

  let streak = 1
  for (let index = 1; index < dates.length; index += 1) {
    const previous = toDate(dates[index - 1]).getTime()
    const current = toDate(dates[index]).getTime()
    if (previous - current === MS_PER_DAY) {
      streak += 1
      continue
    }
    break
  }

  return streak
}

export function computeRecoveryStreak(wellness: DailyWellness[], threshold: number) {
  if (wellness.length === 0) return 0

  let streak = 0
  for (const day of wellness) {
    if ((day.recovery_score ?? -1) >= threshold) {
      streak += 1
      continue
    }
    break
  }

  return streak
}
