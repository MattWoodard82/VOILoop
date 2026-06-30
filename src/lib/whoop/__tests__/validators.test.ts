import {
  toFloat, toInt, toBool, toISOString, toLocalDate, clampPct, nonNegative,
  validateTabStructure, validateExerciseRow, validateWellnessRow, validateManualRow,
} from '../validators'
import type { ParsedWorkbook } from '../parser'
import type { ImportRowError } from '../types'

// ─── Value coercion ────────────────────────────────────────────────────────────

describe('toFloat', () => {
  test('parses numeric string', () => expect(toFloat('3.14')).toBeCloseTo(3.14))
  test('passes through number', () => expect(toFloat(42)).toBe(42))
  test('returns null for ##########', () => expect(toFloat('##########')).toBeNull())
  test('returns null for empty string', () => expect(toFloat('')).toBeNull())
  test('returns null for null', () => expect(toFloat(null)).toBeNull())
  test('returns null for NaN string', () => expect(toFloat('abc')).toBeNull())
})

describe('toInt', () => {
  test('rounds float', () => expect(toInt(2.7)).toBe(3))
  test('parses int string', () => expect(toInt('10')).toBe(10))
  test('returns null for null', () => expect(toInt(null)).toBeNull())
})

describe('toBool', () => {
  test('yes → true', () => expect(toBool('yes')).toBe(true))
  test('YES → true', () => expect(toBool('YES')).toBe(true))
  test('true → true', () => expect(toBool('true')).toBe(true))
  test('1 → true', () => expect(toBool(1)).toBe(true))
  test('no → false', () => expect(toBool('no')).toBe(false))
  test('false → false', () => expect(toBool('false')).toBe(false))
  test('empty → null', () => expect(toBool('')).toBeNull())
  test('null → null', () => expect(toBool(null)).toBeNull())
})

describe('toISOString', () => {
  test('JS Date', () => {
    const d = new Date('2024-03-15T08:00:00Z')
    expect(toISOString(d)).toBe('2024-03-15T08:00:00.000Z')
  })
  test('parses date string', () => {
    const iso = toISOString('2024-03-15 08:00:00')
    expect(iso).toBe('2024-03-15T08:00:00.000Z')
  })
  test('returns null for ##########', () => expect(toISOString('##########')).toBeNull())
  test('returns null for invalid', () => expect(toISOString('not a date')).toBeNull())
})

describe('toLocalDate', () => {
  test('applies negative offset', () => {
    // 2024-01-15 03:00:00 UTC minus 6h = 2024-01-14 21:00 local → date 2024-01-14
    const result = toLocalDate('2024-01-15T03:00:00.000Z', 'UTC-06:00')
    expect(result).toBe('2024-01-14')
  })
  test('applies positive offset', () => {
    const result = toLocalDate('2024-01-15T22:00:00.000Z', 'UTC+02:00')
    expect(result).toBe('2024-01-16')
  })
  test('falls back to UTC for unparseable timezone', () => {
    const result = toLocalDate('2024-01-15T00:00:00.000Z', 'weird')
    expect(result).toBe('2024-01-15')
  })
})

describe('clampPct', () => {
  test('keeps value in range', () => expect(clampPct(80)).toBe(80))
  test('rejects > 100', () => expect(clampPct(101)).toBeNull())
  test('rejects < 0', () => expect(clampPct(-1)).toBeNull())
  test('null passthrough', () => expect(clampPct(null)).toBeNull())
})

describe('nonNegative', () => {
  test('keeps 0', () => expect(nonNegative(0)).toBe(0))
  test('rejects negative', () => expect(nonNegative(-5)).toBeNull())
  test('null passthrough', () => expect(nonNegative(null)).toBeNull())
})

// ─── Tab structure validation ──────────────────────────────────────────────────

