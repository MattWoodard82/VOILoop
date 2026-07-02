import { mapExercise, mapWellness, mapManualEntries } from '../mappers'
import type { ParsedWorkbook } from '../parser'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const exerciseRows = [
  {
    'Employee Identifier': 'E1',
    'Workout start time': '2024-01-15 08:00:00',
    'Workout end time': '2024-01-15 09:00:00',
    'Cycle timezone': 'UTC-06:00',
    'Activity name': 'Running',
    'Duration (min)': 60,
    'Activity Strain': 12.5,
    'Energy burned (cal)': 500,
    'Max HR (bpm)': 175,
    'Average HR (bpm)': 150,
    'HR Zone 1 (% in zone)': 5,
    'HR Zone 2 (% in zone)': 20,
    'HR Zone 3 (% in zone)': 30,
    'HR Zone 4 (% in zone)': 35,
    'HR Zone 5 (% in zone)': 10,
  },
  {
    // Second workout same employee same day
    'Employee Identifier': 'E1',
    'Workout start time': '2024-01-15 17:00:00',
    'Workout end time': '2024-01-15 17:45:00',
    'Cycle timezone': 'UTC-06:00',
    'Activity name': 'Cycling',
    'Duration (min)': 45,
    'Activity Strain': 8.0,
    'Energy burned (cal)': 350,
    'Max HR (bpm)': 160,
    'Average HR (bpm)': 130,
  },
]

const stressRows = [
  {
    'Employee Identifier': 'E1',
    'Cycle start time': '2024-01-15 04:00:00',
    'Cycle timezone': 'UTC-06:00',
    'Recovery score %': 65,
    'Resting heart rate (bpm)': 58,
    'Heart rate variability (ms)': 70,
    'Day Strain': 14.0,
    'Sleep performance %': 80, // will be overridden by Sleep tab
    'Asleep duration (min)': 420,
  },
]

const sleepRows = [
  {
    'Employee Identifier': 'E1',
    'Cycle start time': '2024-01-15 04:00:00',
    'Cycle timezone': 'UTC-06:00',
    'Recovery score %': 70, // Sleep tab has better data
    'Sleep performance %': 88,
    'Asleep duration (min)': 450,
    'Deep (SWS) duration (min)': 90,
    'REM duration (min)': 100,
  },
]

const manualRows = [
  {
    'Employee Identifier': 'E1',
    'Cycle start time': '2024-01-15 04:00:00',
    'Cycle timezone': 'UTC-06:00',
    'Question text': 'Did you drink alcohol last night?',
    'Answered yes': 'no',
  },
  {
    'Employee Identifier': 'E1',
    'Cycle start time': '2024-01-15 04:00:00',
    'Cycle timezone': 'UTC-06:00',
    'Question text': 'Did you consume caffeine today?',
    'Answered yes': 'yes',
  },
  {
    'Employee Identifier': 'E1',
    'Cycle start time': '2024-01-15 04:00:00',
    'Cycle timezone': 'UTC-06:00',
    'Question text': 'Did you do sauna today?',
    'Answered yes': 'yes',
  },
]

// ─── Exercise mapper ──────────────────────────────────────────────────────────

