import type { WhoopWorkout, WhoopWellness, WhoopHabit } from './types'
import type { ImportRowError } from './types'
import {
  TAB_EXERCISE, TAB_STRESS, TAB_SLEEP, TAB_MANUAL,
  type ParsedWorkbook,
} from './parser'
import {
  validateExerciseRow, validateWellnessRow, validateManualRow,
  getCycleLookupKey, resolveWellnessDate,
  type ValidatedWellnessRow,
} from './validators'

// ─── Exercise → workouts ───────────────────────────────────────────────────────

export interface MappedExercise {
  workouts: WhoopWorkout[]
  errors: ImportRowError[]
  processed: number
}

export function mapExercise(wb: ParsedWorkbook): MappedExercise {
  const rows = wb[TAB_EXERCISE] ?? []
  const errors: ImportRowError[] = []
  const workouts: WhoopWorkout[] = []

  for (let i = 0; i < rows.length; i++) {
    const validated = validateExerciseRow(rows[i], i + 2, errors) // +2: header=1
    if (!validated) continue
    workouts.push({
      participant_id: validated.participantId,
      date: validated.date,
      start_time: validated.startTimeIso,
      end_time: validated.endTimeIso,
      activity: validated.activity,
      duration_min: validated.durationMin,
      strain: validated.strain,
      calories: validated.calories,
      max_hr: validated.maxHr,
      avg_hr: validated.avgHr,
      zone1_pct: validated.zone1,
      zone2_pct: validated.zone2,
      zone3_pct: validated.zone3,
      zone4_pct: validated.zone4,
      zone5_pct: validated.zone5,
    })
  }

  return { workouts, errors, processed: rows.length }
}

// ─── Stress / Sleep → daily_wellness ─────────────────────────────────────────
//
// Precedence rule (documented):
//   Sleep tab takes precedence over Stress tab for all overlapping fields.
//   Rationale: the Sleep sheet is the authoritative source for sleep-cycle metrics;
//   the Stress sheet may contain older or partially backfilled data.
//   Non-overlapping fields from Stress are merged in when Sleep has a null.

export interface MappedWellness {
  wellness: WhoopWellness[]
  errors: ImportRowError[]
  processed: number
}

const WELLNESS_SIGNATURE_FIELDS = [
  'Sleep performance %',
  'Respiratory rate (rpm)',
  'Asleep duration (min)',
  'In bed duration (min)',
  'Light sleep duration (min)',
  'Deep (SWS) duration (min)',
  'REM duration (min)',
  'Awake duration (min)',
  'Sleep need (min)',
  'Sleep debt (min)',
  'Sleep efficiency %',
  'Sleep consistency %',
] as const

function getWellnessSignature(row: Record<string, unknown>): string | null {
  const parts = WELLNESS_SIGNATURE_FIELDS.map((field) => {
    const value = row[field]
    return value === null || value === undefined || value === '' ? '' : String(value).trim()
  })

  return parts.some(Boolean) ? parts.join('|') : null
}

function mergeWellness(
  base: ValidatedWellnessRow,
  override: ValidatedWellnessRow,
): ValidatedWellnessRow {
  // override wins for non-null values
  return {
    participantId: override.participantId,
    date: override.date,
    recoveryScore: override.recoveryScore ?? base.recoveryScore,
    hrvMs: override.hrvMs ?? base.hrvMs,
    restingHr: override.restingHr ?? base.restingHr,
    bloodOxygen: override.bloodOxygen ?? base.bloodOxygen,
    skinTemp: override.skinTemp ?? base.skinTemp,
    dayStrain: override.dayStrain ?? base.dayStrain,
    calories: override.calories ?? base.calories,
    sleepPerf: override.sleepPerf ?? base.sleepPerf,
    sleepHrs: override.sleepHrs ?? base.sleepHrs,
    sleepDebt: override.sleepDebt ?? base.sleepDebt,
    sleepNeed: override.sleepNeed ?? base.sleepNeed,
    deepSleep: override.deepSleep ?? base.deepSleep,
    remSleep: override.remSleep ?? base.remSleep,
    lightSleep: override.lightSleep ?? base.lightSleep,
    sleepEff: override.sleepEff ?? base.sleepEff,
    sleepConsistency: override.sleepConsistency ?? base.sleepConsistency,
    respRate: override.respRate ?? base.respRate,
  }
}

function validatedToWellness(v: ValidatedWellnessRow): WhoopWellness {
  return {
    participant_id: v.participantId,
    date: v.date,
    recovery_score: v.recoveryScore,
    hrv_ms: v.hrvMs,
    resting_hr: v.restingHr,
    blood_oxygen: v.bloodOxygen,
    skin_temp: v.skinTemp,
    day_strain: v.dayStrain,
    calories: v.calories,
    sleep_perf: v.sleepPerf,
    sleep_hrs: v.sleepHrs,
    sleep_debt: v.sleepDebt,
    sleep_need: v.sleepNeed,
    deep_sleep: v.deepSleep,
    rem_sleep: v.remSleep,
    light_sleep: v.lightSleep,
    sleep_eff: v.sleepEff,
    sleep_consistency: v.sleepConsistency,
    resp_rate: v.respRate,
  }
}

