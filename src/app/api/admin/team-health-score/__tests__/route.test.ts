import { GET } from '../route'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { getTeamHealthScore } from '@/lib/supabase/queries'

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getTeamHealthScore: jest.fn(),
}))

describe('admin team-health-score route', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>
  const mockGetTeamHealthScore = getTeamHealthScore as jest.MockedFunction<typeof getTeamHealthScore>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function req(params: string) {
    return new Request(`http://localhost/api/admin/team-health-score?${params}`)
  }

  test('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null as never)
    const response = await GET(req('participantId=p1&currentStart=2026-08-17'))
    expect(response.status).toBe(401)
  })

  test('returns 403 for a non-leadership role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant' } as never)
    const response = await GET(req('participantId=p1&currentStart=2026-08-17'))
    expect(response.status).toBe(403)
  })

  test('returns 400 when participantId is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    const response = await GET(req('currentStart=2026-08-17'))
    expect(response.status).toBe(400)
  })

  test('returns 400 when currentStart is not a valid date string', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    const response = await GET(req('participantId=p1&currentStart=not-a-date'))
    expect(response.status).toBe(400)
  })

  test('returns the computed score for a valid request', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    const fakeScore = { baseline: {}, lastWeek: {}, current: {} }
    mockGetTeamHealthScore.mockResolvedValue(fakeScore as never)

    const response = await GET(req('participantId=p1&currentStart=2026-08-17'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.score).toEqual(fakeScore)
    expect(mockGetTeamHealthScore).toHaveBeenCalledWith('p1', '2026-08-17')
  })

  test('returns 500 when the score computation throws', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    mockGetTeamHealthScore.mockRejectedValue(new Error('db exploded'))

    const response = await GET(req('participantId=p1&currentStart=2026-08-17'))
    expect(response.status).toBe(500)
  })
})
