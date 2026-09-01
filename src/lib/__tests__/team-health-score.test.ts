import {
  sleepNightDate, sleepScore, hrvScore, zone2Score, recoveryScore,
  strainBalanceScore, compositeScore, scoreBand, clamp, coveragePct,
  isLowConfidence, calendarDays, lastWeekWindow, currentWindow, baselineWindow,
  scoreWindow, scoreParticipant, toNightInputs, toWorkoutInputs,
  type Window, type NightInput, type WorkoutInput,
} from '../team-health-score'
import { DEFAULT_TEAM_HEALTH_SCORE_CONFIG } from '../team-health-score-config'
import type { DailyWellness, Workout } from '@/types'

// ─── Ported from Matt's test_formulas_unit.py (22 hand-computed checks) ──────
// Values/tolerances match the original Python checks exactly, adapted to our
// TS API (nights/workouts as typed arrays rather than pandas DataFrames).

describe('sleepNightDate (night mapping)', () => {
  it('11pm onset stays same night', () => {
    expect(sleepNightDate('2026-08-10T23:00:00.000Z')).toBe('2026-08-10')
  })
  it('5:59am onset rolls back a day', () => {
    expect(sleepNightDate('2026-08-11T05:59:00.000Z')).toBe('2026-08-10')
  })
  it('exactly 6:00am does NOT roll back', () => {
    expect(sleepNightDate('2026-08-11T06:00:00.000Z')).toBe('2026-08-11')
  })
  it('6:01am does NOT roll back', () => {
    expect(sleepNightDate('2026-08-11T06:01:00.000Z')).toBe('2026-08-11')
  })
})

const w: Window = { start: '2026-08-10', end: '2026-08-16' } // 7-day window

function night(overrides: Partial<NightInput>): NightInput {
  return { nightDate: '2026-08-10', sleepHours: null, hrvMs: null, recoveryPct: null, ...overrides }
}

function workout(overrides: Partial<WorkoutInput>): WorkoutInput {
  return { date: '2026-08-11', durationMin: null, zone2Pct: null, zone3Pct: null, zone4Pct: null, zone5Pct: null, ...overrides }
}

describe('sleepScore', () => {
  it('exactly at target = 100', () => {
    expect(sleepScore([night({ sleepHours: 7.5 })], w)).toBe(100.0)
  })
  it('half of target = 50', () => {
    expect(sleepScore([night({ sleepHours: 3.75 })], w)).toBe(50.0)
  })
  it('over target caps at 100', () => {
    expect(sleepScore([night({ sleepHours: 10 })], w)).toBe(100.0)
  })
  it('no nights in window -> null (deviates from Python\'s 0.0 default per product direction)', () => {
    expect(sleepScore([], w)).toBeNull()
  })
})

describe('hrvScore', () => {
  it('baseline window with baseline data = 50', () => {
    expect(hrvScore([], w, 50.0, true)).toBe(50.0)
  })
  it('baseline window with NO baseline HRV data -> null (not a synthetic 50)', () => {
    expect(hrvScore([], w, null, true)).toBeNull()
  })
  it('no change vs baseline = 50', () => {
    expect(hrvScore([night({ hrvMs: 60.0 })], w, 60.0, false)).toBe(50.0)
  })
  it('+10% vs baseline -> 50+20=70', () => {
    expect(hrvScore([night({ hrvMs: 66.0 })], w, 60.0, false)).toBe(70.0)
  })
  it('-25% vs baseline floors at 0', () => {
    expect(hrvScore([night({ hrvMs: 45.0 })], w, 60.0, false)).toBe(0.0)
  })
  it('no nights in window (non-baseline) -> null', () => {
    expect(hrvScore([], w, 60.0, false)).toBeNull()
  })
  it('no baseline HRV available -> null', () => {
    expect(hrvScore([night({ hrvMs: 60.0 })], w, null, false)).toBeNull()
  })
})

describe('zone2Score', () => {
  it('single workout, 7-day window: 60min*70%=42min zone2+ -> 6min/day -> (6/20)*100=30', () => {
    const workouts = [workout({ date: '2026-08-11', durationMin: 60, zone2Pct: 50, zone3Pct: 20, zone4Pct: 0, zone5Pct: 0 })]
    expect(zone2Score(workouts, w)).toBe(30.0)
  })
  it('no workouts in window -> null (deviates from Python\'s 0.0 default per product direction)', () => {
    expect(zone2Score([], w)).toBeNull()
  })
  it('a workout with no duration and no zone percentages at all -> null, not a measured zero', () => {
    const workouts = [workout({ date: '2026-08-11', durationMin: null, zone2Pct: null, zone3Pct: null, zone4Pct: null, zone5Pct: null })]
    expect(zone2Score(workouts, w)).toBeNull()
  })
})

