import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WellnessDirectorEventsPage from '../page'
import { requireLeadership } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  requireLeadership: jest.fn(),
}))

// Mock EventsPageContent as a sync component that reflects the role from requireLeadership
jest.mock('../EventsPageContent', () => {
  const { requireLeadership } = require('@/lib/supabase/server')
  return {
    EventsPageContent: () => {
      // requireLeadership is already mocked — read the resolved value synchronously via the mock
      const mock = requireLeadership as jest.Mock
      const resolvedValue = mock.mock.results[0]?.value?.role ?? 'unknown'
      const React = require('react')
      return React.createElement('div', {
        'data-testid': 'events-page-content',
        'data-role': resolvedValue,
      }, 'events-client')
    },
  }
})

describe('WellnessDirectorEventsPage', () => {
  const mockRequireLeadership = requireLeadership as jest.MockedFunction<typeof requireLeadership>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the events page for wellness_director role', async () => {
    mockRequireLeadership.mockResolvedValue({
      redirect: undefined,
      role: 'wellness_director',
      session: { user: { id: 'wd-1' } },
    } as never)

    const page = await WellnessDirectorEventsPage()
    const markup = renderToStaticMarkup(page)

    expect(markup).toContain('data-testid="events-page-content"')
    expect(markup).toContain('events-client')
  })

  test('renders the events page for admin role', async () => {
    mockRequireLeadership.mockResolvedValue({
      redirect: undefined,
      role: 'admin',
      session: { user: { id: 'admin-1' } },
    } as never)

    const page = await WellnessDirectorEventsPage()
    const markup = renderToStaticMarkup(page)

    expect(markup).toContain('data-testid="events-page-content"')
    expect(markup).toContain('events-client')
  })
})