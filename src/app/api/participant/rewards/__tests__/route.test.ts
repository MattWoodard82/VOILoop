import { GET } from '../route'
import { createServerSupabaseClient, getRoleAndSession } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: jest.fn(), getRoleAndSession: jest.fn() }))

describe('GET /api/participant/rewards', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockGetRoleAndSession = getRoleAndSession as jest.MockedFunction<typeof getRoleAndSession>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns participant rewards and rules when enabled', async () => {
    mockGetRoleAndSession.mockResolvedValue({ session: { user: { id: 'auth-user-2' } }, role: 'participant', mustChangePassword: false } as never)

    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: 'EMP001', auth_user_id: 'auth-user-2' }, error: null })),
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
                    name: 'Rewards Challenge',
                    status: 'active',
                    threshold_value: 5,
                    window_start_at: '2026-08-01T00:00:00.000Z',
                    window_end_at: '2026-08-31T23:59:59.000Z',
                    updated_at: '2026-08-01T00:00:00.000Z',
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
                      progress_value: 4,
                      completed: false,
                      completed_at: null,
                      updated_at: '2026-08-01T01:00:00.000Z',
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
      rewards: {
        challenge: { id: 'challenge-1', status: 'active' },
        participant: { progress_value: 4 },
        redemption_state: 'submitted',
      },
      rules: { cap_text: 'Weekly point caps are enforced by the active rewards policy. Check with your operator for the current weekly cap and bonus tiers for this pilot rollout.' },
    })
  })

  test('returns 401 when unauthenticated', async () => {
    mockGetRoleAndSession.mockResolvedValue({ session: null, role: null, mustChangePassword: false } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  test('returns 403 when role is not participant', async () => {
    mockGetRoleAndSession.mockResolvedValue({ session: { user: { id: 'auth-user-3' } }, role: 'admin', mustChangePassword: false } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Forbidden' })
  })
})
