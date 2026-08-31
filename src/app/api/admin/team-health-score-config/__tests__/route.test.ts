import { GET, PUT } from '../route'
import { createServerSupabaseClient, requireAdmin, getSession, getUserAccess } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  requireAdmin: jest.fn(),
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

describe('admin team-health-score-config route', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('GET returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null as never)
    const response = await GET()
    expect(response.status).toBe(401)
  })

  test('GET returns 403 for a non-leadership role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant' } as never)
    const response = await GET()
    expect(response.status).toBe(403)
  })

  test('GET returns default config when missing, readable by wellness_director', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.config).toEqual({ id: 'current', baselineStart: '2026-07-02', baselineEnd: '2026-07-27' })
  })

  test('GET falls back to defaults for a malformed persisted row', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'admin' } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: { baseline_start: '2026-02-01', baseline_end: '2026-01-01' }, error: null })),
          })),
        })),
      })),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(body.config).toEqual({ id: 'current', baselineStart: '2026-07-02', baselineEnd: '2026-07-27' })
  })

  test('PUT rejects a non-admin', async () => {
    mockRequireAdmin.mockResolvedValue({ redirect: '/' } as never)
    const response = await PUT(new Request('http://localhost/api/admin/team-health-score-config', {
      method: 'PUT',
      body: JSON.stringify({ baseline_start: '2026-01-01', baseline_end: '2026-01-31' }),
    }))
    expect(response.status).toBe(403)
  })

  test('PUT rejects an invalid window (end before start)', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const response = await PUT(new Request('http://localhost/api/admin/team-health-score-config', {
      method: 'PUT',
      body: JSON.stringify({ baseline_start: '2026-02-01', baseline_end: '2026-01-01' }),
    }))
    expect(response.status).toBe(400)
  })

  test('PUT rejects a window shorter than 7 days', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const response = await PUT(new Request('http://localhost/api/admin/team-health-score-config', {
      method: 'PUT',
      body: JSON.stringify({ baseline_start: '2026-01-01', baseline_end: '2026-01-03' }),
    }))
    expect(response.status).toBe(400)
  })

  test('PUT persists a valid window', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const upsert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { id: 'current', baseline_start: '2026-01-01', baseline_end: '2026-01-31' }, error: null })),
      })),
    }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({ upsert })),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/team-health-score-config', {
      method: 'PUT',
      body: JSON.stringify({ baseline_start: '2026-01-01', baseline_end: '2026-01-31' }),
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      id: 'current',
      baseline_start: '2026-01-01',
      baseline_end: '2026-01-31',
    }, { onConflict: 'id' })
  })
})
