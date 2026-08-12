import { POST } from './route'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { recomputeActiveChallengeProgress } from '@/lib/challenges/progress'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

jest.mock('@/lib/challenges/access', () => ({
  requireChallengeOperator: jest.fn(),
}))

jest.mock('@/lib/challenges/progress', () => ({
  recomputeActiveChallengeProgress: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

describe('admin challenge recompute route', () => {
  const mockRequireChallengeOperator = requireChallengeOperator as jest.MockedFunction<typeof requireChallengeOperator>
  const mockRecomputeActiveChallengeProgress = recomputeActiveChallengeProgress as jest.MockedFunction<typeof recomputeActiveChallengeProgress>
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateAdminSupabaseClient.mockReturnValue({} as never)
  })

  test('allows cron-authorized requests to trigger scheduled recompute', async () => {
    mockRequireChallengeOperator.mockResolvedValue({ userId: 'vercel-cron', role: 'admin' })
    mockRecomputeActiveChallengeProgress.mockResolvedValue({
      challengeId: 'challenge-1',
      updatedParticipants: 3,
      finalized: false,
    })

    const request = new Request('http://localhost/api/admin/challenges/recompute', {
      method: 'POST',
      headers: {
        authorization: 'Bearer cron-secret',
      },
    })
    const response = await POST(request)
    expect(response).toBeDefined()
    const body = await response!.json()

    expect(mockRequireChallengeOperator).toHaveBeenCalledWith(request)
    expect(mockRecomputeActiveChallengeProgress).toHaveBeenCalledWith({}, { source: 'scheduled_recompute' })
    expect(response!.status).toBe(200)
    expect(body).toEqual({
      active_challenge: 'challenge-1',
      updated_participants: 3,
      finalized: false,
    })
  })

  test('returns auth error when caller is not authorized', async () => {
    mockRequireChallengeOperator.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }) as never,
    } as never)

    const response = await POST(new Request('http://localhost/api/admin/challenges/recompute', { method: 'POST' }))
    expect(response).toBeDefined()

    expect(response!.status).toBe(401)
  })
})
