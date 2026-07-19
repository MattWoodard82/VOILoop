import { provisionSupabaseAccount } from '@/lib/supabase/provision-account'

function createMockAdminClient() {
  const listUsers: jest.Mock = jest.fn(async () => ({
    data: { users: [] as Array<{ id: string; email?: string | null }> },
    error: null,
  }))
  const createUser = jest.fn(async () => ({ data: { user: { id: 'new-user-id' } }, error: null }))
  const updateUserById = jest.fn(async () => ({ error: null }))
  const upsert = jest.fn(async () => ({ error: null }))

  const adminClient = {
    auth: {
      admin: {
        listUsers,
        createUser,
        updateUserById,
      },
    },
    from: jest.fn((table: string) => {
      if (table !== 'user_access') {
        throw new Error(`Unexpected table ${table}`)
      }
      return { upsert }
    }),
  }

  return {
    adminClient: adminClient as any,
    listUsers,
    createUser,
    updateUserById,
    upsert,
  }
}

describe('provisionSupabaseAccount', () => {
  test('creates a new account and access row when no existing user is found', async () => {
    const mocks = createMockAdminClient()

    const result = await provisionSupabaseAccount({
      adminClient: mocks.adminClient,
      email: '  Pilot@example.com ',
      password: 'Password123',
      role: 'participant',
      mustChangePassword: true,
    })

    expect(result).toEqual({ userId: 'new-user-id', status: 'created' })
    expect(mocks.listUsers).toHaveBeenCalled()
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'pilot@example.com',
      password: 'Password123',
      email_confirm: true,
    })
    expect(mocks.upsert).toHaveBeenCalledWith({
      user_id: 'new-user-id',
      role: 'participant',
      must_change_password: true,
    }, { onConflict: 'user_id' })
  })

  test('updates an existing account and applies admin access settings', async () => {
    const mocks = createMockAdminClient()
    mocks.listUsers.mockImplementationOnce(async () => ({
      data: { users: [{ id: 'existing-user-id', email: 'admin@voiloop.com' }] },
      error: null,
    }))

    const result = await provisionSupabaseAccount({
      adminClient: mocks.adminClient,
      email: 'admin@voiloop.com',
      password: 'Password123',
      role: 'admin',
      mustChangePassword: false,
    })

    expect(result).toEqual({ userId: 'existing-user-id', status: 'updated' })
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.updateUserById).toHaveBeenCalledWith('existing-user-id', {
      password: 'Password123',
      email_confirm: true,
    })
    expect(mocks.upsert).toHaveBeenCalledWith({
      user_id: 'existing-user-id',
      role: 'admin',
      must_change_password: false,
    }, { onConflict: 'user_id' })
  })

  test('uses existingUserId directly without scanning users', async () => {
    const mocks = createMockAdminClient()

    const result = await provisionSupabaseAccount({
      adminClient: mocks.adminClient,
      email: 'wd@example.com',
      password: 'Password123',
      role: 'wellness_director',
      mustChangePassword: true,
      existingUserId: 'known-user-id',
    })

    expect(result).toEqual({ userId: 'known-user-id', status: 'updated' })
    expect(mocks.listUsers).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.updateUserById).toHaveBeenCalledWith('known-user-id', {
      password: 'Password123',
      email_confirm: true,
    })
  })
})
