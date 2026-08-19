import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WellnessDirectorEventsPage from '../page'
import { requireLeadership } from '@/lib/supabase/server'
import { getParticipants } from '@/lib/supabase/queries'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/server', () => ({
  requireLeadership: jest.fn(),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getParticipants: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

jest.mock('@/components/layout/DashboardShell', () => {
  const React = require('react')
  return {
    DashboardShell: ({ title, children }: { title: string; children: React.ReactNode }) =>
      React.createElement('div', { 'data-title': title }, children),
  }
})

jest.mock('@/app/admin/events/AdminEventsClient', () => {
  const React = require('react')
  return {
    AdminEventsClient: ({ participants, role }: { participants: unknown[]; role: string }) =>
      React.createElement('div', {
        'data-role': role,
        'data-participant-count': participants.length,
      }, 'AdminEventsClient'),
  }
})

describe('WellnessDirectorEventsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the canonical shared events page for wellness directors', async () => {
    ;(requireLeadership as jest.MockedFunction<typeof requireLeadership>).mockResolvedValue({
      session: { user: { id: 'wd-1' } },
      role: 'wellness_director',
    } as never)
    ;(getParticipants as jest.MockedFunction<typeof getParticipants>).mockResolvedValue([
      {
        id: 'P1',
        auth_user_id: 'auth-1',
        first_name: 'Alex',
        last_name: 'Able',
        department: 'Ops',
        title: 'Nurse',
      },
    ] as never)
    ;(createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>).mockReturnValue({
      auth: {
        admin: {
          getUserById: jest.fn(async () => ({
            data: { user: { email: 'alex@example.com' } },
            error: null,
          })),
        },
      },
    } as never)

    const page = await WellnessDirectorEventsPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).toContain('data-title="Events and nudges"')
    expect(markup).toContain('data-role="wellness_director"')
    expect(markup).toContain('data-participant-count="1"')
  })

  test('also renders for admins with identical access', async () => {
    ;(requireLeadership as jest.MockedFunction<typeof requireLeadership>).mockResolvedValue({
      session: { user: { id: 'admin-1' } },
      role: 'admin',
    } as never)
    ;(getParticipants as jest.MockedFunction<typeof getParticipants>).mockResolvedValue([] as never)
    ;(createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>).mockReturnValue({
      auth: {
        admin: {
          getUserById: jest.fn(),
        },
      },
    } as never)

    const page = await WellnessDirectorEventsPage()
    const markup = renderToStaticMarkup(page as React.ReactElement)

    expect(markup).toContain('data-role="admin"')
    expect(markup).toContain('data-participant-count="0"')
  })
})
