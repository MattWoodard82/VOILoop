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
                    { id: 'p1', participant_id: 'EMP001', progress_value: 0, completed: false, updated_at: '2026-07-10T00:00:00.000Z' },
                    { id: 'p2', participant_id: 'EMP002', progress_value: 0, completed: false, updated_at: '2026-07-10T00:00:00.000Z' },
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
                lte: () => ({
                  range: async () => ({
                    data: [
                      { participant_id: 'EMP001', start_time: '2026-07-11T08:00:00.000Z' },
                      { participant_id: 'EMP001', start_time: '2026-07-12T08:00:00.000Z' },
                      { participant_id: 'EMP002', start_time: '2026-07-11T08:00:00.000Z' },
                    ],
                    error: null,
                  }),
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
      completion_idempotency_key: 'challenge:challenge-1:participant:EMP001:completion',
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

  test('recomputes device_wear_consistency progress from valid wear days in daily_wellness', async () => {
    const participantUpdates: Array<Array<Record<string, unknown>>> = []

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'challenges') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'challenge-wear-1',
                    status: 'active',
                    metric_type: 'device_wear_consistency',
                    threshold_value: 2,
                    window_start_at: '2026-07-01T00:00:00.000Z',
                    window_end_at: '2099-07-31T23:59:59.000Z',
                    version: 1,
                  },
                  error: null,
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
                    { id: 'p1', participant_id: 'EMP001', progress_value: 0, completed: false, updated_at: null },
                    { id: 'p2', participant_id: 'EMP002', progress_value: 0, completed: false, updated_at: null },
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

        if (table === 'daily_wellness') {
          return {
            select: () => ({
              gte: () => ({
                lte: () => ({
                  range: async () => ({
                    data: [
                      // EMP001: two valid wear days (both recovery_score and sleep_perf present)
                      { participant_id: 'EMP001', date: '2026-07-11', recovery_score: 60, sleep_perf: 80, sleep_hrs: null },
                      { participant_id: 'EMP001', date: '2026-07-12', recovery_score: 55, sleep_perf: 70, sleep_hrs: null },
                      // EMP001: incomplete day (missing both sleep fields) should not count
                      { participant_id: 'EMP001', date: '2026-07-13', recovery_score: 50, sleep_perf: null, sleep_hrs: null },
                      // EMP002: only one valid wear day, reported via sleep_hrs instead of sleep_perf
                      { participant_id: 'EMP002', date: '2026-07-11', recovery_score: 65, sleep_perf: null, sleep_hrs: 7.5 },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }

        if (table === 'challenge_audit_log') {
          return {
            insert: async () => ({ error: null }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const result = await recomputeActiveChallengeProgress(supabase as never, { source: 'scheduled_recompute' })

    expect(result).toMatchObject({
      challengeId: 'challenge-wear-1',
      updatedParticipants: 2,
      finalized: false,
    })

    const updates = participantUpdates.flat()
    const emp001 = updates.find((u) => u.id === 'p1')
    const emp002 = updates.find((u) => u.id === 'p2')

    expect(emp001).toMatchObject({ progress_value: 2, completed: true })
    expect(emp002).toMatchObject({ progress_value: 1 })
    expect(emp002?.completed).toBeUndefined()
  })
})
