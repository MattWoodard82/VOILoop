import type { DailyWellness, Workout } from '@/types'
import { buildParticipantInsights } from '../insights'

function wellness(date: string, recovery: number | null, hrv: number | null, restingHr: number | null): DailyWellness {
  return {
    id: `w-${date}`,
    participant_id: 'P1',
    source_batch_id: null,
    date,
    recovery_score: recovery,
    hrv_ms: hrv,
    resting_hr: restingHr,
    blood_oxygen: null,
    skin_temp: null,
    day_strain: null,
    calories: null,
    sleep_perf: null,
    sleep_hrs: null,
    sleep_debt: null,
    sleep_need: null,
    deep_sleep: null,
    rem_sleep: null,
    light_sleep: null,
    sleep_eff: null,
    sleep_consistency: null,
    resp_rate: null,
  }
}

function workout(date: string, duration: number | null): Workout {
  return {
    id: `k-${date}-${duration}`,
    participant_id: 'P1',
    source_batch_id: null,
    date,
    start_time: `${date}T08:00:00Z`,
    end_time: null,
    activity: 'Run',
    duration_min: duration,
    strain: null,
    calories: null,
    max_hr: null,
    avg_hr: null,
    zone1_pct: null,
    zone2_pct: null,
    zone3_pct: null,
    zone4_pct: null,
    zone5_pct: null,
  }
}

describe('buildParticipantInsights', () => {
  test('builds 21-day baseline comparisons and state variants', () => {
    const wellnessData = [
      wellness('2024-06-21', 80, 75, 54),
      wellness('2024-06-20', 78, 73, 55),
      wellness('2024-06-19', 77, 72, 56),
      wellness('2024-06-18', 76, 71, 55),
      wellness('2024-06-17', 75, 70, 54),
      wellness('2024-05-31', 60, 60, 60),
      wellness('2024-05-30', 61, 59, 61),
      wellness('2024-05-29', 62, 58, 62),
      wellness('2024-05-28', 63, 57, 63),
      wellness('2024-05-27', 64, 56, 64),
    ]

    const workoutData = [
      workout('2024-06-21', 60),
      workout('2024-06-20', 55),
      workout('2024-06-19', 50),
      workout('2024-06-18', 52),
      workout('2024-05-31', 30),
      workout('2024-05-30', 30),
    ]

    const result = buildParticipantInsights(wellnessData, workoutData)
    expect(result.window).toEqual({
      recentStart: '2024-06-01',
      recentEnd: '2024-06-21',
      baselineStart: '2024-05-11',
      baselineEnd: '2024-05-31',
    })

    const restingHr = result.baselineComparisons.find((row) => row.metric === 'Resting HR')
    expect(restingHr?.state).toBe('improved')
    expect(restingHr?.deltaLabel).toBe('−7.2 bpm')

    const recovery = result.baselineComparisons.find((row) => row.metric === 'Recovery score')
    expect(recovery?.state).toBe('improved')
    expect(recovery?.deltaLabel.startsWith('+')).toBe(true)
  })

  test('handles missing data and returns insufficient wording', () => {
    const result = buildParticipantInsights(
      [
        wellness('2024-06-21', null, null, null),
        wellness('2024-05-31', null, null, null),
      ],
      [workout('2024-06-21', null)],
    )

    expect(result.baselineComparisons.find((row) => row.metric === 'Exercise duration')?.state).toBe('insufficient')
    expect(result.baselineComparisons.find((row) => row.metric === 'Workouts logged')?.state).toBe('insufficient')
    expect(result.baselineComparisons.find((row) => row.metric === 'Recovery score')?.state).toBe('insufficient')
    expect(result.baselineComparisons.find((row) => row.metric === 'HRV')?.state).toBe('insufficient')
    expect(result.baselineComparisons.find((row) => row.metric === 'Resting HR')?.state).toBe('insufficient')
    expect(result.baselineComparisons[0]?.deltaLabel).toBe('Need more data')
    expect(result.baselineComparisons.find((row) => row.metric === 'Workouts logged')?.deltaLabel).toBe('Need more data')
    expect(result.trends.every((row) => row.state === 'insufficient')).toBe(true)
    expect(result.bests.find((row) => row.label === 'Longest workout')?.value).toBe('No data')
  })
})
