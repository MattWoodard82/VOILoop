import { GET } from '../route'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

describe('GET /api/auth/access', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 401 when no authenticated session exists', async () => {
    mockGetSession.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  test('returns admin redirect without participant side effects', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      role: 'admin',
      mustChangePassword: false,
      redirectTo: '/wellness-director',
    })
    expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled()
  })

  test('creates missing participant access and returns change-password redirect', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } } as never)
    mockGetUserAccess
      .mockResolvedValueOnce({ role: null, mustChangePassword: false })
      .mockResolvedValueOnce({ role: 'participant', mustChangePassword: true })

    const upsert = jest.fn(async () => ({ error: null }))
    const maybeSingle = jest.fn(async () => ({ data: { id: 'EMP002' }, error: null }))
    const insert = jest.fn(async () => ({ error: null }))

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'user_access') return { upsert }
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle,
              })),
            })),
          }
        }
        if (table === 'login_activity') return { insert }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      role: 'participant',
      must_change_password: true,
    }, { onConflict: 'user_id' })
    expect(insert).toHaveBeenCalled()
    expect(body).toMatchObject({
      success: true,
      role: 'participant',
      mustChangePassword: true,
      redirectTo: '/change-password',
    })
  })
})
