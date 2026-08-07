export type RiskLevel = 'Low' | 'Medium' | 'High'
export type RecoveryStatus = 'green' | 'yellow' | 'red'
export type InterventionStatus = 'Pending' | 'In Progress' | 'Monitoring' | 'Resolved'

export interface Participant {
  id: string
  auth_user_id?: string | null
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
  confident_health: boolean | null
  body_trending_good: boolean | null
  energy_level: number | null
  rest_quality: number | null
  stress_level: number | null
  physical_activity: string[] | null
  mental_wellbeing: number | null
  program_supported: 'yes' | 'neutral' | 'no' | null
  whoop_reviewed: 'yes_regularly' | 'yes_once' | 'no' | null
  health_flag: string | null
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
  participant_id: string | null
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

// Scoring and engagement types
export type RiskTier = 'green' | 'yellow' | 'red' | 'no_data'
export type ColdStartStatus = 'cold_start' | 'active'

export interface LoginActivity {
  id: string
  participant_id: string
  logged_in_at: string
  logged_out_at: string | null
  session_duration_seconds: number | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  updated_at: string
}

export interface NudgeTarget {
  id: string
  participant_id: string
  nudge_type: string
  target_context: Record<string, unknown> | null
  created_at: string
  expires_at: string
  updated_at: string
}

export interface NudgeResponse {
  id: string
  nudge_target_id: string
  participant_id: string
  response_type: string
  responded_at: string
  response_context: Record<string, unknown> | null
  created_at: string
}

export interface EngagementScoreWeights {
  id: string
  organization_id: string | null
  weight_name: string
  weight_value: number
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface RiskFlag {
  id: string
  participant_id: string
  flag_type: string
  is_active: boolean
  severity: 'low' | 'medium' | 'high' | null
  override_state: 'dismissed' | 'snoozed' | null
  override_reason: string | null
  override_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface LeaderboardMetricSnapshot {
  id: string
  participant_id: string
  week_start_date: string
  week_end_date: string
  engagement_score: number | null
  recovery_score_avg: number | null
  hrv_avg: number | null
  sleep_perf_avg: number | null
  strain_avg: number | null
  login_count: number
  pulse_survey_count: number
  workout_count: number
  data_completeness_pct: number | null
  rank_in_department: number | null
  created_at: string
  updated_at: string
}

// Scoring result types
export interface EngagementScoreResult {
  score: number // 0-100
  login_frequency_component: number
  pulse_survey_component: number
  data_submission_component: number
  intervention_follow_up_component: number
  trend_consistency_component: number
}

export interface PhysiologicalTrendResult {
  is_declining: boolean
  decline_metric_count: number
  metrics_evaluated: Array<{
    metric_name: string
    is_declining: boolean
    recent_avg: number | null
    baseline_avg: number | null
  }>
}

export interface RiskAssessmentResult {
  risk_tier: RiskTier
  cold_start_status: ColdStartStatus
  days_enrolled: number
  physiological_trend: PhysiologicalTrendResult | null
  engagement_score: EngagementScoreResult | null
  has_active_overrides: boolean
  explanation: string
}

export interface WeekWindow {
  start_date: Date
  end_date: Date
  monday_of_week: Date
}
