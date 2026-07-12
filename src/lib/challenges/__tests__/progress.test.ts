import { recomputeActiveChallengeProgress } from '../progress'

describe('recomputeActiveChallengeProgress', () => {
  test('returns null when no active challenge exists', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'challenges') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const result = await recomputeActiveChallengeProgress(supabase as never)
    expect(result).toBeNull()
  })

  test('recomputes participant progress from workouts and marks completion once threshold is reached', async () => {
    const participantUpdates: Array<Array<Record<string, unknown>>> = []
    const auditEvents: Array<Record<string, unknown>> = []

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'challenges') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'challenge-1',
                    status: 'active',
                    threshold_value: 2,
                    window_start_at: '2026-07-01T00:00:00.000Z',
                    window_end_at: '2099-07-31T23:59:59.000Z',
                    version: 3,
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }

        if (table === 'challenge_participants') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    { id: 'p1', employee_id: 'EMP001', completed: false, updated_at: '2026-07-10T00:00:00.000Z' },
                    { id: 'p2', employee_id: 'EMP002', completed: false, updated_at: '2026-07-10T00:00:00.000Z' },
                  ],
                  error: null,
                }),
              }),
            }),
            upsert: (payload: Array<Record<string, unknown>>) => {
              participantUpdates.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'workouts') {
          return {
            select: () => ({
              gte: () => ({
                lte: async () => ({
                  data: [
                    { employee_id: 'EMP001', start_time: '2026-07-11T08:00:00.000Z' },
                    { employee_id: 'EMP001', start_time: '2026-07-12T08:00:00.000Z' },
                    { employee_id: 'EMP002', start_time: '2026-07-11T08:00:00.000Z' },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'challenge_audit_log') {
          return {
            insert: async (payload: Record<string, unknown>) => {
              auditEvents.push(payload)
              return { error: null }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const result = await recomputeActiveChallengeProgress(supabase as never, {
      source: 'event',
      batchId: 'batch-123',
    })

    expect(result).toMatchObject({
      challengeId: 'challenge-1',
      updatedParticipants: 2,
      finalized: false,
    })

    expect(participantUpdates).toHaveLength(1)
    expect(participantUpdates[0][0]).toMatchObject({
      progress_value: 2,
      completed: true,
      completion_source: 'event',
      completion_idempotency_key: 'challenge:challenge-1:employee:EMP001:completion',
    })
    expect(participantUpdates[0][1]).toMatchObject({
      progress_value: 1,
    })

    expect(auditEvents).toHaveLength(1)
    expect(auditEvents[0]).toMatchObject({
      action: 'recompute',
      context: expect.objectContaining({
        recompute_source: 'event',
        batch_id: 'batch-123',
        updated_participants: 2,
      }),
    })
  })
})
