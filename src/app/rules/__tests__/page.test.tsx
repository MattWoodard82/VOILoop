import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RulesPage from '../page'

jest.mock('@/lib/feature-flags', () => ({
  isRewardsRolloutEnabled: jest.fn(),
}))

jest.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children),
}))

describe('RulesPage', () => {
  const { isRewardsRolloutEnabled } = jest.requireMock('@/lib/feature-flags') as {
    isRewardsRolloutEnabled: jest.Mock
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('shows hidden message when rewards rollout is disabled', () => {
    isRewardsRolloutEnabled.mockReturnValue(false)

    const markup = renderToStaticMarkup(React.createElement(RulesPage))

    expect(markup).toContain('Rules are hidden until the rewards rollout is enabled.')
    expect(markup).not.toContain('Rewards rules')
  })

  test('shows rules content and admin link when rewards rollout is enabled', () => {
    isRewardsRolloutEnabled.mockReturnValue(true)

    const markup = renderToStaticMarkup(React.createElement(RulesPage))

    expect(markup).toContain('Rewards rules')
    expect(markup).toContain('Accrual')
    expect(markup).toContain('Caps')
    expect(markup).toContain('Bonuses')
    expect(markup).toContain('Open admin')
    expect(markup).toContain('href="/admin"')
  })
})
