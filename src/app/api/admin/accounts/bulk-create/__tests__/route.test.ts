import { POST } from '../route'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

function makeRequest(csv: string, accountType: 'employee' | 'wellness_director' = 'employee') {
  const formData = new FormData()
  const file = new File([Buffer.from(csv)], 'accounts.csv', { type: 'text/csv' })
  formData.append('file', file)
  formData.append('accountType', accountType)
  return {
    formData: async () => formData,
  } as Request
}

describe('POST /api/admin/accounts/bulk-create', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when accountType is invalid', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-user' } } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
          })),
        })),
      })),
    } as never)

    const formData = new FormData()
    formData.append('file', new File([Buffer.from('email\nuser@example.com')], 'accounts.csv', { type: 'text/csv' }))
    formData.append('accountType', 'admin')

    const response = await POST({
      formData: async () => formData,
    } as Request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'A valid account type is required.' })
  })

  test('creates wellness director accounts through the existing CSV flow', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-user' } } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
          })),
        })),
      })),
    } as never)

    const upsertUserAccess = jest.fn(async () => ({ error: null }))
    const employeesSelect = jest.fn(async () => ({ data: [], error: null }))
    const insertEmployee = jest.fn(async () => ({ error: null }))
    const createUser = jest.fn(async () => ({ data: { user: { id: 'wd-1' } }, error: null }))
    const listUsers = jest.fn(async () => ({ data: { users: [] }, error: null }))

    mockCreateAdminSupabaseClient.mockReturnValue({
      auth: {
        admin: {
          listUsers,
          createUser,
          updateUserById: jest.fn(),
        },
      },
      from: jest.fn((table: string) => {
        if (table === 'user_access') {
          return { upsert: upsertUserAccess }
        }

        if (table === 'employees') {
          return {
            select: employeesSelect,
            insert: insertEmployee,
          }
        }

        return {}
      }),
    } as never)

    const response = await POST(makeRequest('email\nwd@example.com', 'wellness_director'))

    expect(response.status).toBe(200)
    expect(employeesSelect).not.toHaveBeenCalled()
    expect(insertEmployee).not.toHaveBeenCalled()
    expect(upsertUserAccess).toHaveBeenCalledWith({
      user_id: 'wd-1',
      role: 'wellness_director',
      must_change_password: true,
    }, { onConflict: 'user_id' })
    expect(response.headers.get('Content-Disposition')).toContain('wellness-director-passwords.csv')

    const body = await response.text()
    expect(body).toContain('"wd@example.com","wellness_director","","')
  })

  test('creates employee records for employee account runs', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-user' } } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
          })),
        })),
      })),
    } as never)

    const upsertUserAccess = jest.fn(async () => ({ error: null }))
    const insertEmployee = jest.fn(async () => ({ error: null }))
    const createUser = jest.fn(async () => ({ data: { user: { id: 'emp-auth-1' } }, error: null }))
    const listUsers = jest.fn(async () => ({ data: { users: [] }, error: null }))

    mockCreateAdminSupabaseClient.mockReturnValue({
      auth: {
        admin: {
          listUsers,
          createUser,
          updateUserById: jest.fn(),
        },
      },
      from: jest.fn((table: string) => {
        if (table === 'user_access') {
          return { upsert: upsertUserAccess }
        }

        if (table === 'employees') {
          return {
            select: jest.fn(async () => ({ data: [], error: null })),
            insert: insertEmployee,
          }
        }

        return {}
      }),
    } as never)

    const response = await POST(makeRequest('email\npilot@example.com', 'employee'))

    expect(response.status).toBe(200)
    expect(upsertUserAccess).toHaveBeenCalledWith({
      user_id: 'emp-auth-1',
      role: 'employee',
      must_change_password: true,
    }, { onConflict: 'user_id' })
    expect(insertEmployee).toHaveBeenCalledWith(expect.objectContaining({
      id: 'EMP001',
      auth_user_id: 'emp-auth-1',
      first_name: 'Pilot',
      last_name: 'User',
    }))

    const body = await response.text()
    expect(body).toContain('"pilot@example.com","employee","EMP001","')
  })
})
