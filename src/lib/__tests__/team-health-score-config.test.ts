import { normalizeTeamHealthScoreConfig, DEFAULT_TEAM_HEALTH_SCORE_CONFIG } from '../team-health-score-config'

describe('normalizeTeamHealthScoreConfig', () => {
  it('returns the config as-is when valid', () => {
    const result = normalizeTeamHealthScoreConfig({ baseline_start: '2026-01-01', baseline_end: '2026-01-31' })
    expect(result).toEqual({ baselineStart: '2026-01-01', baselineEnd: '2026-01-31' })
  })

  it('falls back to defaults for null/non-object input', () => {
    expect(normalizeTeamHealthScoreConfig(null)).toEqual(DEFAULT_TEAM_HEALTH_SCORE_CONFIG)
    expect(normalizeTeamHealthScoreConfig(undefined)).toEqual(DEFAULT_TEAM_HEALTH_SCORE_CONFIG)
    expect(normalizeTeamHealthScoreConfig('not an object')).toEqual(DEFAULT_TEAM_HEALTH_SCORE_CONFIG)
  })

  it('falls back to defaults when fields are missing', () => {
    expect(normalizeTeamHealthScoreConfig({ baseline_start: '2026-01-01' })).toEqual(DEFAULT_TEAM_HEALTH_SCORE_CONFIG)
  })

  it('falls back to defaults for unparsable date strings', () => {
    expect(normalizeTeamHealthScoreConfig({ baseline_start: 'not-a-date', baseline_end: '2026-01-31' })).toEqual(DEFAULT_TEAM_HEALTH_SCORE_CONFIG)
  })

  it('falls back to defaults when end is before start', () => {
    expect(normalizeTeamHealthScoreConfig({ baseline_start: '2026-02-01', baseline_end: '2026-01-01' })).toEqual(DEFAULT_TEAM_HEALTH_SCORE_CONFIG)
  })

  it('falls back to defaults when the window is shorter than 7 days', () => {
    expect(normalizeTeamHealthScoreConfig({ baseline_start: '2026-01-01', baseline_end: '2026-01-05' })).toEqual(DEFAULT_TEAM_HEALTH_SCORE_CONFIG)
  })

  it('accepts an exactly-7-day window', () => {
    const result = normalizeTeamHealthScoreConfig({ baseline_start: '2026-01-01', baseline_end: '2026-01-07' })
    expect(result).toEqual({ baselineStart: '2026-01-01', baselineEnd: '2026-01-07' })
  })
})
