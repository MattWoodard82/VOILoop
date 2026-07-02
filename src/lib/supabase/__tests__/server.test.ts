import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { setMustChangePassword } from '../server'

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

describe('setMustChangePassword', () => {
  const mockCookies = cookies as jest.MockedFunction<typeof cookies>
  const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockCookies.mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
    } as never)
  })

  test('preserves the existing role when updating the password gate', async () => {
    const maybeSingle = jest.fn(async () => ({
      data: { role: 'admin', must_change_password: false },
      error: null,
    }))
    const upsert = jest.fn(async () => ({ error: null }))

    mockCreateServerClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'user_access') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle,
              })),
            })),
            upsert,
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    await setMustChangePassword('user-1', true)

    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      must_change_password: true,
      role: 'admin',
    }, { onConflict: 'user_id' })
  })

  test('falls back to employee role when no existing access row is found', async () => {
    const maybeSingle = jest.fn(async () => ({
      data: null,
      error: { message: 'not found' },
    }))
    const single = jest.fn(async () => ({
      data: null,
      error: { message: 'no legacy role' },
    }))
    const upsert = jest.fn(async () => ({ error: null }))

    mockCreateServerClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'user_access') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle,
              })),
            })),
            upsert,
          }
        }
        if (table === 'user_roles') {
          return {
            select: jest.fn(() => ({
              single,
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    await setMustChangePassword('user-2', false)

    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      must_change_password: false,
      role: 'employee',
    }, { onConflict: 'user_id' })
  })
})
