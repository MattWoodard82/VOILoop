import { POST } from '../route'
import { createServerSupabaseClient, getUserAccess } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { provisionSupabaseAccount } from '@/lib/supabase/provision-account'

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
  const mockProvisionSupabaseAccount = provisionSupabaseAccount as jest.MockedFunction<typeof provisionSupabaseAccount>

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
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: 'EMP001' }, error: null })),
              })),
            })),
          }
        }
        if (table === 'login_activity') {
          return { insert: jest.fn(async () => ({ error: null })) }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(makeJsonLoginRequest('participant@example.com', 'Password123'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, redirectTo: '/my' })
    expect(mockProvisionSupabaseAccount).not.toHaveBeenCalled()
  })

  test('respects requested redirectTo after successful sign-in', async () => {
    mockCreateServerSupabaseClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn(async () => ({
          data: { user: { id: 'admin-user' } },
          error: null,
        })),
      },
    } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: null, error: null })),
              })),
            })),
          }
        }
        if (table === 'login_activity') {
          return { insert: jest.fn(async () => ({ error: null })) }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-id': 'test-request-id',
      },
      body: JSON.stringify({ email: 'admin@voiloop.local', password: 'Admin1234', redirectTo: '/admin' }),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, redirectTo: '/admin' })
  })

  test('repairs the configured admin account during login retry', async () => {
    process.env.PILOT_ADMIN_EMAIL = 'admin@voiloop.local'
    process.env.PILOT_ADMIN_PASSWORD = 'Admin1234'
    mockCreateAdminSupabaseClient.mockReturnValue({} as never)
    mockProvisionSupabaseAccount.mockResolvedValue({ userId: 'admin-user', status: 'updated' })
    mockCreateServerSupabaseClient.mockReturnValue({
      auth: {
        signInWithPassword: jest
          .fn()
          .mockResolvedValueOnce({
            data: { user: null },
            error: { message: 'Invalid login credentials' },
          })
          .mockResolvedValueOnce({
            data: { user: { id: 'admin-user' } },
            error: null,
          }),
      },
    } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: null, error: null })),
              })),
            })),
          }
        }
        if (table === 'login_activity') {
          return { insert: jest.fn(async () => ({ error: null })) }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(makeJsonLoginRequest('admin@voiloop.local', 'Admin1234'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, redirectTo: '/wellness-director' })
    expect(mockProvisionSupabaseAccount).toHaveBeenCalled()
  })
})
