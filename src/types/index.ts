export type RiskLevel = 'Low' | 'Medium' | 'High'
export type RecoveryStatus = 'green' | 'yellow' | 'red'
export type InterventionStatus = 'Pending' | 'In Progress' | 'Monitoring' | 'Resolved'

export interface Participant {
  id: string
  first_name: string
  last_name: string
  department: string
  location_id: string | null
  employment_type: string | null
  title: string
  device_id: string | null
  consent: boolean
  enrolled_date: string | null
  status: string
  is_exact_data: boolean
}

export interface DailyWellness {
  id: string
  participant_id: string
  source_batch_id: string | null
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

export interface Workout {
  id: string
  participant_id: string
  source_batch_id: string | null
  date: string
  start_time: string
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

export interface Habit {
  id: string
  participant_id: string
  source_batch_id: string | null
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

export interface PulseSurvey {
  id: string
  participant_id: string
  date: string
  wellbeing_score: number | null
  burnout_score: number | null
  manager_support: number | null
  energy_score: number | null
  psych_safety: number | null
  workload_score: number | null
  work_life_balance: number | null
  recommend_score: number | null
}

export interface Intervention {
  id: string
  participant_id: string
  date_triggered: string | null
  department: string | null
  trigger_metric: string | null
  trigger_value: string | null
  intervention_type: string | null
  assigned_to: string | null
  date_actioned: string | null
  date_resolved: string | null
  outcome: InterventionStatus
  notes: string | null
  wd_notes: string | null
}

// Joined types for dashboard use
export interface ParticipantWithWellness extends Participant {
  latest_wellness: DailyWellness | null
  latest_workout: Workout | null
  latest_habits: Habit | null
  latest_pulse: PulseSurvey | null
  risk_level: RiskLevel
  recovery_status: RecoveryStatus
}

export interface TeamStats {
  avg_recovery: number
  avg_hrv: number
  avg_sleep_perf: number
  high_risk_count: number
  total_participants: number
  participation_rate: number
}

export type ImportBatchStatus = 'pending' | 'processing' | 'completed' | 'partial' | 'failed'

export interface ImportBatch {
  id: string
  imported_by: string | null
  file_name: string
  file_size_bytes: number
  file_hash_sha256: string
  status: ImportBatchStatus
  started_at: string
  completed_at: string | null
  rows_processed: number
  rows_inserted: number
  rows_updated: number
  rows_skipped: number
  rows_failed: number
}

export interface ImportRowOutcome {
  id: string
  batch_id: string
  tab_name: string
  row_number: number
  field_name: string | null
  outcome: 'failed' | 'skipped'
  message: string
  created_at: string
}

export type ChallengeStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type ChallengeMetricType = 'actions_count'
export type ChallengeEligibilityMode = 'all_participants' | 'filtered'
export type ChallengeVisibilityState = 'none' | 'ineligible' | 'eligible'

export interface ChallengeEligibilityDefinition {
  department_ids?: string[]
  location_ids?: string[]
  employment_type?: Array<'full_time' | 'part_time' | 'contractor'>
  min_tenure_days?: number
}

export interface Challenge {
  id: string
  name: string
  description: string | null
  status: ChallengeStatus
  metric_type: ChallengeMetricType
  threshold_value: number
  window_start_at: string
  window_end_at: string
  eligibility_mode: ChallengeEligibilityMode
  eligibility_definition: ChallengeEligibilityDefinition | null
  activation_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  version: number
}

export interface ChallengeParticipant {
  id: string
  challenge_id: string
  participant_id: string
  is_eligible: boolean
  eligibility_reason: string | null
  progress_value: number
  progress_last_event_at: string | null
  completed: boolean
  completed_at: string | null
  completion_source: 'event' | 'scheduled_recompute' | 'manual_repair' | null
  completion_idempotency_key: string | null
  created_at: string
  updated_at: string
}
