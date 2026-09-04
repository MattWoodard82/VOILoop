import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WellnessDirectorClient } from '../WellnessDirectorClient'
import WellnessDirectorPage from '../page'
import { requireAuth } from '@/lib/supabase/server'
import { getTeamDashboard } from '@/lib/supabase/queries'
import type { ParticipantWithWellness } from '@/types'

jest.mock('@/lib/supabase/server', () => ({
  requireAuth: jest.fn(),
}))
jest.mock('@/lib/supabase/queries', () => ({
  getTeamDashboard: jest.fn(),
}))
jest.mock('@/components/layout/DashboardShell', () => {
  const React = require('react')
  return {
    DashboardShell: ({ title, children }: { title: string; children: React.ReactNode }) =>
      React.createElement('div', { 'data-title': title }, children),
  }
})

jest.mock('../WellnessDirectorCharts', () => ({
  WellnessDirectorCharts: ({ data }: { data: unknown }) => React.createElement('pre', null, JSON.stringify(data)),
}))
jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    KpiCard: ({ label, value }: { label: string; value: React.ReactNode }) => React.createElement('div', null, `${label}:${value}`),
    Alert: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
    Card: ({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) =>
      React.createElement('section', { 'data-title': title }, badge, children),
    Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
    BarRow: ({ label, value }: { label: string; value: number }) => React.createElement('div', null, `${label}:${value}`),
    ChartSkeleton: () => React.createElement('div', { className: 'chart-skeleton' }),
    LoadingNotice: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children ?? 'Loading…'),
    SkeletonBlock: () => React.createElement('div', { className: 'skeleton-block' }),
    TableSkeleton: () => React.createElement('div', { className: 'table-skeleton' }),
  }
})
jest.mock('@/lib/utils', () => ({
  recoveryColor: () => '#69BE28',
  normalizeParticipantDisplayName: ({ firstName, lastName }: { firstName?: string | null; lastName?: string | null }) =>
    `${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Unknown participant',
}))
jest.mock('next/link', () => {
  const React = require('react')
  const MockLink = ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children)
  MockLink.displayName = 'MockLink'
  return MockLink
})

const originalUseState = React.useState

const participant: ParticipantWithWellness = {
  id: 'P1',
  first_name: 'Alex',
  last_name: 'Able',
  department: 'Ops',
  location_id: null,
  employment_type: null,
  title: 'Nurse',
  device_id: null,
  consent: true,
  enrolled_date: '2026-08-01',
  status: 'Active',
  is_exact_data: false,
  latest_wellness: { id: 'w1', participant_id: 'P1', source_batch_id: null, date: '2026-08-07', recovery_score: 72, hrv_ms: 66, resting_hr: 58, blood_oxygen: 97, skin_temp: 33.1, day_strain: 11, calories: 2200, sleep_perf: 84, sleep_hrs: 7.4, sleep_debt: 1.1, sleep_need: 7.8, deep_sleep: 1.7, rem_sleep: 1.6, light_sleep: 4.1, sleep_eff: 93, sleep_consistency: 86, resp_rate: 14.4 },
  latest_workout: { id: 'wo1', participant_id: 'P1', source_batch_id: null, date: '2026-08-07', start_time: '2026-08-07T08:00:00Z', end_time: null, activity: 'Run', duration_min: 30, strain: 8, calories: 300, max_hr: 160, avg_hr: 140, zone1_pct: null, zone2_pct: null, zone3_pct: null, zone4_pct: null, zone5_pct: null },
  latest_habits: { id: 'h1', participant_id: 'P1', source_batch_id: null, date: '2026-08-07', alcohol: false, caffeine: true, ate_late: null, hydrated: true, protein: true, magnesium: null, theanine: null, creatine: null, ashwagandha: null, glp1: null, tracked_calories: null, dimmed_lights: null, read_before_bed: null, sauna: null, hot_tub: null, massage: null, notes: 'Responded to nudge' },
  latest_pulse: { id: 'p1', participant_id: 'P1', date: '2026-08-07', confident_health: true, body_trending_good: true, energy_level: 8, rest_quality: 7, stress_level: 4, physical_activity: ['walk'], mental_wellbeing: 8, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
  risk_level: 'Low',
  recovery_status: 'green',
  engagement_score: 68,
  engagement_score_components: { submission_consistency: 25, device_wear_consistency: 20, pulse_completion: 20, nudge_response: 15, workout_volume: 20 },
  physiological_trend: 'improving',
  physiological_trend_metrics: ['Recovery up', 'HRV up', 'Sleep performance up'],
  risk_tier_label: 'Stable',
  risk_trigger_reasons: [],
  baseline_state: 'building',
  baseline_days_remaining: 13,
  override_state: null,
  override_note: null,
  avg_zone_minutes: { zone1: 5, zone2: 8, zone3: 6, zone4: 2, zone5: 1 },
}

function renderClientMarkup(
  participants: ParticipantWithWellness[],
  {
    deptFilter = 'All',
    personFilter = 'All',
    configLoaded = true,
  }: {
    deptFilter?: string
    personFilter?: string
    configLoaded?: boolean
  } = {},
) {
  const useStateSpy = jest.spyOn(React, 'useState')
  const useEffectSpy = jest.spyOn(React, 'useEffect').mockImplementation(() => {})

  // Hook call order in WellnessDirectorClient: deptFilter, personFilter, weights,
  // overrides, overrideNotes, snoozeDays, configLoaded, nudgeMessage, nudgeStatus,
  // nudgeError, ... Only the ones the tests need to control are overridden; the
  // rest pass through to the real useState so they keep their real defaults.
  useStateSpy
    .mockImplementationOnce(() => [deptFilter, jest.fn()]) // deptFilter
    .mockImplementationOnce(() => [personFilter, jest.fn()]) // personFilter
    .mockImplementationOnce(originalUseState as typeof React.useState) // weights
    .mockImplementationOnce(originalUseState as typeof React.useState) // overrides
    .mockImplementationOnce(originalUseState as typeof React.useState) // overrideNotes
    .mockImplementationOnce(originalUseState as typeof React.useState) // snoozeDays
    .mockImplementationOnce(() => [configLoaded, jest.fn()]) // configLoaded

  try {
    return renderToStaticMarkup(React.createElement(WellnessDirectorClient, { participants }))
  } finally {
    useStateSpy.mockRestore()
    useEffectSpy.mockRestore()
  }
}

describe('WellnessDirectorClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders loading placeholders before config hydration finishes', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1', configLoaded: false })
    expect(markup).toContain('Loading weights…')
    expect(markup).toContain('table-skeleton')
    expect(markup).toContain('chart-skeleton')
  })

  test('renders explainability, score breakdown, and selected participant controls when config is loaded', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    expect(markup).toContain('Engagement score')
    expect(markup).toContain('Baseline building (13 days remaining)')
    expect(markup).toContain('aria-label="override note"')
    expect(markup).toContain('Snooze')
    expect(markup).toContain('Dismiss')
    expect(markup).not.toContain('Loading weights…')
    expect(markup).not.toContain('table-skeleton')
    expect(markup).toContain('WHOOP/CSV submission consistency')
    expect(markup).toContain('Send a nudge to Alex Able')
  })

  test('shows cohort and selected-participant averages, and flags steps as unavailable', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    expect(markup).toContain('Cohort averages')
    expect(markup).toContain('Alex Able')
    expect(markup).toContain('Avg steps: not available (no WHOOP steps data source).')
    expect(markup).toContain('Avg weighted score')
    expect(markup).toContain('Avg wear consistency')
  })

  test('shows Avg weighted score explanation only for cohort averages, not selected participant averages', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    const explanation = 'Avg weighted score is the average engagement score of retained, non-test participants in this scope — pilot/test accounts are excluded.'
    expect(markup.match(new RegExp(explanation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0).toBe(1)
  })

  test('describes Baseline/overrides accurately: baseline is enrollment-age based, and dismiss is indefinite (not day-limited)', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    expect(markup).toContain('21 days since')
    expect(markup).toContain('enrolled')
    expect(markup).toContain('dismiss')
    expect(markup).toContain('indefinitely')
  })

  test('Team Health Score Trend and 5-Metric Breakdown each get their own full-width row (GH #120 item #5)', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    const trendIdx = markup.indexOf('data-title="Team Health Score Trend"')
    const metricIdx = markup.indexOf('data-title="5-Metric Breakdown"')
    expect(trendIdx).toBeGreaterThan(-1)
    expect(metricIdx).toBeGreaterThan(-1)
    // Each card's nearest wrapping <div style="..."> must not be the cramped
    // shared two-column grid (grid-template-columns:1fr 1fr) the two cards
    // used to be squeezed into.
    const styleBefore = (idx: number) => {
      const before = markup.slice(0, idx)
      const matches = Array.from(before.matchAll(/<div style="([^"]*)">/g))
      return matches.at(-1)?.[1]
    }
    const trendWrapperStyle = styleBefore(trendIdx)
    const metricWrapperStyle = styleBefore(metricIdx)
    expect(trendWrapperStyle).toBeDefined()
    expect(metricWrapperStyle).toBeDefined()
    expect(trendWrapperStyle).not.toContain('1fr 1fr')
    expect(metricWrapperStyle).not.toContain('1fr 1fr')
  })

  test('engagement-score weights are always read-only on the WD dashboard (edited only in the Admin Console)', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    expect(markup).toContain('view only')
    expect(markup).toContain('Admin Console')
    expect(markup).toContain('Contact an admin to request a change.')
    expect(markup).not.toContain('Save weights')
    expect(markup).not.toContain('range-control')
  })

  test('shows selection guidance when all participants are in scope', () => {
    const markup = renderClientMarkup([participant, { ...participant, id: 'P2', first_name: 'Bea', department: 'ER' }], {
      deptFilter: 'All',
      personFilter: 'All',
    })
    expect(markup).toContain('Bea Able')
    expect(markup).toContain('Choose a participant to review baseline status and overrides.')
    expect(markup).toContain('Choose a participant to view risk tier.')
    expect(markup).toContain('Cohort averages')
    expect(markup).not.toContain('Send a nudge')
  })

  test('shows empty states when selected participant data is unavailable or out of scope', () => {
    const missingBreakdownMarkup = renderClientMarkup(
      [{ ...participant, engagement_score_components: null } as ParticipantWithWellness],
      { personFilter: 'P1' },
    )
    expect(missingBreakdownMarkup).toContain('No score breakdown available for the selected participant.')
    expect(missingBreakdownMarkup).toContain('Send a nudge to Alex Able')

    const erParticipant = { ...participant, id: 'P2', first_name: 'Bea', department: 'ER' } as ParticipantWithWellness
    const outOfScopeMarkup = renderClientMarkup([participant, erParticipant], {
      deptFilter: 'ER',
      personFilter: 'P1',
    })
    expect(outOfScopeMarkup).toContain('Choose a participant to review baseline status and overrides.')
    expect(outOfScopeMarkup).not.toContain('Send a nudge')
  })

  test('wellness director page frames department cards as a live summary and marks computed recommendations coming soon', async () => {
    ;(requireAuth as jest.MockedFunction<typeof requireAuth>).mockResolvedValue({
      session: { user: { id: 'wd-1' } },
      role: 'wellness_director',
      mustChangePassword: false,
    } as never)
    ;(getTeamDashboard as jest.MockedFunction<typeof getTeamDashboard>).mockResolvedValue({
      participants: [participant],
      stats: {
        avg_recovery: 72,
        avg_hrv: 66,
        avg_sleep_perf: 84,
        high_risk_count: 0,
        total_participants: 1,
        participation_rate: 100,
        test_account_filtering_unavailable: false,
      },
      interventions: [
        {
          id: 'int-1',
          participant_id: 'P1',
          date_triggered: '2026-08-07',
          department: 'Ops',
          trigger_metric: 'Recovery Score',
          trigger_value: '38',
          intervention_type: '1:1 Wellness Check-in',
          assigned_to: 'Wellness Director',
          date_actioned: null,
          date_resolved: null,
          outcome: 'Pending',
          notes: 'Immediate review',
          wd_notes: null,
        },
      ],
    })

    const page = await WellnessDirectorPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).toContain('Department intervention summary')
    expect(markup).toContain('Live summary of logged intervention records by department. Computed, data-driven recommendations are coming soon.')
    expect(markup).toContain('Logged triggers: Recovery Score')
    expect(markup).toContain('Logged interventions')
    expect(markup).not.toContain('Suggested interventions by department')
  })

  test('warns when pilot/test-account filtering failed open, so cohort metrics are not silently presented as clean', async () => {
    ;(requireAuth as jest.MockedFunction<typeof requireAuth>).mockResolvedValue({
      session: { user: { id: 'wd-1' } },
      role: 'wellness_director',
      mustChangePassword: false,
    } as never)
    ;(getTeamDashboard as jest.MockedFunction<typeof getTeamDashboard>).mockResolvedValue({
      participants: [participant],
      stats: {
        avg_recovery: 72,
        avg_hrv: 66,
        avg_sleep_perf: 84,
        high_risk_count: 0,
        total_participants: 1,
        participation_rate: 100,
        test_account_filtering_unavailable: true,
      },
      interventions: [],
    })

    const page = await WellnessDirectorPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).toContain('Pilot/test-account filtering is temporarily unavailable')
  })

  test('does not show the filtering-unavailable warning when test-account filtering succeeded', async () => {
    ;(requireAuth as jest.MockedFunction<typeof requireAuth>).mockResolvedValue({
      session: { user: { id: 'wd-1' } },
      role: 'wellness_director',
      mustChangePassword: false,
    } as never)
    ;(getTeamDashboard as jest.MockedFunction<typeof getTeamDashboard>).mockResolvedValue({
      participants: [participant],
      stats: {
        avg_recovery: 72,
        avg_hrv: 66,
        avg_sleep_perf: 84,
        high_risk_count: 0,
        total_participants: 1,
        participation_rate: 100,
        test_account_filtering_unavailable: false,
      },
      interventions: [],
    })

    const page = await WellnessDirectorPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).not.toContain('Pilot/test-account filtering is temporarily unavailable')
  })
})
