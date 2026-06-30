import {
  TAB_EXERCISE, TAB_STRESS, TAB_SLEEP, TAB_MANUAL,
  REQUIRED_TABS, AT_LEAST_ONE_TABS, type ParsedWorkbook,
} from './parser'
import type { ImportRowError } from './types'

// ─── Required columns per tab ─────────────────────────────────────────────────

const EXERCISE_REQUIRED_COLS = [
  'Workout start time',
  'Activity name',
]

const WELLNESS_REQUIRED_COLS = [
  'Cycle start time',
]

const MANUAL_REQUIRED_COLS = [
  'Cycle start time',
  'Question text',
  'Answered yes',
]

// ─── Tab / column presence validation ─────────────────────────────────────────

export interface TabValidationResult {
  valid: boolean
  missingRequiredTabs: string[]
  missingAtLeastOneTab: boolean
  missingColumns: Record<string, string[]>
}

export function validateTabStructure(wb: ParsedWorkbook): TabValidationResult {
  const sheetNames = Object.keys(wb)

  const missingRequiredTabs = REQUIRED_TABS.filter((t) => !sheetNames.includes(t))
  const missingAtLeastOneTab = !AT_LEAST_ONE_TABS.some((t) => sheetNames.includes(t))

  const missingColumns: Record<string, string[]> = {}

  function checkColumns(tabName: string, required: string[]) {
    if (!sheetNames.includes(tabName)) return
    const rows = wb[tabName]
    if (!rows.length) return
    const cols = Object.keys(rows[0])
    const missing = required.filter((c) => !cols.includes(c))
    if (missing.length) missingColumns[tabName] = missing
  }

  checkColumns(TAB_EXERCISE, EXERCISE_REQUIRED_COLS)
  checkColumns(TAB_STRESS, WELLNESS_REQUIRED_COLS)
  checkColumns(TAB_SLEEP, WELLNESS_REQUIRED_COLS)
  checkColumns(TAB_MANUAL, MANUAL_REQUIRED_COLS)

  const valid =
    missingRequiredTabs.length === 0 &&
    !missingAtLeastOneTab &&
    Object.keys(missingColumns).length === 0

  return { valid, missingRequiredTabs, missingAtLeastOneTab, missingColumns }
}

// ─── Value coercion helpers ────────────────────────────────────────────────────

/** Convert xlsx cell value (string | number | Date | null) to a float, or null */
export function toFloat(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  if (val instanceof Date) return null
  const s = String(val).trim()
  if (s === '##########' || s === '') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

/** Convert xlsx cell value to an integer, or null */
export function toInt(val: unknown): number | null {
  const f = toFloat(val)
  return f === null ? null : Math.round(f)
}

/** Convert xlsx cell value to a boolean: 'yes'/1/true → true, else false, null if missing */
export function toBool(val: unknown): boolean | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') return val === 1
  const s = String(val).trim().toLowerCase()
  if (s === '') return null
  return s === 'true' || s === 'yes' || s === '1'
}

/**
 * Parse a WHOOP timestamp field into an ISO 8601 string.
 * WHOOP exports may have:
 *  - A JS Date from xlsx (cellDates:true)
 *  - A formatted date string like "2024-01-15 06:30:00"
 *  - The placeholder "##########"
 * Returns null on failure.
 */
export function toISOString(val: unknown): string | null {
  if (val === null || val === undefined) return null
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString()
  }
  const s = String(val).trim()
  if (s === '##########' || s === '') return null
  let normalized = s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    normalized = `${s}T00:00:00Z`
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    normalized = `${s.replace(' ', 'T')}Z`
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
    normalized = `${s}Z`
  }

  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Derive a local calendar date (YYYY-MM-DD) from a timestamp and optional
 * WHOOP cycle timezone string like "UTC-06:00".
 * Falls back to UTC date when timezone cannot be parsed.
 */
export function toLocalDate(isoTimestamp: string, timezone?: string | null): string {
  let offsetMinutes = 0
  if (timezone) {
    const match = timezone.match(/UTC([+-])(\d{1,2}):(\d{2})/)
    if (match) {
      const sign = match[1] === '+' ? 1 : -1
      offsetMinutes = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10))
    }
  }
  const ms = new Date(isoTimestamp).getTime() + offsetMinutes * 60_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Clamp a percentage value to [0, 100]; return null if out of range */
export function clampPct(val: number | null): number | null {
  if (val === null) return null
  return val >= 0 && val <= 100 ? val : null
}

/** Return null if val < 0 (non-negative duration/calories check) */
export function nonNegative(val: number | null): number | null {
  if (val === null) return null
  return val >= 0 ? val : null
}

// ─── Row-level validation (Exercise) ──────────────────────────────────────────

export interface ValidatedExerciseRow {
  employeeId: string
  date: string
  startTimeIso: string
  endTimeIso: string | null
  timezone: string | null
  activity: string | null
  durationMin: number | null
  strain: number | null
  calories: number | null
  maxHr: number | null
  avgHr: number | null
  zone1: number | null
  zone2: number | null
  zone3: number | null
  zone4: number | null
  zone5: number | null
}

