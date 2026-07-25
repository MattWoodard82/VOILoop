import { POST } from '../route'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

function makeJsonRequest(body: unknown) {
  return new Request('http://localhost/api/pulse/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/pulse/submit', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)

    const response = await POST(makeJsonRequest({ wellbeing_score: 8 }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  test('returns 403 when authenticated user is not a participant', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const response = await POST(makeJsonRequest({ wellbeing_score: 8 }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })

  test('returns 400 for schema-mismatched payload fields', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const response = await POST(makeJsonRequest({ psychological_safety: 8 }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unexpected field: psychological_safety',
    })
  })

  test('returns 403 when participant record is not linked', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-3' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    } as never)

    const response = await POST(makeJsonRequest({ wellbeing_score: 7 }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Participant profile not linked to this account.',
    })
  })

  test('upserts canonical pulse schema for the authenticated participant', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-4' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const upsert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: 'EMP777' }, error: null })),
              })),
            })),
          }
        }

        if (table === 'pulse_surveys') {
          return { upsert }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    } as never)

    const response = await POST(makeJsonRequest({
      wellbeing_score: 8,
      burnout_score: 3,
      manager_support: 7,
      energy_score: 6,
      psych_safety: 9,
      workload_score: 5,
      work_life_balance: 8,
      recommend_score: 9,
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      participant_id: 'EMP777',
      wellbeing_score: 8,
      burnout_score: 3,
      manager_support: 7,
      energy_score: 6,
      psych_safety: 9,
      workload_score: 5,
      work_life_balance: 8,
      recommend_score: 9,
    }), { onConflict: 'participant_id,date' })
  })
})
