import { GET as getAdminEvents, POST as postAdminEvents } from '@/app/api/admin/events/route'
import { PATCH as patchIntervention } from '@/app/api/interventions/[id]/route'
import { GET as getParticipantEvents } from '@/app/api/participant/events/route'
import { createServerSupabaseClient, getSession, getUserAccess, requireLeadership } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
  requireLeadership: jest.fn(),
}))

describe('role access e2e (route-level)', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>
  const mockRequireLeadership = requireLeadership as jest.MockedFunction<typeof requireLeadership>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('unauthenticated users are blocked from participant route', async () => {
    mockGetSession.mockResolvedValue(null)

    const response = await getParticipantEvents()
    if (!response) throw new Error('Expected response')

    expect(response.status).toBe(401)
  })

  test('participants can read participant events but cannot access admin or intervention mutation', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'participant-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })
    mockRequireLeadership.mockResolvedValue({ redirect: '/my' } as never)

    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: 'EMP100' }, error: null })),
              })),
            })),
          }
        }
        if (table === 'events') {
          return {
            select: jest.fn(() => ({
              gte: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(async () => ({ data: [], error: null })),
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
                    limit: jest.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'nudge_targets') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(async () => ({ data: [], error: null })),
            })),
          }
        }
        if (table === 'nudge_acknowledgements') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          }
        }
        if (table === 'event_rsvps') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(async () => ({ data: [], error: null })),
            })),
          }
        }
        if (table === 'interventions') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { date_actioned: null }, error: null })),
              })),
            })),
            update: jest.fn(() => ({
              eq: jest.fn(async () => ({ error: null })),
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const participantResponse = await getParticipantEvents()
    if (!participantResponse) throw new Error('Expected participant response')
    expect(participantResponse.status).toBe(200)

    const adminResponse = await getAdminEvents()
    expect(adminResponse.status).toBe(403)

    const interventionResponse = await patchIntervention(
      new Request('http://localhost/api/interventions/int-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Pending' }),
      }),
      { params: { id: 'int-1' } }
    )
    expect(interventionResponse.status).toBe(403)
  })

  test('wellness directors can update interventions and access events mutations', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false })
    mockRequireLeadership.mockResolvedValue({ session: { user: { id: 'wd-1' } }, role: 'wellness_director' } as never)

    const update = jest.fn(() => ({
      eq: jest.fn(async () => ({ error: null })),
    }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'interventions') return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: { date_actioned: null }, error: null })),
            })),
          })),
          update,
        }
        if (table === 'events') return { insert: jest.fn(async () => ({ error: null })) }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const interventionResponse = await patchIntervention(
      new Request('http://localhost/api/interventions/int-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Monitoring' }),
      }),
      { params: { id: 'int-2' } }
    )
    expect(interventionResponse.status).toBe(200)

    const adminPostResponse = await postAdminEvents(new Request('http://localhost/api/admin/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Event', event_date: '2026-08-01', event_type: 'general' }),
    }))
    expect(adminPostResponse.status).toBe(200)
  })

  test('wellness directors are still blocked from participant-only events route after leadership route move', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-2' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false })

    const response = await getParticipantEvents()
    if (!response) throw new Error('Expected participant route response')

    expect(response.status).toBe(403)
  })

  test('admins can access admin mutations but are blocked from participant-only route', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })
    mockRequireLeadership.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)

    const insert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'events') return { insert }
        if (table === 'weekly_nudges') {
          return {
            upsert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(async () => ({ data: { id: 'nudge-1' }, error: null })),
              })),
            })),
          }
        }
        if (table === 'nudge_targets') return { upsert: jest.fn(async () => ({ error: null })) }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const adminPostResponse = await postAdminEvents(new Request('http://localhost/api/admin/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Admin Event', event_date: '2026-08-01', event_type: 'general' }),
    }))
    expect(adminPostResponse.status).toBe(200)
    expect(insert).toHaveBeenCalled()

    const participantRouteResponse = await getParticipantEvents()
    if (!participantRouteResponse) throw new Error('Expected participant route response')
    expect(participantRouteResponse.status).toBe(403)
  })
})
