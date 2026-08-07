import { GET, POST, PUT } from '../route'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  requireAdmin: jest.fn(),
}))

describe('admin events routes', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('GET returns 403 for non-admin users', async () => {
    mockRequireAdmin.mockResolvedValue({ redirect: '/my' } as never)

    const response = await GET()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })

  test('GET returns events and nudges for admins', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const eventsOrder = jest.fn(async () => ({
      data: [{ id: 'evt-1', title: 'Morning Run' }],
      error: null,
    }))
    const nudgesLimit = jest.fn(async () => ({
      data: [{ id: 'nud-1', message: 'Hydrate today' }],
      error: null,
    }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'events') {
          return {
            select: jest.fn(() => ({
              gte: jest.fn(() => ({
                order: eventsOrder,
              })),
            })),
          }
        }
        if (table === 'weekly_nudges') {
          return {
            select: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: nudgesLimit,
              })),
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      events: [{ id: 'evt-1', title: 'Morning Run' }],
      nudges: [{ id: 'nud-1', message: 'Hydrate today' }],
    })
  })

  test('POST validates required event fields', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const response = await POST(new Request('http://localhost/api/admin/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: ' ', event_date: '' }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Event title and date are required.',
    })
  })

  test('POST creates an event for admins', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const insert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'events') return { insert }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(new Request('http://localhost/api/admin/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Community 5k',
        description: 'Saturday run',
        event_date: '2026-08-01',
        event_time: '08:00',
        location: 'Park',
        event_type: 'race',
        recurring: false,
      }),
    }))

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Community 5k',
      event_date: '2026-08-01',
      event_type: 'race',
      recurring: false,
      recurrence: null,
    }))
  })

  test('PUT upserts weekly nudge for admins', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const nudgeSelectSingle = jest.fn(async () => ({ data: { id: 'nudge-1' }, error: null }))
    const nudgeTargetUpsert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'weekly_nudges') {
          return {
            upsert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: nudgeSelectSingle,
              })),
            })),
          }
        }
        if (table === 'nudge_targets') return { upsert: nudgeTargetUpsert }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/events', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Get outside today.',
        author: 'Coach',
        week_of: '2026-07-20',
        target_type: 'participant',
        target_label: 'Night Shift',
        participant_id: 'EMP-1',
      }),
    }))

    expect(response.status).toBe(200)
    expect(nudgeTargetUpsert).toHaveBeenCalledWith({
      nudge_id: 'nudge-1',
      target_type: 'participant',
      target_label: 'Night Shift',
      participant_id: 'EMP-1',
    })
    expect(nudgeSelectSingle).toHaveBeenCalled()
  })

  test('PUT rejects missing target fields', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const response = await PUT(new Request('http://localhost/api/admin/events', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Get outside today.',
        target_type: 'participant',
      }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Target label is required for targeted nudges.',
    })
  })
})
