import { canOperateInterventions, requireInterventionOperator } from '../access'
import { getSession, getUserAccess } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

describe('intervention access', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('allows admins and wellness directors to operate interventions', () => {
    expect(canOperateInterventions('admin')).toBe(true)
    expect(canOperateInterventions('wellness_director')).toBe(true)
    expect(canOperateInterventions('participant')).toBe(false)
    expect(canOperateInterventions(null)).toBe(false)
  })

  test('returns success payload for wellness director session', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false })

    const result = await requireInterventionOperator()
    expect(result).toMatchObject({ userId: 'wd-1', role: 'wellness_director' })
  })

  test('returns forbidden for participant role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'emp-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const result = await requireInterventionOperator()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error?.status).toBe(403)
    }
  })
})
