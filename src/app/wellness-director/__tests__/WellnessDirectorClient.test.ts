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

jest.mock('../WellnessDirectorCharts', () => ({ WellnessDirectorCharts: ({ data }: { data: unknown }) => React.createElement('pre', null, JSON.stringify(data)) }))
jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    KpiCard: ({ label, value }: { label: string; value: React.ReactNode }) => React.createElement('div', null, `${label}:${value}`),
    Alert: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
    Card: ({ title, children }: { title: string; children: React.ReactNode }) => React.createElement('section', { 'data-title': title }, children),
    Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
    BarRow: ({ label, value }: { label: string; value: number }) => React.createElement('div', null, `${label}:${value}`),
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
}

const selectedMarkup = (participants: any[]) => renderToStaticMarkup(React.createElement(WellnessDirectorClient, { participants }))

function renderWithFilterState(
  participants: ParticipantWithWellness[],
  {
    deptFilter = 'All',
    personFilter = 'All',
  }: {
    deptFilter?: string
    personFilter?: string
  } = {},
) {
  const useStateSpy = jest.spyOn(React, 'useState')
  useStateSpy
    .mockImplementationOnce(() => [deptFilter, jest.fn()])
    .mockImplementationOnce(() => [personFilter, jest.fn()])
    .mockImplementationOnce(originalUseState as typeof React.useState)
    .mockImplementationOnce(originalUseState as typeof React.useState)
    .mockImplementationOnce(originalUseState as typeof React.useState)
    .mockImplementationOnce(originalUseState as typeof React.useState)
    .mockImplementationOnce(originalUseState as typeof React.useState)

  try {
    return selectedMarkup(participants)
  } finally {
    useStateSpy.mockRestore()
  }
}

describe('WellnessDirectorClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders explainability and baseline state', () => {
    const markup = renderWithFilterState([participant], { personFilter: 'P1' })
    expect(markup).toContain('Engagement score')
    expect(markup).toContain('Baseline building (13 days remaining)')
    expect(markup).toContain('improving')
  })

  test('shows the five FR-13 engagement component labels in the breakdown', () => {
    const markup = renderWithFilterState([participant], { personFilter: 'P1' })
    expect(markup).toContain('WHOOP/CSV submission consistency')
    expect(markup).toContain('Device-wear consistency')
    expect(markup).toContain('Pulse survey completion')
    expect(markup).toContain('Nudge response rate')
    expect(markup).toContain('Workout volume vs. baseline')
  })

  test('shows snooze and dismiss controls for the selected participant', () => {
    const markup = renderWithFilterState([participant], { personFilter: 'P1' })
    expect(markup).toContain('Snooze')
    expect(markup).toContain('Dismiss')
  })

  test('shows the multi-participant chart while detail cards require a participant selection', () => {
    const markup = renderWithFilterState([participant, { ...participant, id: 'P2', first_name: 'Bea', department: 'ER' }], {
      deptFilter: 'All',
      personFilter: 'All',
    })
    expect(markup).toContain('Bea Able')
    expect(markup).toContain('Choose a participant to review baseline status and overrides.')
  })

  test('prompts for participant selection when all participants are selected', () => {
    const markup = renderWithFilterState([participant, { ...participant, id: 'P2', first_name: 'Bea' }], {
      deptFilter: 'All',
      personFilter: 'All',
    })
    expect(markup).toContain('Choose a participant to view score breakdown.')
    expect(markup).toContain('Choose a participant to review baseline status and overrides.')
  })

  test('prompts for participant selection when a department is selected but participant scope remains all', () => {
    const erParticipant = { ...participant, id: 'P2', first_name: 'Bea', department: 'ER' } as ParticipantWithWellness
    const markup = renderWithFilterState([participant, erParticipant], {
      deptFilter: 'ER',
      personFilter: 'All',
    })
    expect(markup).toContain('Choose a participant to view score breakdown.')
    expect(markup).toContain('Choose a participant to view risk tier.')
  })

  test('shows selected participant breakdown when an explicit participant is chosen', () => {
    const secondParticipant = {
      ...participant,
      id: 'P2',
      first_name: 'Bea',
      department: 'ER',
      engagement_score_components: {
        submission_consistency: 90,
        device_wear_consistency: 80,
        pulse_completion: 70,
        nudge_response: 60,
        workout_volume: 50,
      },
    } as ParticipantWithWellness
    const markup = renderWithFilterState([participant, secondParticipant], {
      deptFilter: 'ER',
      personFilter: 'P2',
    })
    expect(markup).toContain('WHOOP/CSV submission consistency:90')
    expect(markup).toContain('Device-wear consistency:80')
    expect(markup).not.toContain('Choose a participant to view score breakdown.')
  })

  test('omits missing engagement scores from the chart', () => {
    const markup = selectedMarkup([{ ...participant, engagement_score: null } as any])
    expect(markup).not.toContain('"value":0')
  })

  test('shows a selected-participant empty state when components are unavailable', () => {
    const markup = renderWithFilterState([{ ...participant, engagement_score_components: null } as ParticipantWithWellness], {
      deptFilter: 'All',
      personFilter: 'P1',
    })
    expect(markup).toContain('No score breakdown available for the selected participant.')
  })

  test('shows empty-state guidance when the explicit participant is outside the current department scope', () => {
    const erParticipant = { ...participant, id: 'P2', first_name: 'Bea', department: 'ER' } as ParticipantWithWellness
    const markup = renderWithFilterState([participant, erParticipant], {
      deptFilter: 'ER',
      personFilter: 'P1',
    })
    expect(markup).toContain('No score breakdown available for the selected participant.')
    expect(markup).toContain('Choose a participant to review baseline status and overrides.')
  })

  test('wellness director page links to the events manager for leadership users', async () => {
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
      interventions: [],
    })

    const page = await WellnessDirectorPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).toContain('Events and nudges')
    expect(markup).toContain('Open events manager')
    expect(markup).toContain('href="/admin/events"')
  })
})
