import { getParticipantRankContext } from '../queries'
import { createClient } from '../client'

jest.mock('../client', () => ({ createClient: jest.fn() }))

function makeSupabaseClient(tables: Record<string, any[]>) {
  return {
    from: jest.fn((table: string) => {
      const rows = [...(tables[table] ?? [])]
      const filters: Array<{ column: string; value: any }> = []
      const orders: Array<{ column: string; ascending: boolean }> = []

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
        limit: jest.fn(() => builder),
        single: jest.fn(async () => ({ data: null, error: null })),
        then: (resolve: (value: { data: any[]; error: null }) => void) => {
          let result = [...rows]
          for (const filter of filters) result = result.filter((row) => row[filter.column] === filter.value)
          for (const order of orders) {
            result.sort((a, b) => {
              if (a[order.column] === b[order.column]) return 0
              return order.ascending ? (a[order.column] < b[order.column] ? -1 : 1) : (a[order.column] < b[order.column] ? 1 : -1)
            })
          }
          return Promise.resolve({ data: result, error: null }).then(resolve)
        },
      }

      return builder
    }),
  }
}

describe('getParticipantRankContext', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('computes privacy-safe percentile context for recovery', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseClient({
      participants: [{ id: 'P1', status: 'Active' }, { id: 'P2', status: 'Active' }, { id: 'P3', status: 'Active' }],
      daily_wellness: [
        { participant_id: 'P1', recovery_score: 80, sleep_consistency: 90 },
        { participant_id: 'P2', recovery_score: 60, sleep_consistency: 70 },
        { participant_id: 'P3', recovery_score: 40, sleep_consistency: 50 },
      ],
      workouts: [],
      habits: [],
      pulse_surveys: [],
    }) as never)

    const context = await getParticipantRankContext('P1', 'recovery')
    expect(context.participant_rank).toBe(1)
    expect(context.cohort_size).toBe(3)
    expect(context.cohort_percentile).toBe(100)
    expect(JSON.stringify(context)).not.toMatch(/P2|P3|first_name|last_name/)
  })

  test('supports workouts logged metric', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseClient({
      participants: [{ id: 'P1', status: 'Active' }, { id: 'P2', status: 'Active' }],
      daily_wellness: [],
      workouts: [{ participant_id: 'P1', strain: 12 }, { participant_id: 'P2', strain: 8 }],
      habits: [],
      pulse_surveys: [],
    }) as never)

    const context = await getParticipantRankContext('P2', 'workouts_logged')
    expect(context.metric).toBe('workouts_logged')
    expect(context.cohort_size).toBe(2)
    expect(context.participant_value).toBe(1)
  })
})
