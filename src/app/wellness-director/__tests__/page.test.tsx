import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WellnessDirectorPage from '../page'
import { requireAuth } from '@/lib/supabase/server'
import { getTeamDashboard } from '@/lib/supabase/queries'
import type { ParticipantWithWellness, Intervention, TeamStats } from '@/types'

jest.mock('@/lib/supabase/server', () => ({
  requireAuth: jest.fn(),
}))
jest.mock('@/lib/supabase/queries', () => ({
  getTeamDashboard: jest.fn(),
}))
jest.mock('@/components/layout/DashboardShell', () => {
  const React = require('react')
  return {
    DashboardShell: ({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) =>
      React.createElement('div', { 'data-title': title }, actions, children),
  }
})
jest.mock('../TestAccountsToggle', () => {
  const React = require('react')
  return {
    TestAccountsToggle: () => React.createElement('div', { 'data-testid': 'test-accounts-toggle' }, 'Exclude test & pilot accounts toggle'),
  }
})
jest.mock('../WellnessDirectorClient', () => {
  const React = require('react')
  return {
    WellnessDirectorClient: () => React.createElement('div', { 'data-testid': 'wellness-director-client' }, 'client'),
  }
})
jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    KpiCard: ({ label, value }: { label: string; value: React.ReactNode }) => React.createElement('div', null, `${label}:${value}`),
    Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => React.createElement('span', { 'data-variant': variant }, children),
  }
})

const requireAuthMock = requireAuth as jest.MockedFunction<typeof requireAuth>
const getTeamDashboardMock = getTeamDashboard as jest.MockedFunction<typeof getTeamDashboard>

const baseParticipant: ParticipantWithWellness = {
  id: 'P1',
  first_name: 'Alice',
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
  latest_wellness: null,
  latest_workout: null,
  latest_habits: null,
  latest_pulse: null,
  risk_level: 'Low',
  recovery_status: 'green',
  engagement_score: 68,
  engagement_score_components: null,
  physiological_trend: 'improving',
  physiological_trend_metrics: [],
  risk_tier_label: 'Stable',
  risk_trigger_reasons: [],
  baseline_state: 'building',
  baseline_days_remaining: 13,
  override_state: null,
  override_note: null,
  avg_zone_minutes: { zone1: null, zone2: null, zone3: null, zone4: null, zone5: null },
}

const baseStats: TeamStats = {
  avg_recovery: 72,
  avg_hrv: 66,
  avg_sleep_perf: 84,
  high_risk_count: 0,
  total_participants: 1,
  participation_rate: 100,
}

function mockDashboard(participants: ParticipantWithWellness[], interventions: Intervention[] = []) {
  getTeamDashboardMock.mockResolvedValue({
    participants,
    stats: { ...baseStats, total_participants: participants.length },
    interventions,
  })
}

describe('WellnessDirectorPage header toolbar + flagged banner', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuthMock.mockResolvedValue({
      session: { user: { id: 'wd-1' } },
      role: 'wellness_director',
      mustChangePassword: false,
    } as never)
  })

  test('renders the test-accounts toggle in the header actions', async () => {
    mockDashboard([baseParticipant])
    const page = await WellnessDirectorPage({})
    const markup = renderToStaticMarkup(page as React.ReactElement)
    expect(markup).toContain('test-accounts-toggle')
  })

  test('defaults to excluding test accounts (includeTestAccounts: false) with no query param', async () => {
    mockDashboard([baseParticipant])
    await WellnessDirectorPage({})
    expect(getTeamDashboardMock).toHaveBeenCalledWith({ includeTestAccounts: false })
  })

  test('passes includeTestAccounts: true through to getTeamDashboard when ?includeTestAccounts=1 is present', async () => {
    mockDashboard([baseParticipant])
    await WellnessDirectorPage({ searchParams: { includeTestAccounts: '1' } })
    expect(getTeamDashboardMock).toHaveBeenCalledWith({ includeTestAccounts: true })
  })

  test('renders a mini card per flagged (high-risk) participant with name and a recovery status pill, plus a Review all control', async () => {
    const highRiskParticipant: ParticipantWithWellness = {
      ...baseParticipant,
      id: 'P2',
      first_name: 'Bea',
      last_name: 'Bishop',
      risk_level: 'High',
      latest_wellness: { id: 'w2', participant_id: 'P2', source_batch_id: null, date: '2026-08-07', recovery_score: 20, hrv_ms: 40, resting_hr: 70, blood_oxygen: 95, skin_temp: 33, day_strain: 15, calories: 2000, sleep_perf: 60, sleep_hrs: 5, sleep_debt: 2, sleep_need: 8, deep_sleep: 1, rem_sleep: 1, light_sleep: 3, sleep_eff: 70, sleep_consistency: 60, resp_rate: 15 },
    }
    mockDashboard([baseParticipant, highRiskParticipant])

    const page = await WellnessDirectorPage({})
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).toContain('Bea Bishop')
    expect(markup).toContain('Recovery 20')
    expect(markup).toContain('Review all')
    expect(markup).toContain('href="#wd-participants"')
    // The card list stays anchored to the participant picker section so "Review all" can scroll to it.
    expect(markup).toContain('id="wd-participants"')
    expect(markup).toContain('wellness-director-client')
  })

  test('omits the flagged banner entirely when there are no high-risk participants', async () => {
    mockDashboard([baseParticipant])
    const page = await WellnessDirectorPage({})
    const markup = renderToStaticMarkup(page as React.ReactElement)
    expect(markup).not.toContain('Review all')
    expect(markup).not.toContain('flagged')
  })
})
