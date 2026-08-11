import { DELETE } from '../route'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  requireAdmin: jest.fn(),
}))

describe('DELETE /api/admin/events/[id]', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 403 for non-admin users', async () => {
    mockRequireAdmin.mockResolvedValue({ redirect: '/my' } as never)

    const response = await DELETE(new Request('http://localhost/api/admin/events/event-1'), {
      params: { id: 'event-1' },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })

  test('returns 400 when event id is missing', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const response = await DELETE(new Request('http://localhost/api/admin/events/%20'), {
      params: { id: '  ' },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Event id is required.' })
  })

  test('deletes event for admins', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const eq = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'events') {
          return {
            delete: jest.fn(() => ({ eq })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await DELETE(new Request('http://localhost/api/admin/events/event-1'), {
      params: { id: 'event-1' },
    })

    test('deletes nudge for admins when kind=nudge', async () => {
      mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

      const eq = jest.fn(async () => ({ error: null }))
      const from = jest.fn((table: string) => ({
        delete: jest.fn(() => ({ eq })),
      }))
      mockCreateServerSupabaseClient.mockReturnValue({ from } as never)

      const response = await DELETE(new Request('http://localhost/api/admin/events/nudge-1?kind=nudge'), {
        params: { id: 'nudge-1' },
      })

      expect(response.status).toBe(200)
      expect(from).toHaveBeenCalledWith('weekly_nudges')
      expect(eq).toHaveBeenCalledWith('id', 'nudge-1')
    })

    expect(response.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('id', 'event-1')
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test('returns 500 when delete fails', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const eq = jest.fn(async () => ({ error: { message: 'db failed' } }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        delete: jest.fn(() => ({ eq })),
      })),
    } as never)

    const response = await DELETE(new Request('http://localhost/api/admin/events/event-1'), {
      params: { id: 'event-1' },
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ error: 'db failed' })
  })
})
