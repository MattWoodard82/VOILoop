import { canOperateChallenges, requireChallengeOperator } from '../access'
import { getSession, getUserAccess } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

describe('challenge access', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('allows admins and wellness directors to operate challenges', () => {
    expect(canOperateChallenges('admin')).toBe(true)
    expect(canOperateChallenges('wellness_director')).toBe(true)
    expect(canOperateChallenges('employee')).toBe(false)
    expect(canOperateChallenges(null)).toBe(false)
  })

  test('returns success payload for wellness director session', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false })

    const result = await requireChallengeOperator()
    expect(result).toMatchObject({ userId: 'wd-1', role: 'wellness_director' })
  })

  test('returns success payload for admin session', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const result = await requireChallengeOperator()
    expect(result).toMatchObject({ userId: 'admin-1', role: 'admin' })
  })

  test('returns forbidden for employee role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'emp-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'employee', mustChangePassword: false })

    const result = await requireChallengeOperator()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      const response = result.error!
      expect(response.status).toBe(403)
    }
  })
})
