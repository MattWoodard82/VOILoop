import { GET } from '../route'

jest.mock('@/lib/supabase/server', () => ({
  getSession: jest.fn(async () => ({ user: { id: 'user-1' } })),
  getUserAccess: jest.fn(async () => ({ role: 'participant', mustChangePassword: false })),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getParticipantRankContext: jest.fn(async (_userId: string, metric: string) => ({
    metric,
    participant_rank: 2,
    participant_value: 84,
    cohort_size: 10,
    cohort_percentile: 90,
    percentile_label: 'Top 10%',
    comparison_text: 'Ahead of 1 participant, behind 8.',
    metric_label: 'Recovery',
    metric_value_label: '84',
    metric_description: 'Higher recovery scores rank better.',
    rank_context: { ahead: 1, behind: 8 },
    cohort_band: 'top',
    safe_context_note: 'Only participant-facing rank context is returned; no peer identities are exposed.',
  })),
}))

describe('participant ranking route', () => {
  const { getUserAccess } = jest.requireMock('@/lib/supabase/server') as {
    getUserAccess: jest.Mock
  }
  const { getParticipantRankContext } = jest.requireMock('@/lib/supabase/queries') as {
    getParticipantRankContext: jest.Mock
  }

  beforeEach(() => {
    jest.clearAllMocks()
    getUserAccess.mockResolvedValue({ role: 'participant', mustChangePassword: false })
    getParticipantRankContext.mockResolvedValue({
      metric: 'recovery',
      participant_rank: 2,
      participant_value: 84,
      cohort_size: 10,
      cohort_percentile: 90,
      percentile_label: 'Top 10%',
      comparison_text: 'Ahead of 8 participants, behind 1.',
      metric_label: 'Recovery',
      metric_value_label: '84',
      metric_description: 'Higher recovery scores rank better.',
      rank_context: { ahead: 8, behind: 1 },
      cohort_band: 'top',
      safe_context_note: 'Only participant-facing rank context is returned; no peer identities are exposed.',
    })
  })

  test('returns participant-only rank context', async () => {
    const response = await GET(new Request('http://localhost/api/participant/ranking?metric=recovery'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.context).toMatchObject({
      metric: 'recovery',
      participant_rank: 2,
      participant_value: 84,
      cohort_percentile: 90,
    })
    expect(JSON.stringify(body)).not.toMatch(/first_name|last_name|admin|participant_id/i)
  })

  test('rejects invalid metric names', async () => {
    const response = await GET(new Request('http://localhost/api/participant/ranking?metric=peer_score'))
    expect(response.status).toBe(400)
  })

  test('rejects non-participant roles', async () => {
    getUserAccess.mockResolvedValue({ role: 'admin', mustChangePassword: false })

    const response = await GET(new Request('http://localhost/api/participant/ranking?metric=recovery'))
    expect(response.status).toBe(403)
  })

  test('returns 404 when the participant cannot be resolved', async () => {
    getParticipantRankContext.mockRejectedValue(Object.assign(new Error('Participant not found.'), { status: 404 }))

    const response = await GET(new Request('http://localhost/api/participant/ranking?metric=recovery'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Participant not found.' })
  })
})