export function validateExerciseRow(
  row: Record<string, unknown>,
  rowIndex: number,
  errors: ImportRowError[],
): ValidatedExerciseRow | null {
  const employeeId = String(row['Employee Identifier'] ?? '').trim()
  if (!employeeId) {
    errors.push({ tab: TAB_EXERCISE, row: rowIndex, field: 'Employee Identifier', message: 'Missing employee identifier' })
    return null
  }

  const startTimeIso = toISOString(row['Workout start time'])
  if (!startTimeIso) {
    errors.push({ tab: TAB_EXERCISE, row: rowIndex, field: 'Workout start time', message: 'Unparsable or missing workout start time' })
    return null
  }

  const timezone = row['Cycle timezone'] ? String(row['Cycle timezone']).trim() || null : null
  const date = toLocalDate(startTimeIso, timezone)
  const endTimeIso = toISOString(row['Workout end time'])

  return {
    employeeId,
    date,
    startTimeIso,
    endTimeIso,
    timezone,
    activity: row['Activity name'] ? String(row['Activity name']).trim() || null : null,
    durationMin: nonNegative(toInt(row['Duration (min)'])),
    strain: toFloat(row['Activity Strain']),
    calories: nonNegative(toInt(row['Energy burned (cal)'])),
    maxHr: nonNegative(toInt(row['Max HR (bpm)'])),
    avgHr: nonNegative(toInt(row['Average HR (bpm)'])),
    zone1: clampPct(toInt(row['HR Zone 1 (% in zone)'])),
    zone2: clampPct(toInt(row['HR Zone 2 (% in zone)'])),
    zone3: clampPct(toInt(row['HR Zone 3 (% in zone)'])),
    zone4: clampPct(toInt(row['HR Zone 4 (% in zone)'])),
    zone5: clampPct(toInt(row['HR Zone 5 (% in zone)'])),
  }
}

// ─── Row-level validation (Stress / Sleep) ────────────────────────────────────

export interface ValidatedWellnessRow {
  employeeId: string
  date: string
  recoveryScore: number | null
  hrvMs: number | null
  restingHr: number | null
  bloodOxygen: number | null
  skinTemp: number | null
  dayStrain: number | null
  calories: number | null
  sleepPerf: number | null
  sleepHrs: number | null
  sleepDebt: number | null
  sleepNeed: number | null
  deepSleep: number | null
  remSleep: number | null
  lightSleep: number | null
  sleepEff: number | null
  sleepConsistency: number | null
  respRate: number | null
}

export function validateWellnessRow(
  tabName: string,
  row: Record<string, unknown>,
  rowIndex: number,
  errors: ImportRowError[],
): ValidatedWellnessRow | null {
  const employeeId = String(row['Employee Identifier'] ?? '').trim()
  if (!employeeId) {
    errors.push({ tab: tabName, row: rowIndex, field: 'Employee Identifier', message: 'Missing employee identifier' })
    return null
  }

  const cycleStartIso = toISOString(row['Cycle start time'])
  if (!cycleStartIso) {
    errors.push({ tab: tabName, row: rowIndex, field: 'Cycle start time', message: 'Unparsable or missing cycle start time' })
    return null
  }

  const timezone = row['Cycle timezone'] ? String(row['Cycle timezone']).trim() || null : null
  const date = toLocalDate(cycleStartIso, timezone)

  // Minutes → hours helper
  const minToHrs = (v: unknown) => {
    const m = nonNegative(toFloat(v))
    return m === null ? null : parseFloat((m / 60).toFixed(2))
  }

  return {
    employeeId,
    date,
    recoveryScore: clampPct(toInt(row['Recovery score %'])),
    hrvMs: nonNegative(toInt(row['Heart rate variability (ms)'])),
    restingHr: nonNegative(toInt(row['Resting heart rate (bpm)'])),
    bloodOxygen: clampPct(toFloat(row['Blood oxygen %'])),
    skinTemp: toFloat(row['Skin temp (celsius)']),
    dayStrain: toFloat(row['Day Strain']),
    calories: nonNegative(toInt(row['Energy burned (cal)'])),
    sleepPerf: clampPct(toInt(row['Sleep performance %'])),
    sleepHrs: minToHrs(row['Asleep duration (min)']),
    sleepDebt: minToHrs(row['Sleep debt (min)']),
    sleepNeed: minToHrs(row['Sleep need (min)']),
    deepSleep: minToHrs(row['Deep (SWS) duration (min)']),
    remSleep: minToHrs(row['REM duration (min)']),
    lightSleep: minToHrs(row['Light sleep duration (min)']),
    sleepEff: clampPct(toInt(row['Sleep efficiency %'])),
    sleepConsistency: clampPct(toInt(row['Sleep consistency %'])),
    respRate: nonNegative(toFloat(row['Respiratory rate (rpm)'])),
  }
}

// ─── Row-level validation (Manual Entries) ────────────────────────────────────

export interface ValidatedManualRow {
  employeeId: string
  date: string
  questionText: string
  answeredYes: boolean
}

export function validateManualRow(
  row: Record<string, unknown>,
  rowIndex: number,
  errors: ImportRowError[],
): ValidatedManualRow | null {
  const employeeId = String(row['Employee Identifier'] ?? '').trim()
  if (!employeeId) {
    errors.push({ tab: TAB_MANUAL, row: rowIndex, field: 'Employee Identifier', message: 'Missing employee identifier' })
    return null
  }

  const cycleStartIso = toISOString(row['Cycle start time'])
  if (!cycleStartIso) {
    errors.push({ tab: TAB_MANUAL, row: rowIndex, field: 'Cycle start time', message: 'Unparsable or missing cycle start time' })
    return null
  }

  const questionText = String(row['Question text'] ?? '').trim()
  if (!questionText) {
    errors.push({ tab: TAB_MANUAL, row: rowIndex, field: 'Question text', message: 'Missing question text' })
    return null
  }

  const timezone = row['Cycle timezone'] ? String(row['Cycle timezone']).trim() || null : null
  const date = toLocalDate(cycleStartIso, timezone)
  const answeredYes = toBool(row['Answered yes']) ?? false

  return { employeeId, date, questionText, answeredYes }
}
