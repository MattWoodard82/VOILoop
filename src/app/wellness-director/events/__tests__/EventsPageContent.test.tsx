import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EventsPageContent } from '../EventsPageContent'
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

jest.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'dashboard-shell' }, children)
  },
}))

jest.mock('@/app/admin/events/AdminEventsClient', () => ({
  AdminEventsClient: ({ participants }: { participants: Array<{ id: string; label: string }> }) => {
    const React = require('react')
    return React.createElement(
      'div',
      { 'data-testid': 'admin-events-client' },
      participants.map((p) =>
        React.createElement('span', { key: p.id, 'data-testid': `participant-label-${p.id}` }, p.label)
      )
    )
  },
}))

describe('EventsPageContent participant labels', () => {
  const mockRequireLeadership = requireLeadership as jest.MockedFunction<typeof requireLeadership>
  const mockGetParticipants = getParticipants as jest.MockedFunction<typeof getParticipants>
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireLeadership.mockResolvedValue({
      redirect: undefined,
      role: 'wellness_director',
      session: { user: { id: 'wd-1' } },
    } as never)
    // Enable the auth-email lookup path so we can prove the label never uses it.
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  test('always labels participants with first and last name, never the email', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: jest.fn((authUserId: string) => {
            if (authUserId === 'auth-1') {
              return Promise.resolve({ data: { user: { email: 'jane.doe@example.com' } }, error: null })
            }
            return Promise.resolve({ data: { user: { email: 'blank.user@example.com' } }, error: null })
          }),
        },
      },
    } as never)

    mockGetParticipants.mockResolvedValue([
      {
        id: 'p1',
        auth_user_id: 'auth-1',
        first_name: 'Jane',
        last_name: 'Doe',
        department: 'Ops',
        title: 'Manager',
      },
      {
        id: 'p2',
        auth_user_id: 'auth-2',
        first_name: '',
        last_name: '',
        department: 'Ops',
        title: 'Analyst',
      },
    ] as never)

    const element = await EventsPageContent()
    const markup = renderToStaticMarkup(element)

    // Participant with a name should show "First Last", even though an email is available.
    expect(markup).toContain('Jane Doe')
    // No label should ever render an email address, whether or not name fields are populated.
    expect(markup).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/)
  })
})
