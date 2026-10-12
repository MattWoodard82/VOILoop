type SeedRow = Record<string, string | number | null>

const mockUpsert = jest.fn(async (_rows: SeedRow[], _options: { onConflict: string }) => ({ error: null }))
const mockMaybeSingle = jest.fn(async () => ({
  data: { baseline_start: '2026-07-02' },
  error: null,
}))
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })),
      })),
      upsert: mockUpsert,
    })),
  })),
}))
jest.mock('dotenv', () => ({ config: jest.fn() }))

describe('generated demo wearable history', () => {
  let seedTeamHealthScore: () => Promise<void>
  let savedEnvironment: NodeJS.ProcessEnv
  let consoleSpy: jest.SpyInstance

  beforeAll(async () => {
    savedEnvironment = { ...process.env }
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.VOILOOP_ENV = 'local'
    process.env.DEMO_SEED_DATE = '2026-10-12'
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T12:00:00Z'))
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    ;({ seedTeamHealthScore } = await import('../seed-team-health-score'))
  })

  afterAll(() => {
    process.env = savedEnvironment
    consoleSpy.mockRestore()
    jest.useRealTimers()
  })

  test('writes deterministic, unique rows with genuine sparse, stale, and empty histories', async () => {
    await seedTeamHealthScore()
    const wellness = mockUpsert.mock.calls[0][0]
    const workouts = mockUpsert.mock.calls[1][0]
    const days = (id: string) => wellness.filter(row => row.participant_id === id)

    expect(days('EMP015')).toHaveLength(0)
    expect(days('EMP030')).toHaveLength(0)
    expect(days('EMP016')).toHaveLength(8)
    expect(days('EMP025')).toHaveLength(15)
    expect(days('EMP018').at(-1)?.date).toBe('2026-09-21')
    expect(days('EMP019').length).toBeLessThan(days('EMP012').length)
    expect(days('EMP012').at(-1)?.date).toBe('2026-10-12')
    expect(new Set(wellness.map(row => `${row.participant_id}:${row.date}`)).size).toBe(wellness.length)
    expect(new Set(workouts.map(row => `${row.participant_id}:${row.start_time}`)).size).toBe(workouts.length)
    for (const workout of workouts) {
      expect(Date.parse(String(workout.end_time)) - Date.parse(String(workout.start_time)))
        .toBe(Number(workout.duration_min) * 60000)
      expect(['zone1_pct', 'zone2_pct', 'zone3_pct', 'zone4_pct', 'zone5_pct']
        .reduce((sum, key) => sum + Number(workout[key]), 0)).toBe(100)
    }

    await seedTeamHealthScore()
    expect(mockUpsert.mock.calls[2][0]).toEqual(wellness)
    expect(mockUpsert.mock.calls[3][0]).toEqual(workouts)
  })

  test('improving and declining scenarios differ measurably, not just by labels', () => {
    const wellness = mockUpsert.mock.calls[0][0]
    const trend = (id: string) => {
      const rows = wellness.filter(row => row.participant_id === id)
      const average = (slice: SeedRow[]) => slice.reduce((sum, row) => sum + Number(row.recovery_score), 0) / slice.length
      return average(rows.slice(-7)) - average(rows.slice(0, 7))
    }
    expect(trend('EMP011')).toBeGreaterThan(10)
    expect(trend('EMP014')).toBeLessThan(-10)
  })
})
