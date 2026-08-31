// Team Health Score / 5-Metric Breakdown (GH issue #119)
//
// Direct TS port of Matt's team_health_score.py — the single source of
// truth for this scoring logic. The dashboard should call these functions
// rather than re-implementing the formulas, so numbers can never drift from
// Matt's existing reports.
//
// This is a DIFFERENT metric from the FR-13 "Engagement score" (submission
// consistency / device wear / pulse completion / nudge response / workout
// volume, see wellness-director-config.ts) — a physiological composite
// computed straight from raw WHOOP data, with its own fixed (not
// admin-configurable) component weights.
//
// One deliberate deviation from the Python: per explicit product direction,
// component scores are `null` (not Matt's 0.0/50.0/100.0 placeholders) when
// there is zero underlying data for a window, so the UI can always tell
// "genuinely low" apart from "we don't know." The composite is computed by
// renormalizing over whichever components ARE present, and is only `null`
// when every component is missing. `is_baseline_window`-driven constants
// (HRV/strain's neutral values for the baseline window itself) are kept as
// Matt intends them — those aren't missing-data placeholders, they're a
// defined convention (the baseline period can't be meaningfully compared to
// itself).
import type { DailyWellness, Workout } from '@/types'
import type { TeamHealthScoreConfig } from './team-health-score-config'

// ─── Constants — reverse-engineered from Matt's existing reports; not yet ────
// explicitly signed off by Matt (see README caveat in issue #119).
export const SLEEP_TARGET_HOURS = 7.5
export const HRV_PCT_MULTIPLIER = 2.0
export const ZONE2_TARGET_MIN_PER_DAY = 20.0
export const STRAIN_DECLINE_MULTIPLIER = 2.0

export type TeamHealthComponentKey = 'sleep' | 'hrv' | 'zone2' | 'recovery' | 'strain'

// Fixed weights (percentages, summing to 100). Unlike FR-13's engagement
// weights, these are NOT admin-configurable per Matt's spec.
export const TEAM_HEALTH_WEIGHTS: Record<TeamHealthComponentKey, number> = {
  sleep: 30,
  hrv: 25,
  zone2: 20,
  recovery: 15,
  strain: 10,
}

export const SCORE_BANDS: Array<{ min: number; max: number; label: string }> = [
  { min: 0, max: 40, label: 'Needs Support' },
  { min: 40, max: 60, label: 'Establishing Baseline' },
  { min: 60, max: 80, label: 'Building Momentum' },
  { min: 80, max: 101, label: 'Excelling' }, // 101 so 100 is inclusive
]

