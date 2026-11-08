import { refreshDemoStory } from '../demo-story-refresh'
import { DEMO_STORY_PARTICIPANTS } from '../demo-story'

const mockSelect = jest.fn()
const mockRpc = jest.fn()
jest.mock('../supabase/admin', () => ({
  createAdminSupabaseClient: () => ({ from: () => ({ select: () => ({ in: mockSelect }) }), rpc: mockRpc }),
}))

describe('scoped demo story refresh', () => {
  const saved = { ...process.env }
  const profiles = DEMO_STORY_PARTICIPANTS.map(profile => ({
    ...profile, enrolled_date: '2025-01-01', is_exact_data: false, status: 'Active',
  }))

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.VOILOOP_ENV = 'demo'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo-project.supabase.co'
    process.env.DEMO_SUPABASE_PROJECT_REF = 'demo-project'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
    process.env.DEMO_SEED_DATE = '2020-01-01'
    jest.useFakeTimers().setSystemTime(new Date('2026-11-04T18:00:00Z'))
    mockSelect.mockResolvedValue({ data: profiles, error: null })
    mockRpc.mockImplementation(async (_name, payload) => ({
      data: { anchor: payload.p_anchor, pulse_count: payload.p_pulse.length, recovery_count: payload.p_recovery.length },
      error: null,
    }))
  })
  afterEach(() => { process.env = { ...saved }; jest.useRealTimers() })

  test.each(['demo', 'pilot', 'production', 'local', ''])('refreshes matching synthetic data regardless of environment %s', async env => {
    process.env.VOILOOP_ENV = env
    delete process.env.DEMO_SUPABASE_PROJECT_REF
    await expect(refreshDemoStory()).resolves.toEqual(expect.objectContaining({ anchor: '2026-11-04' }))
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  test('anchors to current UTC day and uses only the narrow RPC with stable payloads', async () => {
    const result = await refreshDemoStory()
    await refreshDemoStory()
    expect(result.anchor).toBe('2026-11-04')
    expect(result.pulse_count).toBeGreaterThan(100)
    expect(mockRpc.mock.calls[0]).toEqual(mockRpc.mock.calls[1])
    expect(mockRpc.mock.calls[0][0]).toBe('refresh_demo_story')
    const payload = mockRpc.mock.calls[0][1]
    expect(Object.keys(payload)).toEqual(['p_anchor', 'p_profiles', 'p_recovery', 'p_pulse'])
    expect(payload.p_profiles).toHaveLength(30)
    expect(Object.keys(payload.p_recovery[0])).toEqual(['participant_id', 'date', 'recovery_score'])
  })

  test.each([
    [profiles.slice(1)],
    [profiles.map((profile, index) => index === 0 ? { ...profile, first_name: 'Actual person' } : profile)],
    [profiles.map((profile, index) => index === 0 ? { ...profile, status: 'Inactive' } : profile)],
  ])('rejects missing, mismatched or inactive identities', async data => {
    mockSelect.mockResolvedValue({ data, error: null })
    await expect(refreshDemoStory()).rejects.toThrow('Demo cohort mismatch')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('reports lookup and transactional failures without claiming success', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'lookup failed' } })
    await expect(refreshDemoStory()).rejects.toThrow('lookup failed')
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'transaction rolled back' } })
    await expect(refreshDemoStory()).rejects.toThrow('transaction rolled back')
    mockRpc.mockResolvedValueOnce({ data: {}, error: null })
    await expect(refreshDemoStory()).rejects.toThrow('unexpected result')
  })
})
