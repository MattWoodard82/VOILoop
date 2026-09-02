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
jest.mock('@/lib/utils', () => ({ recoveryColor: () => '#69BE28' }))
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
    teamHealthScore = null,
  }: {
    deptFilter?: string
    personFilter?: string
    configLoaded?: boolean
    teamHealthScore?: unknown
  } = {},
) {
  const useStateSpy = jest.spyOn(React, 'useState')
  const useEffectSpy = jest.spyOn(React, 'useEffect').mockImplementation(() => {})

  // Hook call order in WellnessDirectorClient: deptFilter, personFilter, weights,
  // overrides, overrideNotes, snoozeDays, configLoaded, nudgeMessage, nudgeStatus,
  // nudgeError, currentStart, teamHealthScore, thsLoading, thsError, ... Only the
  // ones the tests need to control are overridden; the rest pass through to the
  // real useState so they keep their real defaults.
  useStateSpy
    .mockImplementationOnce(() => [deptFilter, jest.fn()]) // deptFilter
    .mockImplementationOnce(() => [personFilter, jest.fn()]) // personFilter
    .mockImplementationOnce(originalUseState as typeof React.useState) // weights
    .mockImplementationOnce(originalUseState as typeof React.useState) // overrides
    .mockImplementationOnce(originalUseState as typeof React.useState) // overrideNotes
    .mockImplementationOnce(originalUseState as typeof React.useState) // snoozeDays
    .mockImplementationOnce(() => [configLoaded, jest.fn()]) // configLoaded
    .mockImplementationOnce(originalUseState as typeof React.useState) // nudgeMessage
    .mockImplementationOnce(originalUseState as typeof React.useState) // nudgeStatus
    .mockImplementationOnce(originalUseState as typeof React.useState) // nudgeError
    .mockImplementationOnce(originalUseState as typeof React.useState) // currentStart
    .mockImplementationOnce(() => [teamHealthScore, jest.fn()]) // teamHealthScore
    .mockImplementationOnce(originalUseState as typeof React.useState) // thsLoading
    .mockImplementationOnce(originalUseState as typeof React.useState) // thsError

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
    expect(markup).toContain('Flag actions')
    expect(markup).toContain('aria-label="override note"')
    expect(markup).toContain('Snooze')
    expect(markup).toContain('Dismiss')
    expect(markup).not.toContain('Loading weights…')
    expect(markup).not.toContain('table-skeleton')
    expect(markup).toContain('WHOOP/CSV submission consistency')
    expect(markup).toContain('Send a nudge to Alex Able')
  })

  test('shows Team Health Score Trend baseline/last-week/current summary row, with a baseline-building message while a participant is still forming a baseline', () => {
    const teamHealthScore = {
      baseline: { window: { start: '2026-06-01', end: '2026-06-14' }, sleep: 65, hrv: 60, zone2: 55, recovery: 68, strain: 62, composite: 63.6, band: 'Good', coveragePct: 100, lowConfidence: false, missingComponents: [] },
      lastWeek: { window: { start: '2026-07-28', end: '2026-08-03' }, sleep: 60, hrv: 58, zone2: 50, recovery: 65, strain: 60, composite: 61.1, band: 'Fair', coveragePct: 90, lowConfidence: false, missingComponents: [] },
      current: { window: { start: '2026-08-04', end: '2026-08-10' }, sleep: null, hrv: 55, zone2: 40, recovery: 50, strain: 45, composite: null, band: null, coveragePct: 0, lowConfidence: false, missingComponents: ['sleep'] },
    }
    const markup = renderClientMarkup([participant], { personFilter: 'P1', teamHealthScore })
    expect(markup).toContain('Baseline building (13 days remaining)')
    expect(markup).toContain('61.1')
    expect(markup).toContain('No data yet')
    expect(markup).toContain('--')
    expect(markup).toContain('No data this window')

    const readyParticipant = { ...participant, baseline_state: 'ready' } as ParticipantWithWellness
    const readyMarkup = renderClientMarkup([readyParticipant], { personFilter: 'P1', teamHealthScore })
    expect(readyMarkup).toContain('63.6')
  })

  test('shows cohort and selected-participant averages, and flags steps as unavailable', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    expect(markup).toContain('Cohort averages')
    expect(markup).toContain('Alex Able')
    expect(markup).toContain('Avg steps: not available (no WHOOP steps data source).')
    expect(markup).toContain('Avg weighted score')
    expect(markup).toContain('Avg wear consistency')
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
    expect(markup).toContain('Choose a participant to view risk tier, or review the cohort risk composition below.')
    expect(markup).toContain('Stable:2')
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
    expect(outOfScopeMarkup).toContain('Choose a participant to view risk tier, or review the cohort risk composition below.')
    expect(outOfScopeMarkup).not.toContain('Send a nudge')
  })

  test('renders a participant header with name, risk badge, department, and engagement score delta vs. cohort average', () => {
    const bea = { ...participant, id: 'P2', first_name: 'Bea', last_name: 'Bell', department: 'ER', engagement_score: 50 }
    const markup = renderClientMarkup([participant, bea], { personFilter: 'P1' })
    // cohort avg = round((68 + 50) / 2 * 10) / 10 = 59; delta = round(68 - 59) = +9
    expect(markup).toContain('Alex Able')
    expect(markup).toContain('Ops')
    expect(markup).toContain('ENGAGEMENT SCORE')
    expect(markup).toContain('+9 vs. cohort avg (59)')
  })

  test('does not render the participant header when no participant is selected', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'All' })
    expect(markup).not.toContain('ENGAGEMENT SCORE')
  })

  test('replaces the department/person selects with a single searchable participant combobox', () => {
    const bea = { ...participant, id: 'P2', first_name: 'Bea', last_name: 'Bell', department: 'ER' }
    const markup = renderClientMarkup([participant, bea], { personFilter: 'All' })
    expect(markup).toContain('Search or choose a participant to drill in')
    expect(markup).not.toContain('class="form-select"')
    expect(markup).toContain('Alex Able')
    expect(markup).toContain('Bea Bell')
    expect(markup).toContain('Ops')
    expect(markup).toContain('ER')
  })

  test('renders a Recent nudges & responses card next to the send-a-nudge card with a Full history link', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'P1' })
    expect(markup).toContain('Recent nudges &amp; responses')
    expect(markup).toContain('No nudges sent to this participant yet.')
    expect(markup).toContain('Full history')
    expect(markup).toContain('href="/wellness-director/events"')
  })

  test('does not render the nudge history card when no participant is selected', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'All' })
    expect(markup).not.toContain('Recent nudges &amp; responses')
  })

  test('renders a Weekly response rate card with a Mon-Sun grid, pagination text, and export button', () => {
    const markup = renderClientMarkup([participant], { personFilter: 'All' })
    expect(markup).toContain('Weekly response rate')
    expect(markup).toContain('Mon')
    expect(markup).toContain('Sun')
    expect(markup).toContain('Showing 1 of 1')
    expect(markup).toContain('Export full list (1)')
  })

  test('shows a "view all" link in the weekly response rate table when there are more than 8 participants', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...participant, id: `P${i}`, first_name: `Person${i}` }))
    const markup = renderClientMarkup(many, { personFilter: 'All' })
    expect(markup).toContain('Showing 8 of 10')
    expect(markup).toContain('view all 10')
    expect(markup).toContain('Export full list (10)')
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
})