describe('recoveryScore', () => {
  it('simple average passthrough', () => {
    const nights = [night({ nightDate: '2026-08-10', recoveryPct: 70.0 }), night({ nightDate: '2026-08-11', recoveryPct: 80.0 })]
    expect(recoveryScore(nights, w)).toBe(75.0)
  })
  it('no nights in window -> null', () => {
    expect(recoveryScore([], w)).toBeNull()
  })
})

describe('strainBalanceScore', () => {
  it('baseline window with baseline data = 100', () => {
    expect(strainBalanceScore(50, 50, true)).toBe(100.0)
  })
  it('baseline window with NO baseline recovery data -> null (not a synthetic 100)', () => {
    expect(strainBalanceScore(null, null, true)).toBeNull()
  })
  it('at or above baseline = 100', () => {
    expect(strainBalanceScore(80, 70, false)).toBe(100.0)
  })
  it('10% decline -> 100-20=80', () => {
    expect(strainBalanceScore(63, 70, false)).toBe(80.0)
  })
  it('50% decline floors at 0', () => {
    expect(strainBalanceScore(35, 70, false)).toBe(0.0)
  })
  it('null recovery input -> null', () => {
    expect(strainBalanceScore(null, 70, false)).toBeNull()
  })
  it('null baseline recovery -> null', () => {
    expect(strainBalanceScore(63, null, false)).toBeNull()
  })
})

describe('compositeScore', () => {
  it('known weighted sum (all components present)', () => {
    const expected = Math.round((100 * 0.30 + 50 * 0.25 + 30 * 0.20 + 75 * 0.15 + 100 * 0.10) * 10) / 10
    expect(compositeScore({ sleep: 100, hrv: 50, zone2: 30, recovery: 75, strain: 100 })).toBe(expected)
  })
  it('all components null -> null', () => {
    expect(compositeScore({ sleep: null, hrv: null, zone2: null, recovery: null, strain: null })).toBeNull()
  })
  it('renormalizes over present components when some are missing (OQ1)', () => {
    // Only sleep(30) + recovery(15) present -> weighted avg over 45, not 100
    const result = compositeScore({ sleep: 100, hrv: null, zone2: null, recovery: 50, strain: null })
    const expected = Math.round(((100 * 30 + 50 * 15) / 45) * 10) / 10
    expect(result).toBe(expected)
  })
})

describe('scoreBand', () => {
  const cases: Array<[number, string]> = [
    [35, 'Needs Support'],
    [40, 'Establishing Baseline'],
    [59.9, 'Establishing Baseline'],
    [60, 'Building Momentum'],
    [79.9, 'Building Momentum'],
    [80, 'Excelling'],
    [100, 'Excelling'],
  ]
  it.each(cases)('scoreBand(%s) -> %s', (score, expected) => {
    expect(scoreBand(score)).toBe(expected)
  })
  it('null score -> null band', () => {
    expect(scoreBand(null)).toBeNull()
  })
})

describe('clamp', () => {
  it('clamps below 0', () => expect(clamp(-10)).toBe(0))
  it('clamps above 100', () => expect(clamp(150)).toBe(100))
  it('passes through in-range values', () => expect(clamp(42)).toBe(42))
})

// ─── Windows ──────────────────────────────────────────────────────────────────

describe('window helpers', () => {
  it('calendarDays is inclusive', () => {
    expect(calendarDays({ start: '2026-08-10', end: '2026-08-16' })).toBe(7)
  })
  it('lastWeekWindow is the 7 days before currentStart', () => {
    expect(lastWeekWindow('2026-08-17')).toEqual({ start: '2026-08-10', end: '2026-08-16' })
  })
  it('currentWindow is a 7-day window starting at currentStart', () => {
    expect(currentWindow('2026-08-17')).toEqual({ start: '2026-08-17', end: '2026-08-23' })
  })
  it('baselineWindow reflects the passed-in config, not a hardcoded date', () => {
    expect(baselineWindow({ baselineStart: '2026-01-01', baselineEnd: '2026-01-31' })).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })
})

// ─── Coverage / low confidence ────────────────────────────────────────────────

describe('coveragePct / isLowConfidence', () => {
  it('full coverage for a 7-day window with 7 distinct nights', () => {
    const nights = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16']
      .map((nightDate) => night({ nightDate }))
    expect(coveragePct(nights, w)).toBe(100.0)
    expect(isLowConfidence(100.0)).toBe(false)
  })
  it('2 of 7 nights -> ~28.6% coverage, low confidence', () => {
    const nights = [night({ nightDate: '2026-08-10' }), night({ nightDate: '2026-08-11' })]
    const coverage = coveragePct(nights, w)
    expect(coverage).toBeCloseTo(28.6, 1)
    expect(isLowConfidence(coverage)).toBe(true)
  })
  it('zero nights -> 0% coverage, low confidence', () => {
    expect(coveragePct([], w)).toBe(0)
    expect(isLowConfidence(0)).toBe(true)
  })
})

