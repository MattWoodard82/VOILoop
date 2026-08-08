import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TeamPage from '../page'

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(async () => ({ user: { id: 'user-1' } })),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getParticipantRankContext: jest.fn(async () => {
    const error = new Error('Participant not found.')
    ;(error as Error & { status?: number }).status = 404
    throw error
  }),
}))

jest.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}))

jest.mock('@/components/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => React.createElement('section', null, children),
}))

describe('team page', () => {
  test('renders a safe fallback when the participant record is missing', async () => {
    const element = await TeamPage()
    const markup = renderToStaticMarkup(element as React.ReactElement)

    expect(markup).toContain('Your participant record is being prepared. Check back shortly.')
  })
})
