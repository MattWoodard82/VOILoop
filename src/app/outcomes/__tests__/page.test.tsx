import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import OutcomesPage from '../page'

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  requireAuth: jest.fn(async () => ({
    session: { user: { id: 'wd-1' } },
    role: 'wellness_director',
    mustChangePassword: false,
  })),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getTeamDashboard: jest.fn(),
  getTeamWellnessTrend: jest.fn(),
  getRecentlyResolvedInterventions: jest.fn(),
}))

jest.mock('@/components/layout/DashboardShell', () => {
  const React = require('react')
  return {
    DashboardShell: ({ title, children }: { title: string; children: React.ReactNode }) =>
      React.createElement('div', { 'data-title': title }, children),
  }
})

jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    KpiCard: ({ label, value }: { label: string; value: React.ReactNode }) => React.createElement('div', null, `${label}:${value}`),
    Card: ({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) =>
      React.createElement('section', { 'data-title': title }, badge, children),
    Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
    Alert: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  }
})

jest.mock('../OutcomesCharts', () => ({
  OutcomesCharts: ({ data }: { data: unknown }) => React.createElement('pre', null, JSON.stringify(data)),
}))

const { getTeamDashboard, getTeamWellnessTrend, getRecentlyResolvedInterventions } = jest.requireMock('@/lib/supabase/queries') as {
  getTeamDashboard: jest.Mock
  getTeamWellnessTrend: jest.Mock
  getRecentlyResolvedInterventions: jest.Mock
}

describe('outcomes page recently resolved interventions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getTeamDashboard.mockResolvedValue({
      participants: [
        {
          id: 'P1',
          first_name: 'Alex',
          last_name: 'Able',
          department: 'Ops',
          location_id: null,
          employment_type: null,
          title: 'Nurse',
          device_id: null,
          consent: true,
          enrolled_date: null,
          status: 'Active',
          is_exact_data: false,
          latest_wellness: { recovery_score: 72, hrv_ms: 66, sleep_perf: 84, day_strain: 11 },
          latest_workout: null,
          latest_habits: null,
          latest_pulse: null,
          risk_level: 'Low',
          recovery_status: 'green',
        },
      ],
      stats: {
        avg_recovery: 72,
        avg_hrv: 66,
        avg_sleep_perf: 84,
        high_risk_count: 0,
        total_participants: 1,
        participation_rate: 100,
      },
      interventions: [
        { id: 'i-pending', participant_id: 'P1', outcome: 'Pending' },
        { id: 'i-resolved', participant_id: 'P1', outcome: 'Resolved' },
      ],
    })
    getTeamWellnessTrend.mockResolvedValue([{ month: '2026-07', avg_recovery: 70 }])
  })

  test('renders only the dedicated recently resolved dataset ordered by date_resolved', async () => {
    getRecentlyResolvedInterventions.mockResolvedValue([
      {
        id: 'resolved-latest',
        participant_id: 'missing-participant',
        department: 'ER',
        trigger_metric: 'Sleep Debt',
        intervention_type: 'Manager Check-in',
        date_resolved: '2026-07-15',
      },
      {
        id: 'resolved-earlier',
        participant_id: 'P1',
        department: 'Ops',
        trigger_metric: 'Recovery Score',
        intervention_type: 'Recovery Plan',
        date_resolved: '2026-07-10',
      },
    ])

    const page = await OutcomesPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup.indexOf('2026-07-15')).toBeLessThan(markup.indexOf('2026-07-10'))
    expect(markup).toContain('missing-participant')
    expect(markup).toContain('Recovery Plan')
    expect(markup).not.toContain('date_actioned')
  })

  test('shows the empty state when no dated resolved interventions are available', async () => {
    getRecentlyResolvedInterventions.mockResolvedValue([])

    const page = await OutcomesPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).toContain('No resolved interventions yet.')
  })
})