describe('mapExercise', () => {
  const wb: ParsedWorkbook = { Exercise: exerciseRows }

  test('maps two workouts with same employee same day (AC-4)', () => {
    const { workouts, errors } = mapExercise(wb)
    expect(workouts).toHaveLength(2)
    expect(errors).toHaveLength(0)
    const activities = workouts.map(w => w.activity)
    expect(activities).toContain('Running')
    expect(activities).toContain('Cycling')
  })

  test('sets start_time as ISO string', () => {
    const { workouts } = mapExercise(wb)
    workouts.forEach(w => {
      expect(typeof w.start_time).toBe('string')
      expect(w.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  test('skips row with ## timestamp and emits error', () => {
    const badWb: ParsedWorkbook = {
      Exercise: [
        { ...exerciseRows[0], 'Workout start time': '##########' },
        exerciseRows[1],
      ],
    }
    const { workouts, errors } = mapExercise(badWb)
    expect(workouts).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('Workout start time')
  })
})

// ─── Wellness mapper ─────────────────────────────────────────────────────────

describe('mapWellness', () => {
  test('Sleep tab overrides Stress for overlapping fields', () => {
    const wb: ParsedWorkbook = { Stress: stressRows, Sleep: sleepRows }
    const { wellness } = mapWellness(wb)
    expect(wellness).toHaveLength(1)
    const w = wellness[0]
    // Recovery score from Sleep tab (70) wins over Stress tab (65)
    expect(w.recovery_score).toBe(70)
    // Sleep performance from Sleep tab (88) wins over Stress tab (80)
    expect(w.sleep_perf).toBe(88)
    // Day strain from Stress tab preserved (Sleep didn't have it)
    expect(w.day_strain).toBe(14.0)
  })

  test('merges non-null fields from both tabs', () => {
    const wb: ParsedWorkbook = { Stress: stressRows, Sleep: sleepRows }
    const { wellness } = mapWellness(wb)
    const w = wellness[0]
    // hrv_ms only in Stress tab
    expect(w.hrv_ms).toBe(70)
    // deep_sleep only in Sleep tab
    expect(w.deep_sleep).toBeCloseTo(90 / 60, 2)
  })

  test('works with only Stress tab', () => {
    const wb: ParsedWorkbook = { Stress: stressRows }
    const { wellness, errors } = mapWellness(wb)
    expect(wellness).toHaveLength(1)
    expect(errors).toHaveLength(0)
    expect(wellness[0].recovery_score).toBe(65)
  })

  test('deduplicates same employee+date across rows', () => {
    const dupeRows = [...stressRows, ...stressRows]
    const wb: ParsedWorkbook = { Stress: dupeRows }
    const { wellness } = mapWellness(wb)
    expect(wellness).toHaveLength(1)
  })

  test('falls back to the matching sleep row when stress rows omit all date fields', () => {
    const wb: ParsedWorkbook = {
      Stress: [
        {
          'Employee Identifier': 'E1',
          'Cycle start time': '##########',
          'Cycle timezone': 'UTC-06:00',
          'Sleep performance %': 88,
          'Respiratory rate (rpm)': 14.3,
          'Asleep duration (min)': 450,
          'In bed duration (min)': 470,
          'Light sleep duration (min)': 260,
          'Deep (SWS) duration (min)': 90,
          'REM duration (min)': 100,
          'Awake duration (min)': 20,
          'Sleep need (min)': 480,
          'Sleep debt (min)': 15,
          'Sleep efficiency %': 96,
          'Sleep consistency %': 85,
          'Day Strain': 14,
        },
      ],
      Sleep: [
        {
          'Employee Identifier': 'E1',
          'Cycle start time': '2024-01-14 22:41:02',
          'Wake onset': '2024-01-15 07:15:00',
          'Cycle timezone': 'UTC-06:00',
          'Sleep performance %': 88,
          'Respiratory rate (rpm)': 14.3,
          'Asleep duration (min)': 450,
          'In bed duration (min)': 470,
          'Light sleep duration (min)': 260,
          'Deep (SWS) duration (min)': 90,
          'REM duration (min)': 100,
          'Awake duration (min)': 20,
          'Sleep need (min)': 480,
          'Sleep debt (min)': 15,
          'Sleep efficiency %': 96,
          'Sleep consistency %': 85,
        },
      ],
    }

    const { wellness, errors } = mapWellness(wb)
    expect(errors).toHaveLength(0)
    expect(wellness).toHaveLength(1)
    expect(wellness[0].date).toBe('2024-01-15')
    expect(wellness[0].day_strain).toBe(14)
  })
})

// ─── Manual entries mapper ────────────────────────────────────────────────────

describe('mapManualEntries', () => {
  test('pivots Q/A rows into habit booleans', () => {
    const wb: ParsedWorkbook = { 'Manual Entries': manualRows }
    const { habits, errors } = mapManualEntries(wb)
    expect(habits).toHaveLength(1)
    expect(errors).toHaveLength(0)
    const h = habits[0]
    expect(h.alcohol).toBe(false)
    expect(h.caffeine).toBe(true)
    expect(h.sauna).toBe(true)
  })

  test('any "yes" wins for same key and question', () => {
    const rows = [
      { 'Employee Identifier': 'E1', 'Cycle start time': '2024-01-15 04:00:00', 'Question text': 'Alcohol?', 'Answered yes': 'no' },
      { 'Employee Identifier': 'E1', 'Cycle start time': '2024-01-15 04:00:00', 'Question text': 'Alcohol?', 'Answered yes': 'yes' },
    ]
    const wb: ParsedWorkbook = { 'Manual Entries': rows }
    const { habits } = mapManualEntries(wb)
    expect(habits[0].alcohol).toBe(true)
  })

  test('returns empty array when tab absent', () => {
    const { habits } = mapManualEntries({})
    expect(habits).toHaveLength(0)
  })

  test('unknown question text leaves all fields null except matched ones', () => {
    const rows = [
      { 'Employee Identifier': 'E1', 'Cycle start time': '2024-01-15 04:00:00', 'Question text': 'Unknown habit?', 'Answered yes': 'yes' },
    ]
    const { habits } = mapManualEntries({ 'Manual Entries': rows })
    const h = habits[0]
    expect(h.alcohol).toBeNull()
    expect(h.caffeine).toBeNull()
  })

  test('uses the sleep/stress cycle date for overnight manual entries', () => {
    const wb: ParsedWorkbook = {
      Sleep: [
        {
          'Employee Identifier': 'E1',
          'Cycle start time': '2024-01-14 22:41:02',
          'Cycle timezone': 'UTC-06:00',
          'Wake onset': '2024-01-15 07:15:00',
        },
      ],
      'Manual Entries': [
        {
          'Employee Identifier': 'E1',
          'Cycle start time': '2024-01-14 22:41:02',
          'Cycle timezone': 'UTC-06:00',
          'Question text': 'Did you drink alcohol last night?',
          'Answered yes': 'yes',
        },
      ],
    }

    const { habits } = mapManualEntries(wb)
    expect(habits[0].date).toBe('2024-01-15')
  })

  test('maps the common ashwaganda spelling from WHOOP exports', () => {
    const wb: ParsedWorkbook = {
      'Manual Entries': [
        {
          'Employee Identifier': 'E1',
          'Cycle start time': '2024-01-15 04:00:00',
          'Question text': 'Took ashwaganda?',
          'Answered yes': 'yes',
        },
      ],
    }

    const { habits } = mapManualEntries(wb)
    expect(habits[0].ashwagandha).toBe(true)
  })
})
