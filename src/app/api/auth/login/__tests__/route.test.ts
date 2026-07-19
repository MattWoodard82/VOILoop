import { POST } from '../route'
import { createServerSupabaseClient, getUserAccess } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getUserAccess: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

jest.mock('@/lib/supabase/provision-account', () => ({
  provisionSupabaseAccount: jest.fn(),
}))

function makeJsonLoginRequest(email: string, password: string): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-id': 'test-request-id',
    },
    body: JSON.stringify({ email, password }),
  })
}

describe('POST /api/auth/login', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('routes participant users to /my', async () => {
    mockCreateServerSupabaseClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn(async () => ({
          data: { user: { id: 'user-1' } },
          error: null,
        })),
      },
    } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const response = await POST(makeJsonLoginRequest('participant@example.com', 'Password123'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, redirectTo: '/my' })
  })

  test('initializes missing role as participant and routes to /my', async () => {
    mockCreateServerSupabaseClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn(async () => ({
          data: { user: { id: 'user-2' } },
          error: null,
        })),
      },
    } as never)
    mockGetUserAccess
      .mockResolvedValueOnce({ role: null, mustChangePassword: false })
      .mockResolvedValueOnce({ role: 'participant', mustChangePassword: true })

    const upsert = jest.fn(async () => ({ error: null }))
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({ upsert })),
    } as never)

    const response = await POST(makeJsonLoginRequest('new-user@example.com', 'Password123'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      role: 'participant',
      must_change_password: true,
    }, { onConflict: 'user_id' })
    expect(body).toMatchObject({ success: true, redirectTo: '/change-password' })
  })
})
