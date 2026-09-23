import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PulsePage from '../page'
import { selectLatestPulseByParticipant } from '../selectLatestPulseByParticipant'
import type { PulseSurvey } from '@/types'

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
  getCurrentWeekPulse: jest.fn(),
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
  }
})

const { getTeamDashboard, getCurrentWeekPulse } = jest.requireMock('@/lib/supabase/queries') as {
  getTeamDashboard: jest.Mock
  getCurrentWeekPulse: jest.Mock
}

function makePulseRow(overrides: Partial<PulseSurvey>): PulseSurvey {
  return {
    id: 'pulse-default',
    participant_id: 'P1',
    date: '2026-08-03',
    confident_health: true,
    body_trending_good: true,
    energy_level: 3,
    rest_quality: 3,
    stress_level: 3,
    physical_activity: ['outside'],
    mental_wellbeing: 3,
    program_supported: 'neutral',
    whoop_reviewed: 'no',
    health_flag: null,
    ...overrides,
  }
}

describe('selectLatestPulseByParticipant', () => {
  test('keeps the response with the latest date for a participant who submitted twice in one week', () => {
    const older = makePulseRow({ id: 'pulse-mon', participant_id: 'P1', date: '2026-08-03', mental_wellbeing: 2 })
    const newer = makePulseRow({ id: 'pulse-fri', participant_id: 'P1', date: '2026-08-07', mental_wellbeing: 5 })

    // Order-independent: regardless of whether the newer or older row comes first
    // in the array, the newest (by date) response must win.
    expect(selectLatestPulseByParticipant([newer, older])['P1']).toEqual(newer)
    expect(selectLatestPulseByParticipant([older, newer])['P1']).toEqual(newer)
  })

  test('falls back to a deterministic id comparison when dates are tied', () => {
    const a = makePulseRow({ id: 'pulse-aaa', participant_id: 'P1', date: '2026-08-03', mental_wellbeing: 1 })
    const b = makePulseRow({ id: 'pulse-zzz', participant_id: 'P1', date: '2026-08-03', mental_wellbeing: 5 })

    expect(selectLatestPulseByParticipant([a, b])['P1']).toEqual(b)
    expect(selectLatestPulseByParticipant([b, a])['P1']).toEqual(b)
  })

  test('tracks each participant independently', () => {
    const p1 = makePulseRow({ id: 'pulse-p1', participant_id: 'P1', date: '2026-08-03' })
    const p2 = makePulseRow({ id: 'pulse-p2', participant_id: 'P2', date: '2026-08-05' })

    const result = selectLatestPulseByParticipant([p1, p2])
    expect(result['P1']).toEqual(p1)
    expect(result['P2']).toEqual(p2)
  })
})

describe('pulse page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getTeamDashboard.mockResolvedValue({
      participants: [
        {
          id: 'P1',
          first_name: 'Alex',
          last_name: 'Able',
          is_exact_data: false,
        },
      ],
    })
  })

  test('displays the newest response for a participant with two submissions this week, while the response count reflects both', async () => {
    getCurrentWeekPulse.mockResolvedValue([
      makePulseRow({ id: 'pulse-mon', participant_id: 'P1', date: '2026-08-03', mental_wellbeing: 2 }),
      makePulseRow({ id: 'pulse-fri', participant_id: 'P1', date: '2026-08-07', mental_wellbeing: 5 }),
    ])

    const page = await PulsePage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    // The per-participant summary shows the newer response's score (5), not the
    // older, overwritten one (2).
    expect(markup).toContain('2 responses')
    const summarySection = markup.split('Mental wellbeing by participant')[1]
    expect(summarySection).toBeDefined()
    // The bar count badge (2) reflects both submissions, and the displayed score
    // is the newest response's mental_wellbeing value (5), not the older one (2).
    expect(summarySection).toMatch(/>5</)
  })
})