// ─── scoreWindow / scoreParticipant (full pipeline + null propagation) ──────

describe('scoreWindow', () => {
  it('flags missingComponents and leaves composite partially renormalized when zone2 has no data', () => {
    const nights = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16']
      .map((nightDate) => night({ nightDate, sleepHours: 7.5, hrvMs: 60, recoveryPct: 70 }))
    const result = scoreWindow(nights, [], w, 60, 70, false)
    expect(result.missingComponents).toEqual(['zone2'])
    expect(result.zone2).toBeNull()
    expect(result.composite).not.toBeNull()
    expect(result.coveragePct).toBe(100.0)
    expect(result.lowConfidence).toBe(false)
  })

  it('reports all components missing and a null composite/band when there is no data at all', () => {
    const result = scoreWindow([], [], w, null, null, false)
    expect(result.missingComponents).toEqual(['sleep', 'hrv', 'zone2', 'recovery', 'strain'])
    expect(result.composite).toBeNull()
    expect(result.band).toBeNull()
    expect(result.lowConfidence).toBe(true)
  })
})

describe('scoreParticipant', () => {
  it('computes baseline/lastWeek/current windows using the fixed baseline window from config', () => {
    const config = DEFAULT_TEAM_HEALTH_SCORE_CONFIG // 2026-07-02..2026-07-27
    const nights: NightInput[] = [
      // baseline window nights
      { nightDate: '2026-07-10', sleepHours: 7.5, hrvMs: 60, recoveryPct: 70 },
      { nightDate: '2026-07-11', sleepHours: 7.5, hrvMs: 60, recoveryPct: 70 },
      // current window nights (currentStart 2026-08-17..2026-08-23)
      { nightDate: '2026-08-18', sleepHours: 7.5, hrvMs: 66, recoveryPct: 75 },
    ]
    const result = scoreParticipant(nights, [], '2026-08-17', config)
    expect(result.baseline.window).toEqual({ start: '2026-07-02', end: '2026-07-27' })
    expect(result.baseline.hrv).toBe(50.0) // baseline window convention
    expect(result.current.window).toEqual({ start: '2026-08-17', end: '2026-08-23' })
    // current window HRV: +10% vs baseline avg of 60 -> 50 + 10*2 = 70
    expect(result.current.hrv).toBe(70.0)
    expect(result.lastWeek.sleep).toBeNull() // no nights in the last-week window
  })
})

// ─── Adapters ─────────────────────────────────────────────────────────────────

describe('toNightInputs', () => {
  it('uses sleep_onset_time night-mapping when present', () => {
    const rows: DailyWellness[] = [{
      id: '1', participant_id: 'p1', source_batch_id: null, date: '2026-08-11',
      sleep_onset_time: '2026-08-11T05:00:00.000Z', // rolls back to 08-10 per night mapping
      recovery_score: 70, hrv_ms: 60, resting_hr: null, blood_oxygen: null, skin_temp: null,
      day_strain: null, calories: null, sleep_perf: null, sleep_hrs: 7.5, sleep_debt: null,
      sleep_need: null, deep_sleep: null, rem_sleep: null, light_sleep: null, sleep_eff: null,
      sleep_consistency: null, resp_rate: null,
    }]
    expect(toNightInputs(rows)).toEqual([{ nightDate: '2026-08-10', sleepHours: 7.5, hrvMs: 60, recoveryPct: 70 }])
  })

  it('falls back to the date column when sleep_onset_time is missing (pre-ship historical rows)', () => {
    const rows: DailyWellness[] = [{
      id: '1', participant_id: 'p1', source_batch_id: null, date: '2026-08-11',
      sleep_onset_time: null,
      recovery_score: 70, hrv_ms: 60, resting_hr: null, blood_oxygen: null, skin_temp: null,
      day_strain: null, calories: null, sleep_perf: null, sleep_hrs: 7.5, sleep_debt: null,
      sleep_need: null, deep_sleep: null, rem_sleep: null, light_sleep: null, sleep_eff: null,
      sleep_consistency: null, resp_rate: null,
    }]
    expect(toNightInputs(rows)[0].nightDate).toBe('2026-08-11')
  })
})

describe('toWorkoutInputs', () => {
  it('maps workout rows to the shape zone2Score expects', () => {
    const rows: Workout[] = [{
      id: '1', participant_id: 'p1', source_batch_id: null, date: '2026-08-11',
      start_time: '2026-08-11T07:00:00.000Z', end_time: null, activity: 'Run',
      duration_min: 60, strain: null, calories: null, max_hr: null, avg_hr: null,
      zone1_pct: null, zone2_pct: 50, zone3_pct: 20, zone4_pct: 0, zone5_pct: 0,
    }]
    expect(toWorkoutInputs(rows)).toEqual([{ date: '2026-08-11', durationMin: 60, zone2Pct: 50, zone3Pct: 20, zone4Pct: 0, zone5Pct: 0 }])
  })
})