export function mapWellness(wb: ParsedWorkbook): MappedWellness {
  const errors: ImportRowError[] = []
  // keyed by `${participantId}|${date}`
  const stressMap = new Map<string, ValidatedWellnessRow>()
  const sleepMap = new Map<string, ValidatedWellnessRow>()
  const sleepDateBySignature = new Map<string, string>()
  let processed = 0

  for (const row of wb[TAB_SLEEP] ?? []) {
    const signature = getWellnessSignature(row)
    const date = resolveWellnessDate(row)
    if (signature && date) {
      sleepDateBySignature.set(signature, date)
    }
  }

  if (wb[TAB_STRESS]) {
    const rows = wb[TAB_STRESS]
    processed += rows.length
    for (let i = 0; i < rows.length; i++) {
      const signature = getWellnessSignature(rows[i])
      const fallbackDate = signature ? sleepDateBySignature.get(signature) ?? null : null
      const v = validateWellnessRow(TAB_STRESS, rows[i], i + 2, errors, fallbackDate)
      if (!v) continue
      const key = `${v.participantId}|${v.date}`
      const existing = stressMap.get(key)
      // keep the entry with the most non-null fields (last-write wins for same key)
      stressMap.set(key, existing ? mergeWellness(existing, v) : v)
    }
  }

  if (wb[TAB_SLEEP]) {
    const rows = wb[TAB_SLEEP]
    processed += rows.length
    for (let i = 0; i < rows.length; i++) {
      const v = validateWellnessRow(TAB_SLEEP, rows[i], i + 2, errors)
      if (!v) continue
      const key = `${v.participantId}|${v.date}`
      const existing = sleepMap.get(key)
      sleepMap.set(key, existing ? mergeWellness(existing, v) : v)
    }
  }

  // Merge: Sleep overrides Stress for each (participant, date) key
  const merged = new Map<string, ValidatedWellnessRow>()
  Array.from(stressMap.entries()).forEach(([key, stressRow]) => {
    merged.set(key, stressRow)
  })
  Array.from(sleepMap.entries()).forEach(([key, sleepRow]) => {
    const existing = merged.get(key)
    merged.set(key, existing ? mergeWellness(existing, sleepRow) : sleepRow)
  })

  const wellness = Array.from(merged.values()).map(validatedToWellness)
  return { wellness, errors, processed }
}

// ─── Manual Entries → habits (pivot Q/A rows) ─────────────────────────────────
//
// Maps question-text keywords to habit columns.
// Matching is case-insensitive and substring-based.
// Multiple rows for same (participant, date) are collapsed: any "yes" wins.

const QUESTION_MAP: [RegExp, keyof Omit<WhoopHabit, 'id' | 'participant_id' | 'date' | 'notes'>][] = [
  [/alcohol/i, 'alcohol'],
  [/caffeine/i, 'caffeine'],
  [/late meal|ate late/i, 'ate_late'],
  [/hydrat/i, 'hydrated'],
  [/protein/i, 'protein'],
  [/magnesium/i, 'magnesium'],
  [/theanine/i, 'theanine'],
  [/creatine/i, 'creatine'],
  [/ashwagandha|ashwaganda/i, 'ashwagandha'],
  [/glp.?1/i, 'glp1'],
  [/calories tracked|tracked calories/i, 'tracked_calories'],
  [/dimmed lights/i, 'dimmed_lights'],
  [/read before bed/i, 'read_before_bed'],
  [/sauna/i, 'sauna'],
  [/hot tub/i, 'hot_tub'],
  [/massage/i, 'massage'],
]

type HabitFields = Omit<WhoopHabit, 'participant_id' | 'date' | 'notes'>

export interface MappedHabits {
  habits: WhoopHabit[]
  errors: ImportRowError[]
  processed: number
}

export function mapManualEntries(wb: ParsedWorkbook): MappedHabits {
  if (!wb[TAB_MANUAL]) return { habits: [], errors: [], processed: 0 }

  const rows = wb[TAB_MANUAL]
  const errors: ImportRowError[] = []
  const cycleDateLookup = new Map<string, string>()
  // keyed by `${participantId}|${date}`
  const habitMap = new Map<string, HabitFields>()

  for (const tab of [TAB_STRESS, TAB_SLEEP] as const) {
    for (const row of wb[tab] ?? []) {
      const key = getCycleLookupKey(row['Cycle start time'])
      const date = resolveWellnessDate(row)
      if (key && date) {
        cycleDateLookup.set(key, date)
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const v = validateManualRow(rows[i], i + 2, errors, cycleDateLookup)
    if (!v) continue
    const key = `${v.participantId}|${v.date}`
    if (!habitMap.has(key)) {
      habitMap.set(key, {
        alcohol: null, caffeine: null, ate_late: null, hydrated: null,
        protein: null, magnesium: null, theanine: null, creatine: null,
        ashwagandha: null, glp1: null, tracked_calories: null,
        dimmed_lights: null, read_before_bed: null, sauna: null,
        hot_tub: null, massage: null,
      })
    }
    const entry = habitMap.get(key)!
    for (const [pattern, field] of QUESTION_MAP) {
      if (pattern.test(v.questionText)) {
        // Once set to true, keep true (any "yes" wins)
        if (entry[field] !== true) {
          entry[field] = v.answeredYes
        }
      }
    }
  }

  const habits: WhoopHabit[] = Array.from(habitMap.entries()).map(([key, fields]) => {
    const [participantId, date] = key.split('|')
    return { participant_id: participantId, date, ...fields, notes: null }
  })

  return { habits, errors, processed: rows.length }
}
