import { renderToStaticMarkup } from 'react-dom/server'
import RulesPage from '../page'

jest.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}))

describe('RulesPage', () => {
  test('shows participant-facing rules content only', () => {
    const markup = renderToStaticMarkup(<RulesPage />)

    expect(markup).toContain('Rewards rules')
    expect(markup).toContain('Accrual')
    expect(markup).toContain('Caps')
    expect(markup).toContain('Bonuses')
    expect(markup).not.toContain('Operator order')
    expect(markup).not.toContain('Open admin')
  })
})
