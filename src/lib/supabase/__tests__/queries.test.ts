import {
  getCurrentWeekPulse,
  getLatestWellness,
  getLatestWorkouts,
  getParticipantImportBatches,
  getRecentlyResolvedInterventions,
  getTeamDashboard,
  getTeamHealthScoreConfig,
  getWorkoutHistoryForParticipants,
  getTeamHealthScore,
  getNudgeHistoryForParticipant,
  getWeeklyResponseRate,
} from '../queries'
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
    const filters: Array<
      | { kind: 'eq' | 'in'; column: string; value: any }
      | { kind: 'or-not-null'; columns: string[] }
      | { kind: 'gte' | 'lte'; column: string; value: any }
    > = []
    const orders: Array<{ column: string; ascending: boolean }> = []
    let limitCount: number | null = null
    let rangeBounds: { from: number; to: number } | null = null

    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn((column: string, value: any) => {
        filters.push({ kind: 'eq', column, value })
        return builder
      }),
      is: jest.fn((column: string, value: any) => {
        filters.push({ kind: 'eq', column, value })
        return builder
      }),
      in: jest.fn((column: string, value: any[]) => {
        filters.push({ kind: 'in', column, value })
        return builder
      }),
      gte: jest.fn((column: string, value: any) => {
        filters.push({ kind: 'gte', column, value })
        return builder
      }),
      lte: jest.fn((column: string, value: any) => {
        filters.push({ kind: 'lte', column, value })
        return builder
      }),
      or: jest.fn((expression: string) => {
        const columns = expression
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => part.replace(/\.not\.is\.null$/, ''))
        filters.push({ kind: 'or-not-null', columns })
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
      range: jest.fn((from: number, to: number) => {
        rangeBounds = { from, to }
        return builder
      }),
      single: jest.fn(async () => {
        const resultRows = runQuery(rows, filters, orders, limitCount)
        return { data: resultRows[0] ?? null, error: null }
      }),
      maybeSingle: jest.fn(async () => {
        const resultRows = runQuery(rows, filters, orders, limitCount)
        return { data: resultRows[0] ?? null, error: null }
      }),
      then: (resolve: (value: QueryResult<any[]>) => void, reject: (reason: unknown) => void) => {
        let resultRows = runQuery(rows, filters, orders, limitCount)
        if (rangeBounds) {
          resultRows = resultRows.slice(rangeBounds.from, rangeBounds.to + 1)
        }
        return Promise.resolve({ data: resultRows, error: null }).then(resolve, reject)
      },
    }

    return builder
  })

  return { from }
}

