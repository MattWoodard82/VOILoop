import { getLatestWellness, getLatestWorkouts, getParticipantImportBatches, getTeamDashboard } from '../queries'
import { createClient } from '../client'
import { createServerSupabaseClient } from '../server'

jest.mock('../client', () => ({
  createClient: jest.fn(),
}))

jest.mock('../server', () => ({
  createServerSupabaseClient: jest.fn(() => {
    throw new Error('Server client unavailable in unit test')
  }),
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

function makeTableClient(tables: Record<string, any[]>) {
  const from = jest.fn((table: string) => {
    const rows = [...(tables[table] ?? [])]
    const filters: Array<{ kind: 'eq' | 'in'; column: string; value: any }> = []
    const orders: Array<{ column: string; ascending: boolean }> = []
    let limitCount: number | null = null

    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn((column: string, value: any) => {
        filters.push({ kind: 'eq', column, value })
        return builder
      }),
      in: jest.fn((column: string, value: any[]) => {
        filters.push({ kind: 'in', column, value })
        return builder
      }),
      order: jest.fn((column: string, options?: { ascending?: boolean }) => {
        orders.push({ column, ascending: options?.ascending !== false })
        return builder
      }),
      limit: jest.fn((count: number) => {
        limitCount = count
        return builder
      }),
      single: jest.fn(async () => {
        const resultRows = runQuery(rows, filters, orders, limitCount)
        return { data: resultRows[0] ?? null, error: null }
      }),
      then: (resolve: (value: QueryResult<any[]>) => void, reject: (reason: unknown) => void) => {
        const resultRows = runQuery(rows, filters, orders, limitCount)
        return Promise.resolve({ data: resultRows, error: null }).then(resolve, reject)
      },
    }

    return builder
  })

  return { from }
}

function runQuery(
  rows: any[],
  filters: Array<{ kind: 'eq' | 'in'; column: string; value: any }>,
  orders: Array<{ column: string; ascending: boolean }>,
  limitCount: number | null
) {
  let result = [...rows]

  for (const filter of filters) {
    if (filter.kind === 'eq') {
      result = result.filter((row) => row[filter.column] === filter.value)
      continue
    }
    result = result.filter((row) => filter.value.includes(row[filter.column]))
  }

  if (orders.length > 0) {
    result.sort((left, right) => {
      for (const order of orders) {
        const a = left[order.column]
        const b = right[order.column]
        if (a === b) continue
        if (a == null) return order.ascending ? -1 : 1
        if (b == null) return order.ascending ? 1 : -1
        if (a < b) return order.ascending ? -1 : 1
        return order.ascending ? 1 : -1
      }
      return 0
    })
  }

  if (limitCount !== null) {
    result = result.slice(0, limitCount)
  }

  return result
}

describe('getLatestWorkouts', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('orders by start_time when the column exists', async () => {
    const rows = [{ id: '1', participant_id: 'E1', date: '2024-01-15', start_time: '2024-01-15T08:00:00Z' }]
    mockCreateClient.mockReturnValue(makeSupabaseClient({ data: rows, error: null }, { data: [], error: null }) as never)

    await expect(getLatestWorkouts()).resolves.toEqual(rows)
  })

  test('falls back to date-only ordering when start_time is missing', async () => {
    const rows = [{ id: '1', participant_id: 'E1', date: '2024-01-15', start_time: '2024-01-15T08:00:00Z' }]
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

describe('getLatestWellness', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>

  const wellnessRows = [
    { id: 'w-1', participant_id: 'P1', date: '2024-06-06', recovery_score: 83, hrv_ms: 72, sleep_perf: 91, sleep_debt: 0 },
    { id: 'w-2', participant_id: 'P1', date: '2024-06-05', recovery_score: 68, hrv_ms: 68, sleep_perf: 85, sleep_debt: 0 },
    { id: 'w-3', participant_id: 'P2', date: '2024-06-05', recovery_score: 41, hrv_ms: 49, sleep_perf: 70, sleep_debt: 1 },
    { id: 'w-4', participant_id: 'P2', date: '2024-06-04', recovery_score: 36, hrv_ms: 46, sleep_perf: 65, sleep_debt: 1 },
    { id: 'w-5', participant_id: 'P3', date: '2024-06-07', recovery_score: 95, hrv_ms: 80, sleep_perf: 94, sleep_debt: 0 },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateServerSupabaseClient.mockImplementation(() => {
      throw new Error('Server client unavailable in unit test')
    })
  })

  test('returns latest record per participant when date is omitted', async () => {
    mockCreateClient.mockReturnValue(makeTableClient({ daily_wellness: wellnessRows }) as never)

    await expect(getLatestWellness(undefined, ['P1', 'P2', 'P3'])).resolves.toEqual([
      wellnessRows[0],
      wellnessRows[2],
      wellnessRows[4],
    ])
  })

  test('returns all records for an explicit date filter', async () => {
    mockCreateClient.mockReturnValue(makeTableClient({ daily_wellness: wellnessRows }) as never)

    await expect(getLatestWellness('2024-06-05')).resolves.toEqual([
      wellnessRows[1],
      wellnessRows[2],
    ])
  })

  test('returns explicit-date rows in deterministic participant order', async () => {
    mockCreateClient.mockReturnValue(
      makeTableClient({
        daily_wellness: [
          { id: 'w-10', participant_id: 'P2', date: '2024-06-12', recovery_score: 45, hrv_ms: 50, sleep_perf: 71, sleep_debt: 1 },
          { id: 'w-11', participant_id: 'P1', date: '2024-06-12', recovery_score: 70, hrv_ms: 66, sleep_perf: 88, sleep_debt: 0 },
        ],
      }) as never
    )

    await expect(getLatestWellness('2024-06-12')).resolves.toEqual([
      { id: 'w-11', participant_id: 'P1', date: '2024-06-12', recovery_score: 70, hrv_ms: 66, sleep_perf: 88, sleep_debt: 0 },
      { id: 'w-10', participant_id: 'P2', date: '2024-06-12', recovery_score: 45, hrv_ms: 50, sleep_perf: 71, sleep_debt: 1 },
    ])
  })
})

describe('getParticipantImportBatches', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateServerSupabaseClient.mockImplementation(() => {
      throw new Error('Server client unavailable in unit test')
    })
  })

  test('returns recent batches for a participant only', async () => {
    mockCreateClient.mockReturnValue(
      makeTableClient({
        upload_batches: [
          { id: 'batch-1', participant_id: 'P1', imported_by: 'admin-1', started_at: '2026-07-02T10:00:00Z' },
          { id: 'batch-2', participant_id: 'P2', imported_by: 'admin-1', started_at: '2026-07-03T10:00:00Z' },
          { id: 'batch-3', participant_id: 'P1', imported_by: 'admin-2', started_at: '2026-07-04T10:00:00Z' },
        ],
      }) as never
    )

    await expect(getParticipantImportBatches('P1', 5)).resolves.toEqual([
      { id: 'batch-3', participant_id: 'P1', imported_by: 'admin-2', started_at: '2026-07-04T10:00:00Z' },
      { id: 'batch-1', participant_id: 'P1', imported_by: 'admin-1', started_at: '2026-07-02T10:00:00Z' },
    ])
  })

  test('applies the requested limit after ordering newest first', async () => {
    mockCreateClient.mockReturnValue(
      makeTableClient({
        upload_batches: [
          { id: 'batch-1', participant_id: 'P1', started_at: '2026-07-02T10:00:00Z' },
          { id: 'batch-2', participant_id: 'P1', started_at: '2026-07-03T10:00:00Z' },
          { id: 'batch-3', participant_id: 'P1', started_at: '2026-07-04T10:00:00Z' },
        ],
      }) as never
    )

    await expect(getParticipantImportBatches('P1', 2)).resolves.toEqual([
      { id: 'batch-3', participant_id: 'P1', started_at: '2026-07-04T10:00:00Z' },
      { id: 'batch-2', participant_id: 'P1', started_at: '2026-07-03T10:00:00Z' },
    ])
  })
})

