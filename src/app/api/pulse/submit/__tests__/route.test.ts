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

    const response = await POST(makeJsonRequest({ wellbeing_score: 8 }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unexpected field: wellbeing_score',
    })
  })

  test('returns 400 when physical_activity is an empty array and no other answers are provided', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    const response = await POST(makeJsonRequest({ physical_activity: [] }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'At least one pulse response is required.',
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

    const response = await POST(makeJsonRequest({ energy_level: 4 }))

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
      confident_health: true,
      body_trending_good: false,
      energy_level: 4,
      rest_quality: 3,
      stress_level: 2,
      physical_activity: ['fitness_center', 'outside'],
      mental_wellbeing: 5,
      program_supported: 'yes',
      whoop_reviewed: 'yes_regularly',
      health_flag: 'Feeling a bit tired mid-week.',
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      participant_id: 'EMP777',
      confident_health: true,
      body_trending_good: false,
      energy_level: 4,
      rest_quality: 3,
      stress_level: 2,
      physical_activity: ['fitness_center', 'outside'],
      mental_wellbeing: 5,
      program_supported: 'yes',
      whoop_reviewed: 'yes_regularly',
      health_flag: 'Feeling a bit tired mid-week.',
    }), { onConflict: 'participant_id,date' })
  })
})