function runQuery(
  rows: any[],
  filters: Array<
    | { kind: 'eq' | 'in'; column: string; value: any }
    | { kind: 'or-not-null'; columns: string[] }
    | { kind: 'gte' | 'lte'; column: string; value: any }
  >,
  orders: Array<{ column: string; ascending: boolean }>,
  limitCount: number | null
) {
  let result = [...rows]

  for (const filter of filters) {
    if (filter.kind === 'or-not-null') {
      result = result.filter((row) => filter.columns.some((column) => row[column] !== null && row[column] !== undefined))
      continue
    }
    if (filter.kind === 'eq') {
      result = result.filter((row) => row[filter.column] === filter.value)
      continue
    }
    if (filter.kind === 'gte') {
      result = result.filter((row) => row[filter.column] !== null && row[filter.column] !== undefined && row[filter.column] >= filter.value)
      continue
    }
    if (filter.kind === 'lte') {
      result = result.filter((row) => row[filter.column] !== null && row[filter.column] !== undefined && row[filter.column] <= filter.value)
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

  test('prefers the latest row with metrics when the newest row is an empty placeholder', async () => {
    mockCreateClient.mockReturnValue(
      makeTableClient({
        daily_wellness: [
          { id: 'w-empty', participant_id: 'P1', date: '2024-06-07', recovery_score: null, hrv_ms: null, sleep_perf: null, sleep_debt: null, day_strain: null },
          wellnessRows[0],
          wellnessRows[2],
        ],
      }) as never
    )

    await expect(getLatestWellness(undefined, ['P1', 'P2'])).resolves.toEqual([
      wellnessRows[0],
      wellnessRows[2],
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

describe('getRecentlyResolvedInterventions', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateServerSupabaseClient.mockImplementation(() => {
      throw new Error('Server client unavailable in unit test')
    })
  })

  test('returns only resolved rows ordered by date_resolved descending', async () => {
    mockCreateClient.mockReturnValue(
      makeTableClient({
        interventions: [
          { id: 'resolved-older', participant_id: 'P1', outcome: 'Resolved', date_resolved: '2026-06-01', date_triggered: '2026-07-10' },
          { id: 'resolved-newer', participant_id: 'P2', outcome: 'Resolved', date_resolved: '2026-07-15', date_triggered: '2026-05-01' },
          { id: 'monitoring-1', participant_id: 'P3', outcome: 'Monitoring', date_resolved: '2026-08-01', date_triggered: '2026-08-01' },
        ],
      }) as never
    )

    await expect(getRecentlyResolvedInterventions()).resolves.toEqual([
      { id: 'resolved-newer', participant_id: 'P2', outcome: 'Resolved', date_resolved: '2026-07-15', date_triggered: '2026-05-01' },
      { id: 'resolved-older', participant_id: 'P1', outcome: 'Resolved', date_resolved: '2026-06-01', date_triggered: '2026-07-10' },
    ])
  })

  test('applies the requested limit after resolution-date ordering', async () => {
    mockCreateClient.mockReturnValue(
      makeTableClient({
        interventions: [
          { id: 'resolved-1', participant_id: 'P1', outcome: 'Resolved', date_resolved: '2026-07-03' },
          { id: 'resolved-2', participant_id: 'P2', outcome: 'Resolved', date_resolved: '2026-07-02' },
          { id: 'resolved-3', participant_id: 'P3', outcome: 'Resolved', date_resolved: '2026-07-01' },
        ],
      }) as never
    )

    await expect(getRecentlyResolvedInterventions(2)).resolves.toEqual([
      { id: 'resolved-1', participant_id: 'P1', outcome: 'Resolved', date_resolved: '2026-07-03' },
      { id: 'resolved-2', participant_id: 'P2', outcome: 'Resolved', date_resolved: '2026-07-02' },
    ])
  })

  test('drops resolved rows with missing date_resolved so the section stays explicitly date-driven', async () => {
    mockCreateClient.mockReturnValue(
      makeTableClient({
        interventions: [
          { id: 'resolved-missing-date', participant_id: 'P1', outcome: 'Resolved', date_resolved: null, date_triggered: '2026-07-05' },
          { id: 'resolved-dated', participant_id: 'P2', outcome: 'Resolved', date_resolved: '2026-07-04', date_triggered: '2026-06-01' },
        ],
      }) as never
    )

    await expect(getRecentlyResolvedInterventions()).resolves.toEqual([
      { id: 'resolved-dated', participant_id: 'P2', outcome: 'Resolved', date_resolved: '2026-07-04', date_triggered: '2026-06-01' },
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
        engagement_score_weights: [
          { weight_name: 'login_frequency_weight', weight_value: 25, organization_id: null },
          { weight_name: 'pulse_survey_completion_weight', weight_value: 20, organization_id: null },
          { weight_name: 'data_submission_weight', weight_value: 25, organization_id: null },
          { weight_name: 'intervention_follow_up_weight', weight_value: 15, organization_id: null },
          { weight_name: 'trend_consistency_weight', weight_value: 15, organization_id: null },
        ],
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
        engagement_score_weights: [
          { weight_name: 'login_frequency_weight', weight_value: 25, organization_id: null },
          { weight_name: 'pulse_survey_completion_weight', weight_value: 20, organization_id: null },
          { weight_name: 'data_submission_weight', weight_value: 25, organization_id: null },
          { weight_name: 'intervention_follow_up_weight', weight_value: 15, organization_id: null },
          { weight_name: 'trend_consistency_weight', weight_value: 15, organization_id: null },
        ],
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

  test('falls back to the latest meaningful wellness row when a newer placeholder row is empty', async () => {
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
      { id: 'w-empty', participant_id: 'P1', date: '2024-06-09', recovery_score: null, hrv_ms: null, sleep_perf: null, sleep_debt: null, day_strain: null },
      { id: 'w1', participant_id: 'P1', date: '2024-06-08', recovery_score: 80, hrv_ms: 70, sleep_perf: 90, sleep_debt: 0, day_strain: 12.4 },
    ]

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        engagement_score_weights: [
          { weight_name: 'login_frequency_weight', weight_value: 25, organization_id: null },
          { weight_name: 'pulse_survey_completion_weight', weight_value: 20, organization_id: null },
          { weight_name: 'data_submission_weight', weight_value: 25, organization_id: null },
          { weight_name: 'intervention_follow_up_weight', weight_value: 15, organization_id: null },
          { weight_name: 'trend_consistency_weight', weight_value: 15, organization_id: null },
        ],
        daily_wellness: dailyWellness,
        workouts: [],
        habits: [],
        pulse_surveys: [],
        interventions: [],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    expect(dashboard.participants[0].latest_wellness?.date).toBe('2024-06-08')
    expect(dashboard.participants[0].latest_wellness?.day_strain).toBe(12.4)
    expect(dashboard.participants[0].latest_wellness?.recovery_score).toBe(80)
  })

  test('marks participants enrolled within 21 days as building baseline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00Z'))

    const participants = [
      {
        id: 'P1',
        first_name: 'Caleb',
        last_name: 'Stone',
        department: 'Ops',
        location_id: null,
        employment_type: null,
        title: 'RN',
        device_id: null,
        consent: true,
        enrolled_date: '2026-08-01T00:00:00Z',
        status: 'Active',
        is_exact_data: false,
      },
    ]

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        engagement_score_weights: [
          { weight_name: 'login_frequency_weight', weight_value: 25, organization_id: null },
          { weight_name: 'pulse_survey_completion_weight', weight_value: 20, organization_id: null },
          { weight_name: 'data_submission_weight', weight_value: 25, organization_id: null },
          { weight_name: 'intervention_follow_up_weight', weight_value: 15, organization_id: null },
          { weight_name: 'trend_consistency_weight', weight_value: 15, organization_id: null },
        ],
        daily_wellness: [],
        workouts: [],
        habits: [],
        pulse_surveys: [],
        interventions: [],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    expect(dashboard.participants[0].baseline_state).toBe('building')
    expect(dashboard.participants[0].baseline_days_remaining).toBe(12)

    jest.useRealTimers()
  })

  test('keeps active snoozes visible until expiry and re-surfaces expired snoozes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00Z'))

    const participants = [
      {
        id: 'P1',
        first_name: 'Alex',
        last_name: 'Able',
        department: 'Ops',
        location_id: null,
        employment_type: null,
        title: 'Nurse',
        device_id: null,
        consent: true,
        enrolled_date: '2026-07-01T00:00:00Z',
        status: 'Active',
        is_exact_data: false,
      },
      {
        id: 'P2',
        first_name: 'Bea',
        last_name: 'Baker',
        department: 'Ops',
        location_id: null,
        employment_type: null,
        title: 'RN',
        device_id: null,
        consent: true,
        enrolled_date: '2026-07-01T00:00:00Z',
        status: 'Active',
        is_exact_data: false,
      },
    ]

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        engagement_score_weights: [
          { weight_name: 'login_frequency_weight', weight_value: 25, organization_id: null },
          { weight_name: 'pulse_survey_completion_weight', weight_value: 20, organization_id: null },
          { weight_name: 'data_submission_weight', weight_value: 25, organization_id: null },
          { weight_name: 'intervention_follow_up_weight', weight_value: 15, organization_id: null },
          { weight_name: 'trend_consistency_weight', weight_value: 15, organization_id: null },
        ],
        daily_wellness: [],
        workouts: [],
        habits: [],
        pulse_surveys: [],
        interventions: [],
        risk_flags: [
          {
            id: 'flag-active',
            participant_id: 'P1',
            flag_type: 'wellness_director',
            is_active: true,
            severity: null,
            override_state: 'snoozed',
            override_reason: 'Check back later',
            override_expires_at: '2026-08-12T00:00:00Z',
            created_at: '2026-08-09T00:00:00Z',
            updated_at: '2026-08-09T00:00:00Z',
          },
          {
            id: 'flag-expired',
            participant_id: 'P2',
            flag_type: 'wellness_director',
            is_active: true,
            severity: null,
            override_state: 'snoozed',
            override_reason: 'Old snooze',
            override_expires_at: '2026-08-09T00:00:00Z',
            created_at: '2026-08-08T00:00:00Z',
            updated_at: '2026-08-08T00:00:00Z',
          },
        ],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    const participantById = Object.fromEntries(dashboard.participants.map((participant) => [participant.id, participant]))

    expect(participantById.P1.override_state).toBe('snoozed')
    expect(participantById.P1.override_note).toBe('Check back later')
    expect(participantById.P1.override_expires_at).toBe('2026-08-12T00:00:00Z')
    expect(participantById.P2.override_state).toBeNull()
    expect(participantById.P2.override_expires_at).toBeNull()

    jest.useRealTimers()
  })

  test('computes distinct, non-flattened engagement scores driven by real participant-scoped data', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T12:00:00Z'))

    const participants = [
      {
        id: 'P1', first_name: 'Hana', last_name: 'High', department: 'Ops', location_id: null,
        employment_type: null, title: 'RN', device_id: null, consent: true,
        enrolled_date: '2026-01-01', status: 'Active', is_exact_data: false, cohort: null,
      },
      {
        id: 'P2', first_name: 'Leo', last_name: 'Low', department: 'Ops', location_id: null,
        employment_type: null, title: 'RN', device_id: null, consent: true,
        enrolled_date: '2026-01-01', status: 'Active', is_exact_data: false, cohort: null,
      },
    ]

    // P1: a daily_wellness row (valid recovery + sleep) for every day of the trailing
    // 21-day window (2026-07-28..2026-08-17), so submission consistency and device-wear
    // consistency both resolve to 100%. P2 has none.
    const dailyWellness: any[] = []
    for (let i = 0; i < 21; i++) {
      const date = new Date('2026-07-28T00:00:00Z')
      date.setUTCDate(date.getUTCDate() + i)
      dailyWellness.push({
        id: `w-p1-${i}`, participant_id: 'P1', date: date.toISOString().slice(0, 10),
        recovery_score: 70, hrv_ms: 60, sleep_perf: 80, sleep_hrs: 7,
      })
    }

    // P1: one pulse survey in each of the last 3 calendar weeks (100% completion).
    const pulseSurveys = [
      { id: 'pulse-p1-w0', participant_id: 'P1', date: '2026-08-17', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
      { id: 'pulse-p1-w1', participant_id: 'P1', date: '2026-08-12', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
      { id: 'pulse-p1-w2', participant_id: 'P1', date: '2026-08-03', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    ]

    // P1: historical baseline of ~1 workout every 6 days (10 over the 60 days before the
    // trailing window), then 7 workouts within the trailing 21 days — well above baseline,
    // so the ratio-vs-baseline formula clamps at 100. P2 has zero workouts (no baseline).
    const workouts: any[] = []
    for (let i = 0; i < 10; i++) {
      const date = new Date('2026-05-29T00:00:00Z')
      date.setUTCDate(date.getUTCDate() + i * 6)
      workouts.push({ id: `wo-baseline-${i}`, participant_id: 'P1', date: date.toISOString().slice(0, 10), start_time: `${date.toISOString().slice(0, 10)}T08:00:00Z`, activity: 'Run', duration_min: 30, strain: 8 })
    }
    for (let i = 0; i < 7; i++) {
      const date = new Date('2026-07-28T00:00:00Z')
      date.setUTCDate(date.getUTCDate() + i * 3)
      workouts.push({ id: `wo-current-${i}`, participant_id: 'P1', date: date.toISOString().slice(0, 10), start_time: `${date.toISOString().slice(0, 10)}T08:00:00Z`, activity: 'Run', duration_min: 30, strain: 8 })
    }

    // Three weekly nudges targeting 'all' participants within the trailing 21 days.
    // P1 acknowledges every one; P2 acknowledges none.
    const weeklyNudges = [
      { id: 'nudge-1', week_of: '2026-08-03' },
      { id: 'nudge-2', week_of: '2026-08-10' },
      { id: 'nudge-3', week_of: '2026-08-17' },
    ]
    const nudgeTargets = weeklyNudges.map((n) => ({ nudge_id: n.id, target_type: 'all', target_label: '', participant_id: null }))
    const nudgeAcknowledgements = weeklyNudges.map((n) => ({ nudge_id: n.id, participant_id: 'P1' }))

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        daily_wellness: dailyWellness,
        workouts,
        habits: [],
        pulse_surveys: pulseSurveys,
        interventions: [],
        weekly_nudges: weeklyNudges,
        nudge_targets: nudgeTargets,
        nudge_acknowledgements: nudgeAcknowledgements,
      }) as never
    )

    const dashboard = await getTeamDashboard()
    const participantById = Object.fromEntries(dashboard.participants.map((participant) => [participant.id, participant]))

    expect(participantById.P1.engagement_score_components).toEqual({
      submission_consistency: 100,
      device_wear_consistency: 100,
      pulse_completion: 100,
      nudge_response: 100,
      workout_volume: 100,
    })
    expect(participantById.P1.engagement_score).toBe(100)

    expect(participantById.P2.engagement_score_components).toEqual({
      submission_consistency: 0,
      device_wear_consistency: 0,
      pulse_completion: 0,
      nudge_response: 0,
      workout_volume: 0,
    })
    expect(participantById.P2.engagement_score).toBe(0)

    // Regression guard: the two participants must not collapse to the same
    // (or any other fixed/constant) score once real per-participant data varies.
    expect(participantById.P1.engagement_score).not.toBe(participantById.P2.engagement_score)

    jest.useRealTimers()
  })

  test('uses the admin-saved non-default weights (not the hardcoded 25/20/20/15/20 defaults) when computing engagement score', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T12:00:00Z'))

    const participants = [
      {
        id: 'P1', first_name: 'Hana', last_name: 'High', department: 'Ops', location_id: null,
        employment_type: null, title: 'RN', device_id: null, consent: true,
        enrolled_date: '2026-01-01', status: 'Active', is_exact_data: false, cohort: null,
      },
    ]

    // P1 has one pulse survey in each of the last 3 calendar weeks (100% pulse
    // completion) and nothing else - no daily_wellness rows, no workouts, no nudge
    // acknowledgements - so submission_consistency, device_wear_consistency,
    // nudge_response, and workout_volume all resolve to 0.
    const pulseSurveys = [
      { id: 'pulse-p1-w0', participant_id: 'P1', date: '2026-08-17', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
      { id: 'pulse-p1-w1', participant_id: 'P1', date: '2026-08-12', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
      { id: 'pulse-p1-w2', participant_id: 'P1', date: '2026-08-03', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    ]

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        daily_wellness: [],
        workouts: [],
        habits: [],
        pulse_surveys: pulseSurveys,
        interventions: [],
        // Non-default weights: pulse_completion (the only component P1 scores 100 on)
        // is weighted at 70 instead of the default 20, with the remaining 30 spread
        // across the other components (all of which P1 scores 0 on). If this saved
        // config were ignored in favor of the hardcoded defaults, the score would be
        // 20 instead of 70.
        wellness_director_config: [
          {
            id: 'current',
            weights: {
              submission_consistency: 10,
              device_wear_consistency: 10,
              pulse_completion: 70,
              nudge_response: 5,
              workout_volume: 5,
            },
          },
        ],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    const participant = dashboard.participants.find((p) => p.id === 'P1')

    expect(participant?.engagement_score_components?.pulse_completion).toBe(100)
    // pulse_completion(100) * 70% + everything else at 0 = 70.
    expect(participant?.engagement_score).toBe(70)

    jest.useRealTimers()
  })

  test('pulse completion is computed per participant across the last 3 weeks, not diluted by another participant\u2019s row volume', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T12:00:00Z'))

    const participants = [
      {
        id: 'P1', first_name: 'Steady', last_name: 'Submitter', department: 'Ops', location_id: null,
        employment_type: null, title: 'RN', device_id: null, consent: true,
        enrolled_date: '2026-01-01', status: 'Active', is_exact_data: false, cohort: null,
      },
      {
        id: 'P2', first_name: 'Bursty', last_name: 'Submitter', department: 'Ops', location_id: null,
        employment_type: null, title: 'RN', device_id: null, consent: true,
        enrolled_date: '2026-01-01', status: 'Active', is_exact_data: false, cohort: null,
      },
    ]

    // P1 submits once in each of the last 3 weeks (100% weekly completion).
    const pulseSurveys = [
      { id: 'pulse-p1-w0', participant_id: 'P1', date: '2026-08-17', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
      { id: 'pulse-p1-w1', participant_id: 'P1', date: '2026-08-12', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
      { id: 'pulse-p1-w2', participant_id: 'P1', date: '2026-08-03', confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4, stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes', whoop_reviewed: 'yes_once', health_flag: null },
    ]
    // P2 submits many times, but all crammed into a single week (2026-08-10..16) —
    // a much larger row count than P1's, yet only 1 of the last 3 weeks is covered.
    for (let i = 0; i < 20; i++) {
      const date = new Date('2026-08-10T00:00:00Z')
      date.setUTCDate(date.getUTCDate() + (i % 7))
      pulseSurveys.push({
        id: `pulse-p2-${i}`, participant_id: 'P2', date: date.toISOString().slice(0, 10),
        confident_health: true, body_trending_good: true, energy_level: 4, rest_quality: 4,
        stress_level: 2, physical_activity: [], mental_wellbeing: 4, program_supported: 'yes',
        whoop_reviewed: 'yes_once', health_flag: null,
      })
    }

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        daily_wellness: [],
        workouts: [],
        habits: [],
        pulse_surveys: pulseSurveys,
        interventions: [],
        weekly_nudges: [],
        nudge_targets: [],
        nudge_acknowledgements: [],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    const participantById = Object.fromEntries(dashboard.participants.map((participant) => [participant.id, participant]))

    // P1's 3-row, one-per-week pattern yields full credit despite P2 having ~7x more rows.
    expect(participantById.P1.engagement_score_components?.pulse_completion).toBe(100)
    // P2's 20 rows squeezed into a single week only earn credit for that one week.
    expect(participantById.P2.engagement_score_components?.pulse_completion).toBe(33)

    jest.useRealTimers()
  })

  test('workout volume compares the trailing 21 days against the participant\u2019s own historical baseline, not a flat count cap', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T12:00:00Z'))

    const participants = [
      {
        id: 'P1', first_name: 'Below', last_name: 'Baseline', department: 'Ops', location_id: null,
        employment_type: null, title: 'RN', device_id: null, consent: true,
        enrolled_date: '2026-01-01', status: 'Active', is_exact_data: false, cohort: null,
      },
    ]

    // Historical baseline: 1 workout every 3 days for 60 days before the trailing window
    // (20 workouts / 60 days -> ~7 per 21-day window).
    const workouts: any[] = []
    for (let i = 0; i < 20; i++) {
      const date = new Date('2026-05-29T00:00:00Z')
      date.setUTCDate(date.getUTCDate() + i * 3)
      workouts.push({ id: `wo-baseline-${i}`, participant_id: 'P1', date: date.toISOString().slice(0, 10), start_time: `${date.toISOString().slice(0, 10)}T08:00:00Z`, activity: 'Run', duration_min: 30, strain: 8 })
    }
    // Current trailing 21 days: only 3 workouts logged (well below the ~7/21d baseline
    // rate), old formula (count/3 * 100) would have scored this a flat 100.
    for (let i = 0; i < 3; i++) {
      const date = new Date('2026-07-28T00:00:00Z')
      date.setUTCDate(date.getUTCDate() + i * 7)
      workouts.push({ id: `wo-current-${i}`, participant_id: 'P1', date: date.toISOString().slice(0, 10), start_time: `${date.toISOString().slice(0, 10)}T08:00:00Z`, activity: 'Run', duration_min: 30, strain: 8 })
    }

    mockCreateClient.mockReturnValue(
      makeTableClient({
        participants,
        daily_wellness: [],
        workouts,
        habits: [],
        pulse_surveys: [],
        interventions: [],
        weekly_nudges: [],
        nudge_targets: [],
        nudge_acknowledgements: [],
      }) as never
    )

    const dashboard = await getTeamDashboard()
    const workoutVolume = dashboard.participants[0].engagement_score_components?.workout_volume ?? 0

    expect(workoutVolume).toBeGreaterThan(0)
    expect(workoutVolume).toBeLessThan(100)

    jest.useRealTimers()
  })
})

describe('getTeamHealthScoreConfig', () => {
  test('returns the default window when no config row is saved', async () => {
    const supabase = makeTableClient({ team_health_score_config: [] })
    const config = await getTeamHealthScoreConfig(supabase as never)
    expect(config).toEqual({ baselineStart: '2026-07-02', baselineEnd: '2026-07-27' })
  })

  test('returns the persisted, normalized window', async () => {
    const supabase = makeTableClient({
      team_health_score_config: [{ id: 'current', baseline_start: '2026-01-01', baseline_end: '2026-01-31' }],
    })
    const config = await getTeamHealthScoreConfig(supabase as never)
    expect(config).toEqual({ baselineStart: '2026-01-01', baselineEnd: '2026-01-31' })
  })
})

describe('getWorkoutHistoryForParticipants', () => {
  test('returns an empty array for an empty participant list without querying', async () => {
    const supabase = makeTableClient({ workouts: [{ id: 'w1', participant_id: 'P1', date: '2026-08-11' }] })
    const result = await getWorkoutHistoryForParticipants([], '2026-08-01', supabase as never)
    expect(result).toEqual([])
  })

  test('fetches workouts for the given participants since the given date', async () => {
    const supabase = makeTableClient({
      workouts: [
        { id: 'w1', participant_id: 'P1', date: '2026-08-11' },
        { id: 'w2', participant_id: 'P1', date: '2026-07-01' }, // before sinceDate, excluded
        { id: 'w3', participant_id: 'P2', date: '2026-08-12' }, // different participant, excluded
      ],
    })
    const result = await getWorkoutHistoryForParticipants(['P1'], '2026-08-01', supabase as never)
    expect(result).toEqual([{ id: 'w1', participant_id: 'P1', date: '2026-08-11' }])
  })
})

describe('getTeamHealthScore', () => {
  test('scores a participant using their wellness/workout history and the configured baseline window', async () => {
    const supabase = makeTableClient({
      team_health_score_config: [{ id: 'current', baseline_start: '2026-07-02', baseline_end: '2026-07-27' }],
      daily_wellness: [
        { participant_id: 'P1', date: '2026-08-18', sleep_onset_time: null, sleep_hrs: 7.5, hrv_ms: 60, recovery_score: 70 },
      ],
      workouts: [],
    })

    const result = await getTeamHealthScore('P1', '2026-08-17', supabase as never)

    expect(result.current.window).toEqual({ start: '2026-08-17', end: '2026-08-23' })
    expect(result.current.sleep).toBe(100.0)
    expect(result.baseline.window).toEqual({ start: '2026-07-02', end: '2026-07-27' })
  })
})

describe('getCurrentWeekPulse', () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('includes submissions from Monday through Sunday of the current week and excludes adjacent weeks', async () => {
    // 2026-08-19 is a Wednesday, so the current week runs Mon 2026-08-17 - Sun 2026-08-23.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'))

    const pulseSurveys = [
      { id: 'boundary-mon', participant_id: 'P1', date: '2026-08-17', energy_level: 3 },
      { id: 'boundary-sun', participant_id: 'P1', date: '2026-08-23', energy_level: 4 },
      { id: 'mid-week', participant_id: 'P1', date: '2026-08-19', energy_level: 5 },
      { id: 'prior-week', participant_id: 'P2', date: '2026-08-16', energy_level: 2 },
      { id: 'next-week', participant_id: 'P2', date: '2026-08-24', energy_level: 2 },
    ]

    mockCreateClient.mockReturnValue(makeTableClient({ pulse_surveys: pulseSurveys }) as never)

    const result = await getCurrentWeekPulse()

    expect(result.map((row) => row.id).sort()).toEqual(['boundary-mon', 'boundary-sun', 'mid-week'])
  })

  test('returns every submission for a participant who responded on multiple days, without deduping', async () => {
    // 2026-08-19 is a Wednesday, so the current week runs Mon 2026-08-17 - Sun 2026-08-23.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'))

    const pulseSurveys = [
      { id: 'mon', participant_id: 'P1', date: '2026-08-17', energy_level: 3 },
      { id: 'tue', participant_id: 'P1', date: '2026-08-18', energy_level: 4 },
      { id: 'wed', participant_id: 'P1', date: '2026-08-19', energy_level: 5 },
    ]

    mockCreateClient.mockReturnValue(makeTableClient({ pulse_surveys: pulseSurveys }) as never)

    const result = await getCurrentWeekPulse()

    expect(result).toHaveLength(3)
    expect(result.filter((row) => row.participant_id === 'P1')).toHaveLength(3)
  })
})

describe('getNudgeHistoryForParticipant', () => {
  test('returns an empty array when the participant has no individually-targeted nudges', async () => {
    const supabase = makeTableClient({
      nudge_targets: [{ nudge_id: 'n1', participant_id: 'P2', target_type: 'participant' }],
      weekly_nudges: [{ id: 'n1', week_of: '2026-08-10', message: 'hi', created_at: '2026-08-10T00:00:00Z' }],
      nudge_acknowledgements: [],
    })
    const result = await getNudgeHistoryForParticipant('P1', 10, supabase as never)
    expect(result).toEqual([])
  })

  test('pairs each targeted nudge with its response status, most recent first', async () => {
    const supabase = makeTableClient({
      nudge_targets: [
        { nudge_id: 'n1', participant_id: 'P1', target_type: 'participant' },
        { nudge_id: 'n2', participant_id: 'P1', target_type: 'participant' },
        { nudge_id: 'n3', participant_id: 'P1', target_type: 'subgroup' }, // wrong target_type, excluded
        { nudge_id: 'n4', participant_id: 'P2', target_type: 'participant' }, // different participant, excluded
      ],
      weekly_nudges: [
        { id: 'n1', week_of: '2026-08-10', message: 'Check in please', created_at: '2026-08-10T00:00:00Z' },
        { id: 'n2', week_of: '2026-08-17', message: 'How are you feeling?', created_at: '2026-08-17T00:00:00Z' },
      ],
      nudge_acknowledgements: [
        { nudge_id: 'n1', participant_id: 'P1', acknowledged_at: '2026-08-11T09:00:00Z' },
      ],
    })

    const result = await getNudgeHistoryForParticipant('P1', 10, supabase as never)

    expect(result).toEqual([
      { nudge_id: 'n2', week_of: '2026-08-17', message: 'How are you feeling?', created_at: '2026-08-17T00:00:00Z', responded: false, responded_at: null },
      { nudge_id: 'n1', week_of: '2026-08-10', message: 'Check in please', created_at: '2026-08-10T00:00:00Z', responded: true, responded_at: '2026-08-11T09:00:00Z' },
    ])
  })
})

describe('getWeeklyResponseRate', () => {
  test('returns an empty array for an empty participant list without querying', async () => {
    const supabase = makeTableClient({ daily_wellness: [{ participant_id: 'P1', date: '2026-08-17' }] })
    const result = await getWeeklyResponseRate('2026-08-17', [], supabase as never)
    expect(result).toEqual([])
  })

  test('marks Mon-Sun days with a submitted daily_wellness row and computes the week percentage', async () => {
    const supabase = makeTableClient({
      daily_wellness: [
        { participant_id: 'P1', date: '2026-08-17' }, // Mon
        { participant_id: 'P1', date: '2026-08-19' }, // Wed
        { participant_id: 'P1', date: '2026-08-23' }, // Sun
        { participant_id: 'P1', date: '2026-08-24' }, // next week Monday, excluded
        { participant_id: 'P2', date: '2026-08-16' }, // prior week Sunday, excluded
      ],
    })

    const result = await getWeeklyResponseRate('2026-08-17', ['P1', 'P2'], supabase as never)

    expect(result).toEqual([
      { participant_id: 'P1', days: [true, false, true, false, false, false, true], week_pct: 43 },
      { participant_id: 'P2', days: [false, false, false, false, false, false, false], week_pct: 0 },
    ])
  })
})

