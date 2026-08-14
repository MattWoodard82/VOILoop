import { DELETE } from '../route'
import { createServerSupabaseClient, requireLeadership } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  requireLeadership: jest.fn(),
}))

describe('DELETE /api/admin/events/[id]', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockRequireLeadership = requireLeadership as jest.MockedFunction<typeof requireLeadership>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 403 for non-admin users', async () => {
    mockRequireLeadership.mockResolvedValue({ redirect: '/my' } as never)

    const response = await DELETE(new Request('http://localhost/api/admin/events/event-1'), {
      params: { id: 'event-1' },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })

  test('returns 400 when event id is missing', async () => {
    mockRequireLeadership.mockResolvedValue({ session: { user: { id: 'wd-1' } }, role: 'wellness_director' } as never)

    const response = await DELETE(new Request('http://localhost/api/admin/events/%20'), {
      params: { id: '  ' },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Event id is required.' })
  })

  test('deletes event for leadership users', async () => {
    mockRequireLeadership.mockResolvedValue({ session: { user: { id: 'wd-1' } }, role: 'wellness_director' } as never)

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

    expect(response.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('id', 'event-1')
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test('rejects nudge deletion for admins when kind=nudge', async () => {
    mockRequireLeadership.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const response = await DELETE(new Request('http://localhost/api/admin/events/nudge-1?kind=nudge'), {
      params: { id: 'nudge-1' },
    })

    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toEqual({
      error: 'Published nudges are append-only and cannot be deleted.',
    })
  })

  test('returns 500 when delete fails', async () => {
    mockRequireLeadership.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

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
