// ─── Raw parsed row shapes (keyed exactly as WHOOP column headers) ─────────────

export interface RawExerciseRow {
  'Cycle start time'?: string
  'Cycle end time'?: string
  'Cycle timezone'?: string
  'Workout start time'?: string
  'Workout end time'?: string
  'Duration (min)'?: string | number
  'Activity name'?: string
  'Activity Strain'?: string | number
  'Energy burned (cal)'?: string | number
  'Max HR (bpm)'?: string | number
  'Average HR (bpm)'?: string | number
  'HR Zone 1 (% in zone)'?: string | number
  'HR Zone 2 (% in zone)'?: string | number
  'HR Zone 3 (% in zone)'?: string | number
  'HR Zone 4 (% in zone)'?: string | number
  'HR Zone 5 (% in zone)'?: string | number
  'Participant Identifier'?: string
}

export interface RawStressRow {
  'Cycle start time'?: string
  'Cycle end time'?: string
  'Cycle timezone'?: string
  'Recovery score %'?: string | number
  'Resting heart rate (bpm)'?: string | number
  'Heart rate variability (ms)'?: string | number
  'Skin temp (celsius)'?: string | number
  'Blood oxygen %'?: string | number
  'Day Strain'?: string | number
  'Energy burned (cal)'?: string | number
  'Sleep performance %'?: string | number
  'Respiratory rate (rpm)'?: string | number
  'Asleep duration (min)'?: string | number
  'In bed duration (min)'?: string | number
  'Light sleep duration (min)'?: string | number
  'Deep (SWS) duration (min)'?: string | number
  'REM duration (min)'?: string | number
  'Awake duration (min)'?: string | number
  'Sleep need (min)'?: string | number
  'Sleep debt (min)'?: string | number
  'Sleep efficiency %'?: string | number
  'Sleep consistency %'?: string | number
  'Participant Identifier'?: string
}

// Sleep tab has the same column shape as Stress for these fields
export type RawSleepRow = RawStressRow

export interface RawManualEntryRow {
  'Cycle start time'?: string
  'Cycle end time'?: string
  'Cycle timezone'?: string
  'Question text'?: string
  'Answered yes'?: string | boolean | number
  'Participant Identifier'?: string
}

// ─── Parsed / normalized DTOs ─────────────────────────────────────────────────

export interface WhoopWorkout {
  participant_id: string
  date: string           // YYYY-MM-DD in cycle-local timezone
  start_time: string     // ISO 8601
  end_time: string | null
  activity: string | null
  duration_min: number | null
  strain: number | null
  calories: number | null
  max_hr: number | null
  avg_hr: number | null
  zone1_pct: number | null
  zone2_pct: number | null
  zone3_pct: number | null
  zone4_pct: number | null
  zone5_pct: number | null
}

export interface WhoopWellness {
  participant_id: string
  date: string
  recovery_score: number | null
  hrv_ms: number | null
  resting_hr: number | null
  blood_oxygen: number | null
  skin_temp: number | null
  day_strain: number | null
  calories: number | null
  sleep_perf: number | null
  sleep_hrs: number | null
  sleep_debt: number | null
  sleep_need: number | null
  deep_sleep: number | null
  rem_sleep: number | null
  light_sleep: number | null
  sleep_eff: number | null
  sleep_consistency: number | null
  resp_rate: number | null
}

export interface WhoopHabit {
  participant_id: string
  date: string
  alcohol: boolean | null
  caffeine: boolean | null
  ate_late: boolean | null
  hydrated: boolean | null
  protein: boolean | null
  magnesium: boolean | null
  theanine: boolean | null
  creatine: boolean | null
  ashwagandha: boolean | null
  glp1: boolean | null
  tracked_calories: boolean | null
  dimmed_lights: boolean | null
  read_before_bed: boolean | null
  sauna: boolean | null
  hot_tub: boolean | null
  massage: boolean | null
  notes: string | null
}

// ─── Import result types ───────────────────────────────────────────────────────

export interface ImportRowError {
  tab: string
  row: number
  field?: string
  message: string
}

export interface ImportTabResult {
  tab: string
  processed: number
  inserted: number
  updated: number
  skipped: number
  failed: number
}

export interface ImportResult {
  batchId?: string
  status?: ImportBatchStatus
  success: boolean
  fileName: string
  tabs: ImportTabResult[]
  totals: {
    processed: number
    inserted: number
    updated: number
    skipped: number
    failed: number
  }
  errors: ImportRowError[]
}

export type ImportBatchStatus = 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
