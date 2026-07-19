import { POST } from '../route'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

describe('POST /api/auth/mark-password-changed', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 401 when no authenticated session exists', async () => {
    mockGetSession.mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  test('preserves admin role and redirects to the wellness director dashboard', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: true })

    const upsert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({ upsert })),
    } as never)

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      role: 'admin',
      must_change_password: false,
    }, { onConflict: 'user_id' })
    expect(body).toMatchObject({
      success: true,
      redirectTo: '/wellness-director',
    })
  })

  test('defaults to participant role and redirects to my page when no role is found', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: null, mustChangePassword: true })

    const upsert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({ upsert })),
    } as never)

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      role: 'participant',
      must_change_password: false,
    }, { onConflict: 'user_id' })
    expect(body).toMatchObject({
      success: true,
      redirectTo: '/my',
    })
  })

  test('returns 500 when the user_access update fails', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-3' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: true })

    const upsert = jest.fn(async () => ({ error: { message: 'db failed' } }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({ upsert })),
    } as never)

    const response = await POST()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ error: 'db failed' })
  })
})
