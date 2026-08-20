import { PATCH } from '../route'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/interventions/int-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/interventions/[id]', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)

    const response = await PATCH(makePatchRequest({ status: 'Pending' }), {
      params: { id: 'int-1' },
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  test('returns 403 for participant role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const response = await PATCH(makePatchRequest({ status: 'Pending' }), {
      params: { id: 'int-1' },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })

  test('returns 400 for invalid status', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false })

    const response = await PATCH(makePatchRequest({ status: 'Done' }), {
      params: { id: 'int-1' },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid intervention status.' })
  })

  test('updates intervention for wellness director and clears date when unresolved', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false })

    const updateEq = jest.fn(async () => ({ error: null }))
    const update = jest.fn(() => ({ eq: updateEq }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'interventions') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: { date_actioned: null },
                  error: null,
                })),
              })),
            })),
            update,
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await PATCH(makePatchRequest({
      status: 'Monitoring',
      notes: 'Progressing',
      wdNotes: 'Keep checking weekly',
    }), {
      params: { id: 'int-1' },
    })

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith({
      outcome: 'Monitoring',
      notes: 'Progressing',
      wd_notes: 'Keep checking weekly',
      date_actioned: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      date_resolved: null,
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'int-1')
  })

  test('sets date_resolved when status is Resolved', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const updateEq = jest.fn(async () => ({ error: null }))
    const update = jest.fn(() => ({ eq: updateEq }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { date_actioned: '2026-08-01' },
              error: null,
            })),
          })),
        })),
        update,
      })),
    } as never)

    const response = await PATCH(makePatchRequest({
      status: 'Resolved',
      notes: 'Completed',
      wdNotes: 'Close case',
    }), {
      params: { id: 'int-2' },
    })

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'Resolved',
      date_actioned: '2026-08-01',
      date_resolved: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
  })

  test('saving notes on an already-Resolved record preserves the original date_resolved', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const update = jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { date_actioned: '2026-08-01', date_resolved: '2026-08-10', outcome: 'Resolved' },
              error: null,
            })),
          })),
        })),
        update,
      })),
    } as never)

    const response = await PATCH(makePatchRequest({
      status: 'Resolved',
      notes: 'Updated notes without changing status',
      wdNotes: 'Added wd note',
    }), {
      params: { id: 'int-4' },
    })

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'Resolved',
      date_resolved: '2026-08-10', // preserved, not overwritten with today
    }))
  })
  test('reopening preserves date_actioned and clears date_resolved', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const update = jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { date_actioned: '2026-08-01' },
              error: null,
            })),
          })),
        })),
        update,
      })),
    } as never)

    const response = await PATCH(makePatchRequest({
      status: 'Pending',
      notes: 'Needs more follow-up',
      wdNotes: 'Reopened after participant relapse',
    }), {
      params: { id: 'int-3' },
    })

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith({
      outcome: 'Pending',
      notes: 'Needs more follow-up',
      wd_notes: 'Reopened after participant relapse',
      date_actioned: '2026-08-01',
      date_resolved: null,
    })
  })
})
