import { getParticipantRankContext } from '../queries'
import { createAdminSupabaseClient } from '../admin'

jest.mock('../admin', () => ({ createAdminSupabaseClient: jest.fn() }))

function makeSupabaseClient(tables: Record<string, any[]>) {
  return {
    from: jest.fn((table: string) => {
      const rows = [...(tables[table] ?? [])]
      const filters: Array<{ column: string; value: any }> = []
      const orders: Array<{ column: string; ascending: boolean }> = []
      let limitCount: number | null = null

      const runQuery = () => {
        let result = [...rows]
        for (const filter of filters) result = result.filter((row) => row[filter.column] === filter.value)
        for (const order of orders) {
          result.sort((a, b) => {
            if (a[order.column] === b[order.column]) return 0
            return order.ascending ? (a[order.column] < b[order.column] ? -1 : 1) : (a[order.column] < b[order.column] ? 1 : -1)
          })
        }
        if (limitCount !== null) {
          result = result.slice(0, limitCount)
        }
        return result
      }

      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn((column: string, value: any) => {
          filters.push({ column, value })
          return builder
        }),
        or: jest.fn(() => builder),
        order: jest.fn((column: string, options?: { ascending?: boolean }) => {
          orders.push({ column, ascending: options?.ascending !== false })
          return builder
        }),
        limit: jest.fn((count: number) => {
          limitCount = count
          return builder
        }),
        single: jest.fn(async () => ({ data: runQuery()[0] ?? null, error: null })),
        then: (resolve: (value: { data: any[]; error: null }) => void) => {
          return Promise.resolve({ data: runQuery(), error: null }).then(resolve)
        },
      }

      return builder
    }),
  }
}

describe('getParticipantRankContext', () => {
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('computes privacy-safe percentile context for recovery using the auth user mapping', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue(makeSupabaseClient({
      participants: [
        { id: 'P1', auth_user_id: 'user-1', status: 'Active' },
        { id: 'P2', auth_user_id: 'user-2', status: 'Active' },
        { id: 'P3', auth_user_id: 'user-3', status: 'Active' },
      ],
      daily_wellness: [
        { participant_id: 'P1', recovery_score: 80, sleep_consistency: 90 },
        { participant_id: 'P2', recovery_score: 60, sleep_consistency: 70 },
        { participant_id: 'P3', recovery_score: 40, sleep_consistency: 50 },
      ],
      workouts: [],
      habits: [],
      pulse_surveys: [],
    }) as never)

    const context = await getParticipantRankContext('user-1', 'recovery')
    expect(context.participant_rank).toBe(1)
    expect(context.cohort_size).toBe(3)
    expect(context.cohort_percentile).toBe(100)
    expect(context.comparison_text).toBe('Ahead of 2 participants, behind 0.')
    expect(JSON.stringify(context)).not.toMatch(/P2|P3|first_name|last_name/)
  })

  test('counts workouts and ties without using participant IDs as a tie-breaker', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue(makeSupabaseClient({
      participants: [
        { id: 'P1', auth_user_id: 'user-1', status: 'Active' },
        { id: 'P2', auth_user_id: 'user-2', status: 'Active' },
        { id: 'P3', auth_user_id: 'user-3', status: 'Active' },
      ],
      daily_wellness: [],
      workouts: [
        { participant_id: 'P1', strain: 12 },
        { participant_id: 'P2', strain: 8 },
        { participant_id: 'P2', strain: 10 },
        { participant_id: 'P3', strain: 6 },
        { participant_id: 'P3', strain: 9 },
      ],
      habits: [],
      pulse_surveys: [],
    }) as never)

    const context = await getParticipantRankContext('user-2', 'workouts_logged')
    expect(context.metric).toBe('workouts_logged')
    expect(context.cohort_size).toBe(3)
    expect(context.participant_value).toBe(2)
    expect(context.participant_rank).toBe(1)
    expect(context.rank_context).toEqual({ ahead: 1, behind: 0 })
  })

  test('preserves the latest habit row when computing points and relabels sleep consistency', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue(makeSupabaseClient({
      participants: [
        { id: 'P1', auth_user_id: 'user-1', status: 'Active' },
        { id: 'P2', auth_user_id: 'user-2', status: 'Active' },
      ],
      daily_wellness: [
        { participant_id: 'P1', recovery_score: 10, sleep_consistency: 82 },
        { participant_id: 'P2', recovery_score: 5, sleep_consistency: 60 },
      ],
      workouts: [
        { participant_id: 'P1', strain: 4 },
        { participant_id: 'P2', strain: 1 },
      ],
      habits: [
        { participant_id: 'P1', hydrated: true, date: '2026-08-07' },
        { participant_id: 'P1', hydrated: false, date: '2026-08-06' },
        { participant_id: 'P2', hydrated: false, date: '2026-08-07' },
      ],
      pulse_surveys: [
        { participant_id: 'P1', energy_level: 2, date: '2026-08-07' },
        { participant_id: 'P2', energy_level: 1, date: '2026-08-07' },
      ],
    }) as never)

    const pointsContext = await getParticipantRankContext('user-1', 'points_earned')
    expect(pointsContext.participant_value).toBe(29)

    const consistencyContext = await getParticipantRankContext('user-1', 'consistency_streak')
    expect(consistencyContext.metric_label).toBe('Sleep consistency')
    expect(consistencyContext.metric_value_label).toBe('82')
  })

  test('rejects unknown auth users instead of falling back to another participant', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue(makeSupabaseClient({
      participants: [{ id: 'P1', auth_user_id: 'user-1', status: 'Active' }],
      daily_wellness: [],
      workouts: [],
      habits: [],
      pulse_surveys: [],
    }) as never)

    await expect(getParticipantRankContext('missing-user', 'recovery')).rejects.toMatchObject({
      message: 'Participant not found.',
      status: 404,
    })
  })
})
