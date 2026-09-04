/**
 * Integration-level tests for challenge lifecycle operations.
 *
 * These tests use mock Supabase clients to validate the full behavior of
 * challenge validation, state transitions, terminal-state protection,
 * and duplicate-event idempotency without requiring a live database.
 */
import {
  canActivateChallenge,
  canCancelChallenge,
  canEditFieldWhileActive,
  isTerminalChallengeStatus,
  validateChallengePayload,
  evaluateEligibility,
  buildCompletionIdempotencyKey,
  normalizeEligibilityDefinition,
} from '../../challenge-rules'
import { recomputeActiveChallengeProgress } from '../progress'

// ---------------------------------------------------------------------------
// State machine / transition tests
// ---------------------------------------------------------------------------

describe('challenge lifecycle state machine', () => {
  test('draft -> active transition is allowed', () => {
    expect(canActivateChallenge('draft')).toBe(true)
  })

  test('active -> active re-activation is rejected', () => {
    expect(canActivateChallenge('active')).toBe(false)
  })

  test('completed -> activate is rejected', () => {
    expect(canActivateChallenge('completed')).toBe(false)
  })

  test('cancelled -> activate is rejected', () => {
    expect(canActivateChallenge('cancelled')).toBe(false)
  })

  test('draft and active challenges can be cancelled', () => {
    expect(canCancelChallenge('draft')).toBe(true)
    expect(canCancelChallenge('active')).toBe(true)
  })

  test('terminal challenges cannot be cancelled', () => {
    expect(canCancelChallenge('completed')).toBe(false)
    expect(canCancelChallenge('cancelled')).toBe(false)
  })

  test('completed and cancelled are terminal states', () => {
    expect(isTerminalChallengeStatus('completed')).toBe(true)
    expect(isTerminalChallengeStatus('cancelled')).toBe(true)
    expect(isTerminalChallengeStatus('active')).toBe(false)
    expect(isTerminalChallengeStatus('draft')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Active-field edit restrictions
// ---------------------------------------------------------------------------

describe('active challenge field edit restrictions', () => {
  test('name and description are editable while active', () => {
    expect(canEditFieldWhileActive('name')).toBe(true)
    expect(canEditFieldWhileActive('description')).toBe(true)
  })

  test('immutable fields are locked while active', () => {
    const immutableFields = [
      'metric_type',
      'threshold_value',
      'window_start_at',
      'window_end_at',
      'eligibility_mode',
      'eligibility_definition',
    ] as Array<keyof import('../../challenge-rules').ChallengePayload>
    for (const field of immutableFields) {
      expect(canEditFieldWhileActive(field)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

describe('challenge payload validation', () => {
  const validBase = {
    name: 'Q3 Actions Challenge',
    metric_type: 'actions_count',
    threshold_value: 10,
    window_start_at: '2026-07-01T00:00:00.000Z',
    window_end_at: '2026-07-31T23:59:59.000Z',
    eligibility_mode: 'all_participants',
  } as const

  test('valid full payload passes', () => {
    expect(validateChallengePayload(validBase)).toEqual({ ok: true })
  })

  test('threshold must be a positive integer', () => {
    expect(validateChallengePayload({ threshold_value: 0 })).toMatchObject({ ok: false, code: 'INVALID_THRESHOLD' })
    expect(validateChallengePayload({ threshold_value: -5 })).toMatchObject({ ok: false, code: 'INVALID_THRESHOLD' })
    expect(validateChallengePayload({ threshold_value: 1.5 })).toMatchObject({ ok: false, code: 'INVALID_THRESHOLD' })
  })

  test('end window must be after start window', () => {
    expect(validateChallengePayload({
      window_start_at: '2026-07-31T00:00:00.000Z',
      window_end_at: '2026-07-01T00:00:00.000Z',
    })).toMatchObject({ ok: false, code: 'INVALID_WINDOW' })
  })

  test('equal start and end window is rejected', () => {
    expect(validateChallengePayload({
      window_start_at: '2026-07-01T00:00:00.000Z',
      window_end_at: '2026-07-01T00:00:00.000Z',
    })).toMatchObject({ ok: false, code: 'INVALID_WINDOW' })
  })

  test('name must be 3-120 characters', () => {
    expect(validateChallengePayload({ name: 'ab' })).toMatchObject({ ok: false, code: 'INVALID_NAME' })
    expect(validateChallengePayload({ name: 'a'.repeat(121) })).toMatchObject({ ok: false, code: 'INVALID_NAME' })
    expect(validateChallengePayload({ name: 'abc' })).toEqual({ ok: true })
  })

  test('unsupported metric type is rejected', () => {
    expect(validateChallengePayload({ metric_type: 'points_count' })).toMatchObject({ ok: false, code: 'INVALID_METRIC_TYPE' })
  })
})

// ---------------------------------------------------------------------------
// Eligibility evaluation
// ---------------------------------------------------------------------------

describe('eligibility evaluation', () => {
  test('all_participants mode makes everyone eligible', () => {
    const result = evaluateEligibility({}, 'all_participants', null)
    expect(result.isEligible).toBe(true)
  })

  test('filtered mode with no definition rejects', () => {
    const result = evaluateEligibility({}, 'filtered', null)
    expect(result.isEligible).toBe(false)
    expect(result.reason).toBe('missing_definition')
  })

  test('department filter uses OR semantics within field', () => {
    const def = normalizeEligibilityDefinition('filtered', { department_ids: ['ICU', 'ER'] })
    const icuEmployee = evaluateEligibility({ department: 'ICU' }, 'filtered', def)
    const erEmployee = evaluateEligibility({ department: 'ER' }, 'filtered', def)
    const otherEmployee = evaluateEligibility({ department: 'Finance' }, 'filtered', def)
    expect(icuEmployee.isEligible).toBe(true)
    expect(erEmployee.isEligible).toBe(true)
    expect(otherEmployee.isEligible).toBe(false)
  })

  test('criteria combine with AND semantics across fields', () => {
    const def = normalizeEligibilityDefinition('filtered', {
      department_ids: ['ICU'],
      employment_type: ['full_time'],
      min_tenure_days: 90,
    })
    // All criteria met
    const eligible = evaluateEligibility(
      { department: 'ICU', employment_type: 'full_time', enrolled_date: '2026-01-01' },
      'filtered',
      def,
      new Date('2026-07-01T00:00:00.000Z'),
    )
    expect(eligible.isEligible).toBe(true)

    // Wrong department
    const wrongDept = evaluateEligibility(
      { department: 'Finance', employment_type: 'full_time', enrolled_date: '2026-01-01' },
      'filtered',
      def,
      new Date('2026-07-01T00:00:00.000Z'),
    )
    expect(wrongDept.isEligible).toBe(false)
    expect(wrongDept.reason).toBe('department_mismatch')

    // Insufficient tenure
    const shortTenure = evaluateEligibility(
      { department: 'ICU', employment_type: 'full_time', enrolled_date: '2026-06-01' },
      'filtered',
      def,
      new Date('2026-07-01T00:00:00.000Z'),
    )
    expect(shortTenure.isEligible).toBe(false)
    expect(shortTenure.reason).toBe('tenure_below_minimum')
  })
})

// ---------------------------------------------------------------------------
// Idempotency key format
// ---------------------------------------------------------------------------

describe('completion idempotency key', () => {
  test('follows expected format', () => {
    const key = buildCompletionIdempotencyKey('challenge-abc', 'participant-xyz')
    expect(key).toBe('challenge:challenge-abc:participant:participant-xyz:completion')
  })

  test('is stable across calls with the same inputs', () => {
    const k1 = buildCompletionIdempotencyKey('c1', 'p1')
    const k2 = buildCompletionIdempotencyKey('c1', 'p1')
    expect(k1).toBe(k2)
  })
})

// ---------------------------------------------------------------------------
// Duplicate-event idempotency (recompute)
// ---------------------------------------------------------------------------

describe('duplicate event idempotency via recompute', () => {
  function buildSupabaseMock({
    challenge,
    participants,
    workouts,
  }: {
    challenge: Record<string, unknown>
    participants: Array<Record<string, unknown>>
    workouts: Array<Record<string, unknown>>
  }) {
    const participantUpdates: Array<Array<Record<string, unknown>>> = []
    const auditEvents: Array<Record<string, unknown>> = []

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'challenges') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: challenge, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
            }),
          }
        }
        if (table === 'challenge_participants') {
          return {
            select: () => ({ eq: () => ({ eq: async () => ({ data: participants, error: null }) }) }),
            upsert: (payload: Array<Record<string, unknown>>) => {
              participantUpdates.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }
        if (table === 'workouts') {
          return {
            select: () => ({ gte: () => ({ lte: () => ({ range: async () => ({ data: workouts, error: null }) }) }) }),
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

    return { supabase, participantUpdates, auditEvents }
  }

  test('already-completed participant is not double-completed on recompute', async () => {
    const { supabase, participantUpdates } = buildSupabaseMock({
      challenge: {
        id: 'ch-1',
        status: 'active',
        threshold_value: 2,
        window_start_at: '2026-07-01T00:00:00.000Z',
        window_end_at: '2099-07-31T23:59:59.000Z',
        version: 1,
      },
      participants: [
        // already completed
        { id: 'cp-1', participant_id: 'EMP001', progress_value: 3, completed: true, updated_at: null },
      ],
      workouts: [
        { participant_id: 'EMP001', start_time: '2026-07-11T08:00:00.000Z' },
        { participant_id: 'EMP001', start_time: '2026-07-12T08:00:00.000Z' },
        // duplicate / extra workout beyond threshold
        { participant_id: 'EMP001', start_time: '2026-07-13T08:00:00.000Z' },
      ],
    })

    await recomputeActiveChallengeProgress(supabase as never, { source: 'event' })

    const updates = participantUpdates.flat()
    const emp001Updates = updates.filter((u) => u.id === 'cp-1')
    expect(emp001Updates).toHaveLength(1)

    // completed flag must NOT be set again (already true, so we don't re-set it)
    expect(emp001Updates[0].completed).toBeUndefined()
    expect(emp001Updates[0].completed_at).toBeUndefined()
    expect(emp001Updates[0].completion_idempotency_key).toBeUndefined()
  })

  test('participant reaches threshold exactly on boundary and completes', async () => {
    const { supabase, participantUpdates } = buildSupabaseMock({
      challenge: {
        id: 'ch-2',
        status: 'active',
        threshold_value: 3,
        window_start_at: '2026-07-01T00:00:00.000Z',
        window_end_at: '2099-07-31T23:59:59.000Z',
        version: 1,
      },
      participants: [
        { id: 'cp-2', participant_id: 'EMP002', progress_value: 0, completed: false, updated_at: null },
      ],
      workouts: [
        { participant_id: 'EMP002', start_time: '2026-07-01T08:00:00.000Z' },
        { participant_id: 'EMP002', start_time: '2026-07-15T08:00:00.000Z' },
        { participant_id: 'EMP002', start_time: '2026-07-31T23:59:59.000Z' },
      ],
    })

    const result = await recomputeActiveChallengeProgress(supabase as never, { source: 'event' })
    expect(result?.updatedParticipants).toBe(1)

    const updates = participantUpdates.flat()
    const emp002 = updates.find((u) => u.id === 'cp-2')
    expect(emp002?.progress_value).toBe(3)
    expect(emp002?.completed).toBe(true)
    expect(emp002?.completion_idempotency_key).toBe('challenge:ch-2:participant:EMP002:completion')
  })

  test('participant below threshold does not get completion flag', async () => {
    const { supabase, participantUpdates } = buildSupabaseMock({
      challenge: {
        id: 'ch-3',
        status: 'active',
        threshold_value: 5,
        window_start_at: '2026-07-01T00:00:00.000Z',
        window_end_at: '2099-07-31T23:59:59.000Z',
        version: 1,
      },
      participants: [
        { id: 'cp-3', participant_id: 'EMP003', progress_value: 0, completed: false, updated_at: null },
      ],
      workouts: [
        { participant_id: 'EMP003', start_time: '2026-07-10T08:00:00.000Z' },
        { participant_id: 'EMP003', start_time: '2026-07-11T08:00:00.000Z' },
      ],
    })

    await recomputeActiveChallengeProgress(supabase as never)

    const updates = participantUpdates.flat()
    const emp003 = updates.find((u) => u.id === 'cp-3')
    expect(emp003?.progress_value).toBe(2)
    expect(emp003?.completed).toBeUndefined()
  })

  test('recompute never decrements progress below stored value (monotonic guarantee)', async () => {
    // Participant has progress_value=4 from a prior event-driven update.
    // The reconciliation window only finds 2 workouts (e.g. late-ingest gap).
    // The stored value must be preserved (max semantics).
    const { supabase, participantUpdates } = buildSupabaseMock({
      challenge: {
        id: 'ch-4',
        status: 'active',
        threshold_value: 5,
        window_start_at: '2026-07-01T00:00:00.000Z',
        window_end_at: '2099-07-31T23:59:59.000Z',
        version: 1,
      },
      participants: [
        // Stored value is 4 — higher than the 2 workouts we'll see in this recompute run
        { id: 'cp-4', participant_id: 'EMP004', progress_value: 4, completed: false, updated_at: '2026-07-12T00:00:00.000Z' },
      ],
      workouts: [
        { participant_id: 'EMP004', start_time: '2026-07-10T08:00:00.000Z' },
        { participant_id: 'EMP004', start_time: '2026-07-11T08:00:00.000Z' },
      ],
    })

    await recomputeActiveChallengeProgress(supabase as never, { source: 'scheduled_recompute' })

    const updates = participantUpdates.flat()
    const emp004 = updates.find((u) => u.id === 'cp-4')
    // Must retain stored value of 4, not overwrite with recomputed count of 2
    expect(emp004?.progress_value).toBe(4)
    expect(emp004?.completed).toBeUndefined()
  })
})
