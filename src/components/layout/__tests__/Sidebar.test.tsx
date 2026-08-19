import { getNavigationForRole } from '../Sidebar'

describe('Sidebar navigation guards', () => {
  test('does not render leadership links when role is unknown during hydration', () => {
    expect(getNavigationForRole(null, '/wellness-director')).toEqual([])
    expect(getNavigationForRole(null, '/admin')).toEqual([])
  })

  test('returns participant links for participant users only', () => {
    const nav = getNavigationForRole('participant', '/wellness-director')
    expect(nav).toHaveLength(1)
    expect(nav[0].items.map((item) => item.href)).toContain('/my')
    expect(nav[0].items.map((item) => item.href)).not.toContain('/admin')
  })

  test('returns leadership nav for wellness directors and admin nav for admins', () => {
    const leadershipNav = getNavigationForRole('wellness_director', '/pulse')
    expect(leadershipNav.flatMap((section) => section.items.map((item) => item.href))).toContain('/pulse')

    const adminNav = getNavigationForRole('admin', '/admin')
    expect(adminNav.flatMap((section) => section.items.map((item) => item.href))).toContain('/admin')
  })
})
