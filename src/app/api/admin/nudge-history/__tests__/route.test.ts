import { GET } from '../route'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { getNudgeHistoryForParticipant } from '@/lib/supabase/queries'

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(),
  getUserAccess: jest.fn(),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getNudgeHistoryForParticipant: jest.fn(),
}))

describe('admin nudge-history route', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockGetUserAccess = getUserAccess as jest.MockedFunction<typeof getUserAccess>
  const mockGetNudgeHistoryForParticipant = getNudgeHistoryForParticipant as jest.MockedFunction<typeof getNudgeHistoryForParticipant>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function req(params: string) {
    return new Request(`http://localhost/api/admin/nudge-history?${params}`)
  }

  test('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null as never)
    const response = await GET(req('participantId=p1'))
    expect(response.status).toBe(401)
  })

  test('returns 403 for a non-leadership role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'participant' } as never)
    const response = await GET(req('participantId=p1'))
    expect(response.status).toBe(403)
  })

  test('returns 400 when participantId is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    const response = await GET(req(''))
    expect(response.status).toBe(400)
  })

  test('returns the nudge history for a valid request', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    const fakeHistory = [
      { nudge_id: 'n1', week_of: '2026-08-17', message: 'hi', created_at: '2026-08-17T00:00:00Z', responded: true, responded_at: '2026-08-18T00:00:00Z' },
    ]
    mockGetNudgeHistoryForParticipant.mockResolvedValue(fakeHistory as never)

    const response = await GET(req('participantId=p1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.history).toEqual(fakeHistory)
    expect(mockGetNudgeHistoryForParticipant).toHaveBeenCalledWith('p1')
  })

  test('returns 500 when the query throws', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'wd-1' } } as never)
    mockGetUserAccess.mockResolvedValue({ role: 'wellness_director' } as never)
    mockGetNudgeHistoryForParticipant.mockRejectedValue(new Error('db exploded'))

    const response = await GET(req('participantId=p1'))
    expect(response.status).toBe(500)
  })
})