export function clamp(value: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function avgOf(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// ─── Date helpers (dates are 'YYYY-MM-DD' strings throughout) ────────────────

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime()
  return Math.round((endMs - startMs) / 86_400_000)
}

// ─── Night mapping — critical, easy-to-miss correction per Matt's spec ───────
//
// Rule: onset >= 6:00 AM -> belongs to that date's night.
//       onset <  6:00 AM -> belongs to the PREVIOUS date's night (a late
//       bedtime that rolled past midnight).
//
// `sleepOnsetIso` is expected to already be in the wall-clock timezone the
// CSV was in (our toISOString() normalizes without applying any timezone
// conversion, exactly like the rest of the WHOOP import pipeline), so the
// hour extracted here is the raw wall-clock hour, matching Matt's Python
// (which reads a naive/local pd.Timestamp with no tz conversion either).
export function sleepNightDate(sleepOnsetIso: string): string {
  const datePart = sleepOnsetIso.slice(0, 10)
  const hour = Number(sleepOnsetIso.slice(11, 13))
  return hour < 6 ? shiftDate(datePart, -1) : datePart
}

// ─── Window definitions ───────────────────────────────────────────────────────

export interface Window {
  start: string // 'YYYY-MM-DD'
  end: string   // 'YYYY-MM-DD', inclusive
}

export function calendarDays(window: Window): number {
  return daysBetween(window.start, window.end) + 1
}

function windowContains(window: Window, date: string): boolean {
  return date >= window.start && date <= window.end
}

export function baselineWindow(config: TeamHealthScoreConfig): Window {
  return { start: config.baselineStart, end: config.baselineEnd }
}

/** Given the Current window's start date, returns the prior 7-day window. */
export function lastWeekWindow(currentStart: string): Window {
  const end = shiftDate(currentStart, -1)
  const start = shiftDate(end, -6)
  return { start, end }
}

export function currentWindow(currentStart: string): Window {
  return { start: currentStart, end: shiftDate(currentStart, 6) }
}

// ─── Adapters — turn our normalized DailyWellness[]/Workout[] rows into the ──
// "nights"/"workouts" shapes the scoring functions expect (Phase 2, folded in
// here since both directions are thin and used nowhere else).

export interface NightInput {
  nightDate: string
  sleepHours: number | null
  hrvMs: number | null
  recoveryPct: number | null
}

export interface WorkoutInput {
  date: string
  durationMin: number | null
  zone2Pct: number | null
  zone3Pct: number | null
  zone4Pct: number | null
  zone5Pct: number | null
}

// Rows without a captured sleep_onset_time (imported before this feature
// shipped) fall back to the existing `date` column — a small ±1-day drift
// risk right at the midnight boundary, flagged in the implementation plan,
// affecting only historical rows.
export function toNightInputs(wellnessRows: DailyWellness[]): NightInput[] {
  return wellnessRows.map((row) => ({
    nightDate: row.sleep_onset_time ? sleepNightDate(row.sleep_onset_time) : row.date,
    sleepHours: row.sleep_hrs,
    hrvMs: row.hrv_ms,
    recoveryPct: row.recovery_score,
  }))
}

export function toWorkoutInputs(workouts: Workout[]): WorkoutInput[] {
  return workouts.map((w) => ({
    date: w.date,
    durationMin: w.duration_min,
    zone2Pct: w.zone2_pct,
    zone3Pct: w.zone3_pct,
    zone4Pct: w.zone4_pct,
    zone5Pct: w.zone5_pct,
  }))
}

function nightsInWindow(nights: NightInput[], window: Window): NightInput[] {
  return nights.filter((n) => windowContains(window, n.nightDate))
}

function workoutsInWindow(workouts: WorkoutInput[], window: Window): WorkoutInput[] {
  return workouts.filter((w) => windowContains(window, w.date))
}

// ─── Component scores — each returns a 0-100 float, or null when there is ────
// zero underlying data for the window (see file header re: null vs. Matt's
// Python defaults).

/** (a) Avg Sleep Duration — 30% weight. */
export function sleepScore(nights: NightInput[], window: Window): number | null {
  const withData = nightsInWindow(nights, window).filter((n): n is NightInput & { sleepHours: number } => n.sleepHours != null)
  if (withData.length === 0) return null
  const avgSleepHours = avgOf(withData.map((n) => n.sleepHours))
  return round1(clamp((avgSleepHours / SLEEP_TARGET_HOURS) * 100))
}

/** (b) Avg HRV (trend) — 25% weight. Relative to the participant's own baseline. */
export function hrvScore(
  nights: NightInput[],
  window: Window,
  baselineHrvMs: number | null,
  isBaselineWindow: boolean,
): number | null {
  // Not a missing-data placeholder — a defined convention: the baseline
  // window's own HRV trend can't be meaningfully compared to itself. But this
  // only applies once we've confirmed the baseline actually has HRV data —
  // otherwise a participant with zero baseline nights would get a synthetic
  // "neutral" 50.0 baseline score instead of the null that reflects reality.
  if (isBaselineWindow) return baselineHrvMs != null ? 50.0 : null
  const withData = nightsInWindow(nights, window).filter((n): n is NightInput & { hrvMs: number } => n.hrvMs != null)
  if (withData.length === 0 || baselineHrvMs == null || baselineHrvMs === 0) return null
  const windowHrvMs = avgOf(withData.map((n) => n.hrvMs))
  const pctChange = ((windowHrvMs - baselineHrvMs) / baselineHrvMs) * 100
  return round1(clamp(50.0 + pctChange * HRV_PCT_MULTIPLIER))
}

/** (c) Zone 2+ Activity Time — 20% weight. */
export function zone2Score(workouts: WorkoutInput[], window: Window): number | null {
  // A workout row with no duration and no Zone 2-5 percentages at all carries
  // zero information, not a real zero-minute reading. Coercing it to 0 would
  // count it as "measured" and drag the activity score down, contradicting
  // the null-for-no-underlying-data convention used elsewhere in this file.
  const measurable = workoutsInWindow(workouts, window).filter(
    (w) => w.durationMin != null && [w.zone2Pct, w.zone3Pct, w.zone4Pct, w.zone5Pct].some((pct) => pct != null),
  )
  if (measurable.length === 0) return null

  const totalMinutes = measurable.reduce((sum, w) => {
    const duration = w.durationMin ?? 0
    const zone2plusPct = (w.zone2Pct ?? 0) + (w.zone3Pct ?? 0) + (w.zone4Pct ?? 0) + (w.zone5Pct ?? 0)
    return sum + (duration * zone2plusPct) / 100
  }, 0)

  // Denominator is CALENDAR days in the window, not just days with a workout.
  const zone2MinPerDay = totalMinutes / calendarDays(window)
  return round1(clamp((zone2MinPerDay / ZONE2_TARGET_MIN_PER_DAY) * 100))
}

/** (d) Avg Recovery Score — 15% weight. Direct passthrough, no transform. */
export function recoveryScore(nights: NightInput[], window: Window): number | null {
  const withData = nightsInWindow(nights, window).filter((n): n is NightInput & { recoveryPct: number } => n.recoveryPct != null)
  if (withData.length === 0) return null
  return round1(clamp(avgOf(withData.map((n) => n.recoveryPct))))
}

/** (e) Strain-Recovery Balance — 10% weight. */
export function strainBalanceScore(
  windowRecoveryPct: number | null,
  baselineRecoveryPct: number | null,
  isBaselineWindow: boolean,
): number | null {
  // Not a missing-data placeholder — same convention as hrvScore above, and
  // same guard: only apply it once baseline recovery data actually exists.
  if (isBaselineWindow) return baselineRecoveryPct != null ? 100.0 : null
  if (windowRecoveryPct == null || baselineRecoveryPct == null || baselineRecoveryPct === 0) return null
  if (windowRecoveryPct >= baselineRecoveryPct) return 100.0
  const pctDecline = ((baselineRecoveryPct - windowRecoveryPct) / baselineRecoveryPct) * 100
  return round1(clamp(100.0 - pctDecline * STRAIN_DECLINE_MULTIPLIER))
}

// ─── Composite score + bands ──────────────────────────────────────────────────

export interface ComponentScores {
  sleep: number | null
  hrv: number | null
  zone2: number | null
  recovery: number | null
  strain: number | null
}

/**
 * Weighted composite, renormalized over whichever components are present.
 * When all 5 are present this is identical to Matt's fixed formula (weights
 * already sum to 100). Returns null only when every component is null.
 */
export function compositeScore(components: ComponentScores): number | null {
  const present = (Object.keys(TEAM_HEALTH_WEIGHTS) as TeamHealthComponentKey[])
    .filter((key) => components[key] != null)

  if (present.length === 0) return null

  const weightSum = present.reduce((sum, key) => sum + TEAM_HEALTH_WEIGHTS[key], 0)
  const weightedSum = present.reduce((sum, key) => sum + (components[key] as number) * TEAM_HEALTH_WEIGHTS[key], 0)
  return round1(weightedSum / weightSum)
}

export function scoreBand(score: number | null): string | null {
  if (score == null) return null
  for (const band of SCORE_BANDS) {
    if (score >= band.min && score < band.max) return band.label
  }
  return SCORE_BANDS[SCORE_BANDS.length - 1].label
}

// ─── Coverage / consistency check (not a scoring input — a confidence flag) ──

export function coveragePct(nights: NightInput[], window: Window): number {
  const inWindow = nightsInWindow(nights, window)
  const nightsWorn = new Set(inWindow.map((n) => n.nightDate)).size
  return round1((nightsWorn / calendarDays(window)) * 100)
}

export function isLowConfidence(coverage: number): boolean {
  return coverage < 50.0
}

// ─── Full pipeline — computes all 5 components + composite for one window ───

export interface WindowScoreResult {
  window: Window
  sleep: number | null
  hrv: number | null
  zone2: number | null
  recovery: number | null
  strain: number | null
  composite: number | null
  band: string | null
  coveragePct: number
  lowConfidence: boolean
  /** Which components are null for this window, for UI messaging (OQ1). */
  missingComponents: TeamHealthComponentKey[]
}

export function scoreWindow(
  nights: NightInput[],
  workouts: WorkoutInput[],
  window: Window,
  baselineHrvMs: number | null,
  baselineRecoveryPct: number | null,
  isBaselineWindow: boolean,
): WindowScoreResult {
  const sleep = sleepScore(nights, window)
  const hrv = hrvScore(nights, window, baselineHrvMs, isBaselineWindow)
  const zone2 = zone2Score(workouts, window)
  const recovery = recoveryScore(nights, window)
  const strain = strainBalanceScore(recovery, baselineRecoveryPct, isBaselineWindow)
  const composite = compositeScore({ sleep, hrv, zone2, recovery, strain })
  const coverage = coveragePct(nights, window)

  const scores: ComponentScores = { sleep, hrv, zone2, recovery, strain }
  const missingComponents = (Object.keys(TEAM_HEALTH_WEIGHTS) as TeamHealthComponentKey[])
    .filter((key) => scores[key] == null)

  return {
    window,
    sleep,
    hrv,
    zone2,
    recovery,
    strain,
    composite,
    band: scoreBand(composite),
    coveragePct: coverage,
    lowConfidence: isLowConfidence(coverage),
    missingComponents,
  }
}

export interface ParticipantScoreResult {
  baseline: WindowScoreResult
  lastWeek: WindowScoreResult
  current: WindowScoreResult
}

/**
 * Full three-window scoring for one participant. `currentStart` is the
 * window-start convention in use for the "Current" reporting week (see
 * queries.ts/getTeamHealthScore for how the WD dashboard picks this).
 */
export function scoreParticipant(
  nights: NightInput[],
  workouts: WorkoutInput[],
  currentStart: string,
  config: TeamHealthScoreConfig,
): ParticipantScoreResult {
  const bw = baselineWindow(config)
  const lw = lastWeekWindow(currentStart)
  const cw = currentWindow(currentStart)

  const baselineHrvNights = nightsInWindow(nights, bw).filter((n): n is NightInput & { hrvMs: number } => n.hrvMs != null)
  const baselineHrvMs = baselineHrvNights.length ? avgOf(baselineHrvNights.map((n) => n.hrvMs)) : null

  const baselineRecoveryNights = nightsInWindow(nights, bw).filter((n): n is NightInput & { recoveryPct: number } => n.recoveryPct != null)
  const baselineRecoveryPct = baselineRecoveryNights.length ? avgOf(baselineRecoveryNights.map((n) => n.recoveryPct)) : null

  return {
    baseline: scoreWindow(nights, workouts, bw, baselineHrvMs, baselineRecoveryPct, true),
    lastWeek: scoreWindow(nights, workouts, lw, baselineHrvMs, baselineRecoveryPct, false),
    current: scoreWindow(nights, workouts, cw, baselineHrvMs, baselineRecoveryPct, false),
  }
}
