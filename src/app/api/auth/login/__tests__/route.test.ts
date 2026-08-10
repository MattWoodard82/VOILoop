import { POST } from '../route'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { provisionSupabaseAccount } from '@/lib/supabase/provision-account'

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
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>
  const mockProvisionSupabaseAccount = provisionSupabaseAccount as jest.MockedFunction<typeof provisionSupabaseAccount>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns success for non-admin browser bootstrap requests', async () => {
    const response = await POST(makeJsonLoginRequest('participant@example.com', 'Password123'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true })
    expect(mockProvisionSupabaseAccount).not.toHaveBeenCalled()
  })

  test('repairs the configured admin account during bootstrap', async () => {
    process.env.PILOT_ADMIN_EMAIL = 'admin@voiloop.local'
    process.env.PILOT_ADMIN_PASSWORD = 'Admin1234'
    mockCreateAdminSupabaseClient.mockReturnValue({} as never)
    mockProvisionSupabaseAccount.mockResolvedValue({ userId: 'admin-user', status: 'updated' })

    const response = await POST(makeJsonLoginRequest('admin@voiloop.local', 'Admin1234'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true })
    expect(mockProvisionSupabaseAccount).toHaveBeenCalled()
  })
})
