type Row = Record<string, unknown>
const mockWrites: { table: string; rows: Row[]; conflict: string }[] = []
const mockInserts: string[] = []
const mockChallengeInserts: Row[] = []
let mockSeeded = false
const mockListUsers = jest.fn(async (): Promise<{
  data: { users: { id: string; email?: string }[] }
  error: { message: string } | null
}> => ({ data: { users: [] }, error: null }))
const mockUpdateUser = jest.fn(async () => ({ error: null }))
class SeedQuery {
  private field?: string
  constructor(private table: string) {}
  select() { return this }
  eq(column: string) { this.field = column; return this }
  is() { return this }
  order() { return this }
  limit() { return this }
  async maybeSingle() {
    return {
      data: mockSeeded && this.field !== 'status' && ['weekly_nudges', 'nudge_targets', 'challenges'].includes(this.table)
        ? { id: `${this.table}-fixture`, version: 1 }
        : null,
      error: null,
    }
  }
  async single() { return { data: { id: `${this.table}-fixture` }, error: null } }
  update() { return this }
  insert(rows?: Row | Row[]) {
    mockInserts.push(this.table)
    if (this.table === 'challenges' && rows) mockChallengeInserts.push(...(Array.isArray(rows) ? rows : [rows]))
    return this
  }
  async upsert(rows: Row[] | Row, options: { onConflict: string }) {
    mockWrites.push({ table: this.table, rows: Array.isArray(rows) ? rows : [rows], conflict: options.onConflict })
    return { error: null }
  }
  then<TResult1 = { error: null }, TResult2 = never>(
    resolve?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve({ error: null }).then(resolve, reject)
  }
}
const mockFrom = jest.fn((table: string) => new SeedQuery(table))
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    auth: {
      admin: {
        listUsers: mockListUsers,
        updateUserById: mockUpdateUser,
        createUser: jest.fn(async () => ({ data: { user: { id: 'seed-auth-user' } }, error: null })),
      },
    },
  })),
}))
jest.mock('dotenv', () => ({ config: jest.fn() }))

describe('base demo seed', () => {
  let seed: () => Promise<void>
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
    ;({ seed } = await import('../seed'))
  })

  afterAll(() => {
    process.env = savedEnvironment
    consoleSpy.mockRestore()
    jest.useRealTimers()
  })

  test('keeps the seeded active challenge in the future when the fixed demo anchor is old', async () => {
    const savedSeedDate = process.env.DEMO_SEED_DATE
    process.env.DEMO_SEED_DATE = '2020-01-01'
    mockSeeded = false
    mockWrites.length = 0
    mockInserts.length = 0
    mockChallengeInserts.length = 0

    try {
      await jest.isolateModulesAsync(async () => {
        const { seed: seedWithOldAnchor } = await import('../seed')
        await seedWithOldAnchor()
      })

      expect(mockChallengeInserts).toHaveLength(1)
      expect(mockChallengeInserts[0].window_start_at).toBe('2026-10-13T00:00:00.000Z')
      expect(mockChallengeInserts[0].window_end_at).toBe('2026-10-17T23:59:59.000Z')
    } finally {
      process.env.DEMO_SEED_DATE = savedSeedDate
      mockWrites.length = 0
      mockInserts.length = 0
      mockChallengeInserts.length = 0
    }
  })

  test('seeds 30 synthetic active profiles and stable IDs without inserting duplicate events or interventions', async () => {
    await seed()
    const initialWrites = [...mockWrites]
    const participants = initialWrites.find(write => write.table === 'participants')!.rows
    expect(participants).toHaveLength(30)
    expect(new Set(participants.map(row => row.id)).size).toBe(30)
    expect(participants.every(row => row.status === 'Active' && row.is_exact_data === false)).toBe(true)
    expect(participants.find(row => row.id === 'EMP016')?.enrolled_date).toBe('2026-10-05')
    const access = initialWrites.find(write => write.table === 'user_access')!.rows
    expect(access.every(row => row.is_active === true)).toBe(true)
    const interventions = initialWrites.find(write => write.table === 'interventions')!
    expect(interventions.conflict).toBe('id')
    expect(interventions.rows.every(row => row.id)).toBe(true)
    expect(interventions.rows.find(row => row.outcome === 'Resolved')?.date_resolved).toBe('2026-10-05')
    const events = initialWrites.find(write => write.table === 'events')!
    expect(events.conflict).toBe('id')
    expect(events.rows.every(row => String(row.event_date) > '2026-10-12')).toBe(true)
    const pulses = initialWrites.find(write => write.table === 'pulse_surveys')!.rows
    expect(pulses.some(row => row.participant_id === 'EMP017')).toBe(false)
    expect(pulses.some(row => row.participant_id === 'EMP014' && row.energy_level === 1)).toBe(true)

    mockSeeded = true
    mockWrites.length = 0
    await seed()
    expect(mockInserts.filter(table => table === 'challenges')).toHaveLength(1)
    expect(mockInserts.filter(table => table === 'weekly_nudges')).toHaveLength(1)
    expect(mockInserts.filter(table => table === 'nudge_targets')).toHaveLength(1)
    for (const table of ['participants', 'events', 'interventions', 'pulse_surveys']) {
      expect(mockWrites.find(write => write.table === table)).toEqual(initialWrites.find(write => write.table === table))
    }
  })

  test('stops on Auth listing failures instead of creating duplicate accounts', async () => {
    mockListUsers.mockResolvedValueOnce({ data: { users: [] }, error: { message: 'Auth unavailable' } })
    await expect(seed()).rejects.toThrow('Failed to list Auth users before seed: Auth unavailable')
  })

  test('does not overwrite the existing scoring configuration in demo mode', async () => {
    process.env.VOILOOP_ENV = 'demo'
    mockWrites.length = 0
    await seed()
    expect(mockWrites.some(write => write.table === 'engagement_score_weights')).toBe(false)
  })
})