describe('validateTabStructure', () => {
  const baseWb: ParsedWorkbook = {
    Exercise: [{ 'Employee Identifier': 'E1', 'Workout start time': '2024-01-15 08:00:00', 'Activity name': 'Run' }],
    Stress: [{ 'Employee Identifier': 'E1', 'Cycle start time': '2024-01-15 00:00:00' }],
  }

  test('valid workbook passes', () => {
    const r = validateTabStructure(baseWb)
    expect(r.valid).toBe(true)
    expect(r.missingRequiredTabs).toHaveLength(0)
    expect(r.missingAtLeastOneTab).toBe(false)
  })

  test('missing Exercise tab fails', () => {
    const wb = { Stress: baseWb.Stress }
    const r = validateTabStructure(wb)
    expect(r.valid).toBe(false)
    expect(r.missingRequiredTabs).toContain('Exercise')
  })

  test('missing both Stress and Sleep fails', () => {
    const wb = { Exercise: baseWb.Exercise }
    const r = validateTabStructure(wb)
    expect(r.valid).toBe(false)
    expect(r.missingAtLeastOneTab).toBe(true)
  })

  test('missing required column reported', () => {
    const wb: ParsedWorkbook = {
      Exercise: [{ 'Employee Identifier': 'E1', 'Activity name': 'Run' }], // missing Workout start time
      Stress: baseWb.Stress,
    }
    const r = validateTabStructure(wb)
    expect(r.valid).toBe(false)
    expect(r.missingColumns['Exercise']).toContain('Workout start time')
  })
})

// ─── Row validators ────────────────────────────────────────────────────────────

describe('validateExerciseRow', () => {
  const validRow = {
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
  }

  test('validates good row', () => {
    const errors: ImportRowError[] = []
    const result = validateExerciseRow(validRow, 2, errors)
    expect(result).not.toBeNull()
    expect(errors).toHaveLength(0)
    expect(result!.employeeId).toBe('E1')
    expect(result!.activity).toBe('Running')
  })

  test('fails on missing employee id', () => {
    const errors: ImportRowError[] = []
    const row = { ...validRow, 'Employee Identifier': '' }
    const result = validateExerciseRow(row, 2, errors)
    expect(result).toBeNull()
    expect(errors[0].field).toBe('Employee Identifier')
  })

  test('fails on ## timestamp', () => {
    const errors: ImportRowError[] = []
    const row = { ...validRow, 'Workout start time': '##########' }
    const result = validateExerciseRow(row, 2, errors)
    expect(result).toBeNull()
    expect(errors[0].field).toBe('Workout start time')
  })

  test('clamps zone percentage out of range', () => {
    const errors: ImportRowError[] = []
    const row = { ...validRow, 'HR Zone 1 (% in zone)': 110 }
    const result = validateExerciseRow(row, 2, errors)
    expect(result).not.toBeNull()
    expect(result!.zone1).toBeNull()
  })
})

describe('validateWellnessRow', () => {
  const validRow = {
    'Employee Identifier': 'E1',
    'Cycle start time': '2024-01-15 00:00:00',
    'Cycle timezone': 'UTC-06:00',
    'Recovery score %': 75,
    'Resting heart rate (bpm)': 55,
    'Heart rate variability (ms)': 80,
    'Sleep performance %': 85,
    'Asleep duration (min)': 450,
  }

  test('validates good row', () => {
    const errors: ImportRowError[] = []
    const result = validateWellnessRow('Stress', validRow, 2, errors)
    expect(result).not.toBeNull()
    expect(result!.recoveryScore).toBe(75)
    expect(result!.sleepHrs).toBeCloseTo(7.5)
  })

  test('rejects out-of-range recovery score', () => {
    const errors: ImportRowError[] = []
    const row = { ...validRow, 'Recovery score %': 150 }
    const result = validateWellnessRow('Stress', row, 2, errors)
    expect(result).not.toBeNull()
    expect(result!.recoveryScore).toBeNull()
  })
})

describe('validateManualRow', () => {
  test('parses answered yes row', () => {
    const errors: ImportRowError[] = []
    const row = {
      'Employee Identifier': 'E1',
      'Cycle start time': '2024-01-15 00:00:00',
      'Question text': 'Did you drink alcohol?',
      'Answered yes': 'yes',
    }
    const result = validateManualRow(row, 2, errors)
    expect(result).not.toBeNull()
    expect(result!.answeredYes).toBe(true)
    expect(result!.questionText).toBe('Did you drink alcohol?')
  })
})
