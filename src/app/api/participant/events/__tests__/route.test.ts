import { GET, PATCH, POST } from '../route'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/participant/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/participant/events', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('GET returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)

    const response = await GET()
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  test('GET returns 403 for non-participant role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const response = await GET()
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })

  test('GET returns participant events, nudge, and RSVP state', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest.fn(async () => ({ data: { id: 'EMP123' }, error: null }))
    const eventsLimit = jest.fn(async () => ({
      data: [{ id: 'evt-1', title: 'Walk Club' }],
      error: null,
    }))
    const rsvpsEq = jest.fn(async () => ({
      data: [{ event_id: 'evt-1' }],
      error: null,
    }))

    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: participantsMaybeSingle,
              })),
            })),
          }
        }
        if (table === 'events') {
          return {
            select: jest.fn(() => ({
              gte: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: eventsLimit,
                })),
              })),
            })),
          }
        }
        if (table === 'weekly_nudges') {
          return {
            select: jest.fn(() => ({
              lte: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: eventsLimit,
                })),
              })),
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: { id: 'nudge-1', message: 'Hydrate', author: 'Coach', week_of: '2026-07-20', nudge_targets: [{ target_type: 'all', participant_id: null }] },
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'event_rsvps') {
          return {
            select: jest.fn(() => ({
              eq: rsvpsEq,
            })),
          }
        }
        if (table === 'nudge_acknowledgements') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: { acknowledged_at: '2026-07-20T12:00:00Z', response_text: 'Will do', response_due_at: '2026-07-22T12:00:00Z' },
                  error: null,
                })),
              })),
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await GET()
    if (!response) throw new Error('Expected response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      events: [{ id: 'evt-1', title: 'Walk Club' }],
      nudge: null,
      acknowledgement: null,
      rsvpEventIds: ['evt-1'],
    })
  })

  test('POST inserts RSVP for participant when going=true', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest.fn(async () => ({ data: { id: 'EMP123' }, error: null }))
    const upsert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: participantsMaybeSingle,
              })),
            })),
          }
        }
        if (table === 'event_rsvps') return { upsert }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(makePostRequest({ eventId: 'evt-1', going: true }))
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      { event_id: 'evt-1', participant_id: 'EMP123' },
      { onConflict: 'event_id,participant_id', ignoreDuplicates: true },
    )
  })

  test('POST removes RSVP for participant when going=false', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest.fn(async () => ({ data: { id: 'EMP123' }, error: null }))
    const eqParticipant = jest.fn(async () => ({ error: null }))
    const eqEvent = jest.fn(() => ({ eq: eqParticipant }))

    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: participantsMaybeSingle,
              })),
            })),
          }
        }
        if (table === 'event_rsvps') {
          return {
            delete: jest.fn(() => ({
              eq: eqEvent,
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(makePostRequest({ eventId: 'evt-1', going: false }))
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(200)
    expect(eqEvent).toHaveBeenCalledWith('event_id', 'evt-1')
    expect(eqParticipant).toHaveBeenCalledWith('participant_id', 'EMP123')
  })

  test('POST returns 400 when going is not a boolean', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest.fn(async () => ({ data: { id: 'EMP123' }, error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return { select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: participantsMaybeSingle })) })) }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(makePostRequest({ eventId: 'evt-1', going: 'true' }))
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('boolean') })
  })

  test('PATCH records an acknowledgement response', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest.fn(async () => ({ data: { id: 'EMP123' }, error: null }))
    const upsert = jest.fn(async () => ({ error: null }))

    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: participantsMaybeSingle,
              })),
            })),
          }
        }
        if (table === 'events') {
          return {
            select: jest.fn(() => ({
              gte: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(async () => ({
                    data: [{ id: 'evt-1', title: 'Walk Club' }],
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'weekly_nudges') {
          return {
            select: jest.fn(() => ({
              lte: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(async () => ({
                    data: [{ id: 'nudge-1', message: 'Hydrate', author: 'Coach', week_of: '2026-08-07', nudge_targets: [{ target_type: 'all', participant_id: null }] }],
                    error: null,
                  })),
                })),
              })),
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: { id: 'nudge-1', week_of: '2026-08-07', nudge_targets: [{ target_type: 'participant', participant_id: 'EMP123' }] },
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'nudge_acknowledgements') return { upsert }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await PATCH(makePostRequest({ nudgeId: 'nudge-1', responseText: 'Will do' }))
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      nudge_id: 'nudge-1',
      participant_id: 'EMP123',
      response_text: 'Will do',
    }), { onConflict: 'nudge_id,participant_id' })
  })

  test('PATCH rejects acknowledgements for untargeted nudges', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest.fn(async () => ({ data: { id: 'EMP123' }, error: null }))
    const upsert = jest.fn(async () => ({ error: null }))

    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: participantsMaybeSingle,
              })),
            })),
          }
        }
        if (table === 'weekly_nudges') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: { id: 'nudge-1', week_of: '2026-07-01', nudge_targets: [{ target_type: 'participant', participant_id: 'EMP123' }] },
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'nudge_acknowledgements') return { upsert }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await PATCH(makePostRequest({ nudgeId: 'nudge-1', responseText: 'Will do' }))
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Response window has closed.' })
    expect(upsert).not.toHaveBeenCalled()
  })
})
