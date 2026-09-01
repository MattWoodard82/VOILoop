// Team Health Score (GH issue #119) fixed-baseline-window config, mirroring
// wellness-director-config.ts's pattern for the (separate) FR-13 engagement
// weights: a single admin-editable row, read-only for Wellness Directors,
// with safe fallback to defaults for anything malformed.
//
// Unlike the engagement weights, this config has nothing to do with scoring
// *weights* — the Team Health Score's 5 component weights are fixed per
// Matt's spec (see TEAM_HEALTH_WEIGHTS in team-health-score.ts) and are not
// configurable here. This only controls WHICH dates count as the shared,
// cohort-wide baseline window every participant's HRV/strain trend is
// measured against.

export interface TeamHealthScoreConfig {
  baselineStart: string // 'YYYY-MM-DD'
  baselineEnd: string   // 'YYYY-MM-DD', inclusive
}

// Matches Matt's original fixed window; nothing changes for any cohort until
// an admin deliberately edits it.
export const DEFAULT_TEAM_HEALTH_SCORE_CONFIG: TeamHealthScoreConfig = {
  baselineStart: '2026-07-02',
  baselineEnd: '2026-07-27',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MIN_BASELINE_DAYS = 7

function daysInclusive(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime()
  return Math.round((endMs - startMs) / 86_400_000) + 1
}

/**
 * Normalizes a persisted config row into a valid TeamHealthScoreConfig,
 * falling back to the default window for anything malformed (missing
 * fields, unparsable dates, end before start, or a suspiciously short
 * window) rather than surfacing a broken baseline to the dashboard.
 */
export function normalizeTeamHealthScoreConfig(raw: unknown): TeamHealthScoreConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_TEAM_HEALTH_SCORE_CONFIG
  const candidate = raw as Record<string, unknown>
  const baselineStart = candidate.baseline_start
  const baselineEnd = candidate.baseline_end

  if (typeof baselineStart !== 'string' || typeof baselineEnd !== 'string') return DEFAULT_TEAM_HEALTH_SCORE_CONFIG
  if (!DATE_RE.test(baselineStart) || !DATE_RE.test(baselineEnd)) return DEFAULT_TEAM_HEALTH_SCORE_CONFIG
  if (baselineStart > baselineEnd) return DEFAULT_TEAM_HEALTH_SCORE_CONFIG
  if (daysInclusive(baselineStart, baselineEnd) < MIN_BASELINE_DAYS) return DEFAULT_TEAM_HEALTH_SCORE_CONFIG

  return { baselineStart, baselineEnd }
}
