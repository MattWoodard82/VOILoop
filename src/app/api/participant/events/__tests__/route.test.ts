import { GET, PATCH, POST } from '../route'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'
import { getDbEncryptionKey } from '@/lib/supabase/encryption'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

jest.mock('@/lib/supabase/encryption', () => ({
  getDbEncryptionKey: jest.fn(() => 'staging-placeholder-key-only-for-demo'),
}))

function makeRequest(method: 'POST' | 'PATCH', body: unknown): Request {
  return new Request('http://localhost/api/participant/events', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePostRequest(body: unknown): Request {
  return makeRequest('POST', body)
}

function makePatchRequest(body: unknown): Request {
  return makeRequest('PATCH', body)
}

function createGetRouteMock({
  cohort = null,
  targetedRows = [],
  nudgeRows = [],
  events = [{ id: 'evt-1', title: 'Walk Club' }],
  rsvps = [{ event_id: 'evt-1' }],
  acknowledgement = null,
}: {
  cohort?: string | null
  targetedRows?: Array<{ nudge_id: string; target_type?: string; target_label?: string; participant_id?: string | null }>
  nudgeRows?: Array<{ id: string; message: string; author: string; week_of: string }>
  events?: Array<{ id: string; title: string }>
  rsvps?: Array<{ event_id: string }>
  acknowledgement?: { acknowledged_at: string; response_text_encrypted: string; response_due_at: string } | null
}) {
  const participantsMaybeSingle = jest
    .fn()
    .mockResolvedValueOnce({ data: { id: 'EMP123' }, error: null })
    .mockResolvedValueOnce({ data: { cohort }, error: null })

  return {
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
                  data: events,
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
            in: jest.fn(() => ({
              lte: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(async () => ({
                    data: nudgeRows,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        }
      }
      if (table === 'nudge_targets') {
        return {
          select: jest.fn(() => ({
            or: jest.fn(async () => ({
              data: targetedRows,
              error: null,
            })),
            eq: jest.fn(async () => ({
              data: targetedRows,
              error: null,
            })),
          })),
        }
      }
      if (table === 'event_rsvps') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({
              data: rsvps,
              error: null,
            })),
          })),
        }
      }
      if (table === 'nudge_acknowledgements') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: acknowledgement,
                  error: null,
                })),
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
    rpc: jest.fn(async (name: string) => {
      if (name === 'decrypt_nudge_response') {
        return { data: 'Will do', error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    }),
  }
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

    mockCreateServerSupabaseClient.mockReturnValue(createGetRouteMock({
      targetedRows: [{ nudge_id: 'nudge-1', target_type: 'all', target_label: '', participant_id: null }],
      nudgeRows: [{ id: 'nudge-1', message: 'Hydrate', author: 'Coach', week_of: '2026-07-20' }],
      acknowledgement: { acknowledged_at: '2026-07-20T12:00:00Z', response_text_encrypted: 'encrypted-response-data', response_due_at: '2026-07-22T12:00:00Z' },
    }) as never)

    const response = await GET()
    if (!response) throw new Error('Expected response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      events: [{ id: 'evt-1', title: 'Walk Club' }],
      nudge: { id: 'nudge-1', message: 'Hydrate', author: 'Coach', week_of: '2026-07-20' },
      acknowledgement: {
        acknowledged_at: '2026-07-20T12:00:00Z',
        response_text: 'Will do',
        response_due_at: '2026-07-22T12:00:00Z',
      },
      rsvpEventIds: ['evt-1'],
    })
  })

  test('GET returns a nudge targeted to all participants', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    mockCreateServerSupabaseClient.mockReturnValue(createGetRouteMock({
      targetedRows: [{ nudge_id: 'nudge-all', target_type: 'all', target_label: '', participant_id: null }],
      nudgeRows: [{ id: 'nudge-all', message: 'Hydrate', author: 'Coach', week_of: '2026-07-20' }],
      events: [],
      rsvps: [],
    }) as never)

    const response = await GET()
    if (!response) throw new Error('Expected response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.nudge).toEqual({
      id: 'nudge-all',
      message: 'Hydrate',
      author: 'Coach',
      week_of: '2026-07-20',
    })
  })

  test('GET returns a nudge targeted to the specific participant', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    mockCreateServerSupabaseClient.mockReturnValue(createGetRouteMock({
      targetedRows: [{ nudge_id: 'nudge-participant', target_type: 'participant', target_label: '', participant_id: 'EMP123' }],
      nudgeRows: [{ id: 'nudge-participant', message: 'Personal check-in', author: 'Coach', week_of: '2026-07-20' }],
      events: [],
      rsvps: [],
    }) as never)

    const response = await GET()
    if (!response) throw new Error('Expected response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.nudge).toEqual({
      id: 'nudge-participant',
      message: 'Personal check-in',
      author: 'Coach',
      week_of: '2026-07-20',
    })
  })

  test('GET returns a nudge targeted to the participant cohort subgroup', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    mockCreateServerSupabaseClient.mockReturnValue(createGetRouteMock({
      cohort: 'night-shift',
      targetedRows: [{ nudge_id: 'nudge-subgroup', target_type: 'subgroup', target_label: 'night-shift', participant_id: null }],
      nudgeRows: [{ id: 'nudge-subgroup', message: 'Night shift reset', author: 'Coach', week_of: '2026-07-20' }],
      events: [],
      rsvps: [],
    }) as never)

    const response = await GET()
    if (!response) throw new Error('Expected response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.nudge).toEqual({
      id: 'nudge-subgroup',
      message: 'Night shift reset',
      author: 'Coach',
      week_of: '2026-07-20',
    })
  })

  test('GET returns null when no nudge target matches the participant', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    mockCreateServerSupabaseClient.mockReturnValue(createGetRouteMock({
      cohort: 'night-shift',
      targetedRows: [{ nudge_id: 'nudge-other', target_type: 'subgroup', target_label: 'day-shift', participant_id: null }],
      nudgeRows: [{ id: 'nudge-other', message: 'Day shift reminder', author: 'Coach', week_of: '2026-07-20' }],
      events: [],
      rsvps: [],
    }) as never)

    const response = await GET()
    if (!response) throw new Error('Expected response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.nudge).toBeNull()
  })

  test('POST inserts RSVP for participant when going=true', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 'EMP123' }, error: null })
      .mockResolvedValueOnce({ data: { cohort: null }, error: null })
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

    const participantsMaybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 'EMP123' }, error: null })
      .mockResolvedValueOnce({ data: { cohort: null }, error: null })
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

    const participantsMaybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 'EMP123' }, error: null })
      .mockResolvedValueOnce({ data: { cohort: null }, error: null })
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

    const participantsMaybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 'EMP123' }, error: null })
      .mockResolvedValueOnce({ data: { cohort: null }, error: null })
    const rpcUpsert = jest.fn(async (params: unknown) => ({ data: { id: 'ack-1', acknowledged_at: '2026-08-07T12:00:00Z' }, error: null }))

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
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: { id: 'nudge-1', week_of: '2099-08-11' },
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'nudge_targets') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(async () => ({
                data: [{ target_type: 'participant', participant_id: 'EMP123', target_label: '' }],
                error: null,
              })),
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: jest.fn(async (name: string, params: unknown) => {
        if (name === 'upsert_nudge_acknowledgement') {
          rpcUpsert(params)
          return { data: { id: 'ack-1', acknowledged_at: '2026-08-07T12:00:00Z' }, error: null }
        }
        throw new Error(`Unexpected RPC ${name}`)
      }),
    } as never)

    const response = await PATCH(makePatchRequest({ nudgeId: 'nudge-1', responseText: 'Will do' }))
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(200)
    expect(rpcUpsert).toHaveBeenCalledWith({
      p_nudge_id: 'nudge-1',
      p_participant_id: 'EMP123',
      p_response_text: 'Will do',
      p_encryption_key: 'staging-placeholder-key-only-for-demo',
    })
  })

  test('PATCH rejects acknowledgements for untargeted nudges', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const participantsMaybeSingle = jest.fn(async () => ({ data: { id: 'EMP123' }, error: null }))
    const rpcUpsert = jest.fn(async (params: unknown) => ({ data: { id: 'ack-1', acknowledged_at: '2026-07-01T12:00:00Z' }, error: null }))

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
                  data: { id: 'nudge-1', week_of: '2026-07-01' },
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'nudge_targets') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(async () => ({
                data: [{ target_type: 'participant', participant_id: 'EMP999', target_label: '' }],
                error: null,
              })),
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: jest.fn(async (name: string, params: unknown) => {
        if (name === 'upsert_nudge_acknowledgement') {
          rpcUpsert(params)
          return { data: { id: 'ack-1', acknowledged_at: '2026-07-01T12:00:00Z' }, error: null }
        }
        throw new Error(`Unexpected RPC ${name}`)
      }),
    } as never)

    const response = await PATCH(makePatchRequest({ nudgeId: 'nudge-1', responseText: 'Will do' }))
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Nudge not targeted to this participant.' })
    expect(rpcUpsert).not.toHaveBeenCalled()
  })
})
