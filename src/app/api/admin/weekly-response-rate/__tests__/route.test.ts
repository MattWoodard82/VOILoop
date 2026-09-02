import { GET } from '../route'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { getParticipants, getWeeklyResponseRate } from '@/lib/supabase/queries'

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getParticipants: jest.fn(),
  getWeeklyResponseRate: jest.fn(),
}))

describe('admin weekly-response-rate route', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>
  const mockGetParticipants = getParticipants as jest.MockedFunction<typeof getParticipants>
  const mockGetWeeklyResponseRate = getWeeklyResponseRate as jest.MockedFunction<typeof getWeeklyResponseRate>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function req(params: string) {
    return new Request(`http://localhost/api/admin/weekly-response-rate?${params}`)
  }

  test('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null as never)
    const response = await GET(req('weekStart=2026-08-17'))
    expect(response.status).toBe(401)
  })

  test('returns 403 for a non-leadership role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant' } as never)
    const response = await GET(req('weekStart=2026-08-17'))
    expect(response.status).toBe(403)
  })

  test('returns 400 when weekStart is not a valid date string', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    const response = await GET(req('weekStart=not-a-date'))
    expect(response.status).toBe(400)
  })

  test('returns the computed rows for a valid request', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    mockGetParticipants.mockResolvedValue([{ id: 'P1' }, { id: 'P2' }] as never)
    const fakeRows = [
      { participant_id: 'P1', days: [true, true, true, true, true, false, false], week_pct: 71 },
      { participant_id: 'P2', days: [false, false, false, false, false, false, false], week_pct: 0 },
    ]
    mockGetWeeklyResponseRate.mockResolvedValue(fakeRows as never)

    const response = await GET(req('weekStart=2026-08-17'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rows).toEqual(fakeRows)
    expect(mockGetWeeklyResponseRate).toHaveBeenCalledWith('2026-08-17', ['P1', 'P2'])
  })

  test('returns 500 when the query throws', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    mockGetParticipants.mockResolvedValue([{ id: 'P1' }] as never)
    mockGetWeeklyResponseRate.mockRejectedValue(new Error('db exploded'))

    const response = await GET(req('weekStart=2026-08-17'))
    expect(response.status).toBe(500)
  })
})
