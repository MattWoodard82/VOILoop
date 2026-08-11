import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RulesPage from '../page'

jest.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children),
}))

describe('RulesPage', () => {
  test('shows rules content and admin link', () => {
    const markup = renderToStaticMarkup(React.createElement(RulesPage))

    expect(markup).toContain('Rewards rules')
    expect(markup).toContain('Accrual')
    expect(markup).toContain('Caps')
    expect(markup).toContain('Bonuses')
    expect(markup).toContain('Open admin')
    expect(markup).toContain('href="/admin"')
  })
})