describe('getTeamDashboard', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateServerSupabaseClient.mockImplementation(() => {
      throw new Error('Server client unavailable in unit test')
    })
  })

  test('uses each participant latest wellness row when calculating stats', async () => {
    const participants = [
      {
        id: 'P1',
        first_name: 'Alice',
        last_name: 'Able',
        department: 'Ops',
        location_id: null,
        employment_type: null,
        title: 'Nurse',
        device_id: null,
        consent: true,
        enrolled_date: null,
        status: 'Active',
        is_exact_data: false,
      },
      {
        id: 'P2',
        first_name: 'Bob',
        last_name: 'Baker',
        department: 'Ops',
        location_id: null,
        employment_type: null,
        title: 'Tech',
        device_id: null,
        consent: true,
        enrolled_date: null,
        status: 'Active',
        is_exact_data: false,
      },
    ]

    const dailyWellness = [
      { id: 'w1', participant_id: 'P1', date: '2024-06-08', recovery_score: 80, hrv_ms: 70, sleep_perf: 90, sleep_debt: 0 },
      { id: 'w2', participant_id: 'P1', date: '2024-06-07', recovery_score: 74, hrv_ms: 68, sleep_perf: 87, sleep_debt: 0 },
      { id: 'w3', participant_id: 'P2', date: '2024-06-07', recovery_score: 40, hrv_ms: 50, sleep_perf: 60, sleep_debt: 0 },
      { id: 'w4', participant_id: 'P3', date: '2024-06-09', recovery_score: 99, hrv_ms: 90, sleep_perf: 98, sleep_debt: 0 },
    ]

    const pulseSurveys = [
      { id: 'pulse1', participant_id: 'P1', date: '2024-06-08', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: ['fitness_center'], mental_wellbeing: 5, program_supported: 'yes', whoop_reviewed: 'yes_regularly', health_flag: null },
      { id: 'pulse2', participant_id: 'P2', date: '2024-06-08', confident_health: true, body_trending_good: false, energy_level: 3, rest_quality: 3, stress_level: 3, physical_activity: ['outside'], mental_wellbeing: 3, program_supported: 'neutral', whoop_reviewed: 'yes_once', health_flag: null },
      { id: 'pulse-old', participant_id: 'P1', date: '2024-06-07', confident_health: false, body_trending_good: false, energy_level: 2, rest_quality: 2, stress_level: 4, physical_activity: ['none'], mental_wellbeing: 2, program_supported: 'no', whoop_reviewed: 'no', health_flag: null },
    ]

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        daily_wellness: dailyWellness,
        workouts: [],
        habits: [],
        pulse_surveys: pulseSurveys,
        interventions: [],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    const participantById = Object.fromEntries(dashboard.participants.map((participant) => [participant.id, participant]))

    expect(participantById.P1.latest_wellness?.date).toBe('2024-06-08')
    expect(participantById.P2.latest_wellness?.date).toBe('2024-06-07')
    expect(dashboard.stats.avg_recovery).toBe(60)
    expect(dashboard.stats.avg_hrv).toBe(60)
    expect(dashboard.stats.avg_sleep_perf).toBe(75)
    expect(dashboard.stats.total_participants).toBe(2)
    expect(dashboard.stats.participation_rate).toBe(100)
  })

  test('keeps the newest wellness row even when its day strain is missing', async () => {
    const participants = [
      {
        id: 'P1',
        first_name: 'Alice',
        last_name: 'Able',
        department: 'Ops',
        location_id: null,
        employment_type: null,
        title: 'Nurse',
        device_id: null,
        consent: true,
        enrolled_date: null,
        status: 'Active',
        is_exact_data: false,
      },
    ]

    const dailyWellness = [
      { id: 'w1', participant_id: 'P1', date: '2024-06-08', recovery_score: 80, hrv_ms: 70, sleep_perf: 90, sleep_debt: 0, day_strain: null },
      { id: 'w2', participant_id: 'P1', date: '2024-06-07', recovery_score: 74, hrv_ms: 68, sleep_perf: 87, sleep_debt: 0, day_strain: 12.4 },
    ]

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        daily_wellness: dailyWellness,
        workouts: [],
        habits: [],
        pulse_surveys: [],
        interventions: [],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    expect(dashboard.participants[0].latest_wellness?.date).toBe('2024-06-08')
    expect(dashboard.participants[0].latest_wellness?.day_strain).toBeNull()
  })
})
