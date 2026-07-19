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

function makeRequest(csv: string, accountType: 'participant' | 'wellness_director' = 'participant') {
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
    const participantsSelect = jest.fn(async () => ({ data: [], error: null }))
    const insertParticipant = jest.fn(async () => ({ error: null }))
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

        if (table === 'participants') {
          return {
            select: participantsSelect,
            insert: insertParticipant,
          }
        }

        return {}
      }),
    } as never)

    const response = await POST(makeRequest('email\nwd@example.com', 'wellness_director'))

    expect(response.status).toBe(200)
    expect(participantsSelect).not.toHaveBeenCalled()
    expect(insertParticipant).not.toHaveBeenCalled()
    expect(upsertUserAccess).toHaveBeenCalledWith({
      user_id: 'wd-1',
      role: 'wellness_director',
      must_change_password: true,
    }, { onConflict: 'user_id' })
    expect(response.headers.get('Content-Disposition')).toContain('wellness-director-passwords.csv')

    const body = await response.text()
    expect(body).toContain('"wd@example.com","wellness_director","","')
  })

  test('creates participant records for participant account runs', async () => {
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
    const insertParticipant = jest.fn(async () => ({ error: null }))
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

        if (table === 'participants') {
          return {
            select: jest.fn(async () => ({ data: [], error: null })),
            insert: insertParticipant,
          }
        }

        return {}
      }),
    } as never)

    const response = await POST(makeRequest('email\npilot@example.com', 'participant'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toContain('participant-passwords.csv')
    expect(upsertUserAccess).toHaveBeenCalledWith({
      user_id: 'emp-auth-1',
      role: 'participant',
      must_change_password: true,
    }, { onConflict: 'user_id' })
    expect(insertParticipant).toHaveBeenCalledWith(expect.objectContaining({
      id: 'EMP001',
      auth_user_id: 'emp-auth-1',
      first_name: 'pilot@example.com',
      last_name: '',
    }))

    const body = await response.text()
    const rows = body.split('\n')
    expect(rows[0]).toBe('email,account_type,participant_id,password,status')
    expect(rows[1] ?? '').toMatch(/^"pilot@example\.com","participant","EMP001","[A-Za-z0-9]{8}","created"$/)
  })

  test('increments participant ids from existing records', async () => {
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
    const insertParticipant = jest.fn(async () => ({ error: null }))
    const createUser = jest.fn(async () => ({ data: { user: { id: 'emp-auth-2' } }, error: null }))
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

        if (table === 'participants') {
          return {
            select: jest.fn(async () => ({
              data: [{ id: 'EMP009', auth_user_id: 'existing-auth-user' }],
              error: null,
            })),
            insert: insertParticipant,
          }
        }

        return {}
      }),
    } as never)

    const response = await POST(makeRequest('email\npilot2@example.com', 'participant'))

    expect(response.status).toBe(200)
    expect(insertParticipant).toHaveBeenCalledWith(expect.objectContaining({
      id: 'EMP010',
      auth_user_id: 'emp-auth-2',
    }))

    const body = await response.text()
    expect(body).toContain('"pilot2@example.com","participant","EMP010","')
  })
})
