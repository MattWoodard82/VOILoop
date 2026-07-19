import { GET } from '../route'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

jest.mock('@/lib/feature-flags', () => ({
  isPilotChallengesBasicEnabled: jest.fn(),
}))

describe('GET /api/participant/challenge', () => {
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>
  const mockIsPilotChallengesBasicEnabled = isPilotChallengesBasicEnabled as jest.MockedFunction<typeof isPilotChallengesBasicEnabled>

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsPilotChallengesBasicEnabled.mockReturnValue(true)
  })

  test('returns 403 for non-participant users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'auth-user-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false })

    const response = await GET()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })

  test('returns participant challenge state for participant users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'auth-user-2' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: 'EMP001' }, error: null })),
              })),
            })),
          }
        }

        if (table === 'challenges') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: {
                    id: 'challenge-1',
                    name: 'Steps Challenge',
                    description: 'Walk more',
                    status: 'active',
                    threshold_value: 10000,
                    window_start_at: '2026-07-01T00:00:00.000Z',
                    window_end_at: '2026-07-31T23:59:59.000Z',
                    eligibility_mode: 'all',
                    updated_at: '2026-07-19T00:00:00.000Z',
                  },
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'challenge_participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: {
                      is_eligible: true,
                      eligibility_reason: null,
                      progress_value: 4200,
                      completed: false,
                      completed_at: null,
                      updated_at: '2026-07-19T01:00:00.000Z',
                    },
                    error: null,
                  })),
                })),
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
    expect(body).toMatchObject({
      visibility_state: 'eligible',
      challenge: {
        id: 'challenge-1',
        name: 'Steps Challenge',
        status: 'active',
        progress_value: 4200,
        completed: false,
      },
    })
  })
})
