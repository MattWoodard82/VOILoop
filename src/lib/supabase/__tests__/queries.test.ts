import { getLatestWorkouts } from '../queries'
import { createClient } from '../client'

jest.mock('../client', () => ({
  createClient: jest.fn(),
}))

type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null }

function makeSupabaseClient<T>(resultForStartTime: QueryResult<T>, fallbackResult: QueryResult<T>) {
  const from = jest.fn(() => {
    let sortsStartTime = false

    const builder: any = {
      select: jest.fn(() => builder),
      order: jest.fn((column: string) => {
        if (column === 'start_time') sortsStartTime = true
        return builder
      }),
      eq: jest.fn(() => builder),
      then: (resolve: (value: QueryResult<T>) => void, reject: (reason: unknown) => void) => {
        const result = sortsStartTime ? resultForStartTime : fallbackResult
        return Promise.resolve(result).then(resolve, reject)
      },
    }

    return builder
  })

  return { from }
}

describe('getLatestWorkouts', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('orders by start_time when the column exists', async () => {
    const rows = [{ id: '1', employee_id: 'E1', date: '2024-01-15', start_time: '2024-01-15T08:00:00Z' }]
    mockCreateClient.mockReturnValue(makeSupabaseClient({ data: rows, error: null }, { data: [], error: null }) as never)

    await expect(getLatestWorkouts()).resolves.toEqual(rows)
  })

  test('falls back to date-only ordering when start_time is missing', async () => {
    const rows = [{ id: '1', employee_id: 'E1', date: '2024-01-15', start_time: '2024-01-15T08:00:00Z' }]
    mockCreateClient.mockReturnValue(
      makeSupabaseClient(
        {
          data: null,
          error: { code: 'PGRST204', message: "Could not find the 'start_time' column of 'workouts' in the schema cache" },
        },
        { data: rows, error: null }
      ) as never
    )

    await expect(getLatestWorkouts()).resolves.toEqual(rows)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })

  test('surfaces non-column errors', async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseClient(
        {
          data: null,
          error: { code: '42P01', message: 'relation "workouts" does not exist' },
        },
        { data: [], error: null }
      ) as never
    )

    await expect(getLatestWorkouts()).rejects.toMatchObject({ code: '42P01' })
  })
})
