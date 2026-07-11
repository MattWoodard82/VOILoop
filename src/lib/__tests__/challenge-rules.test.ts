import {
  buildCompletionIdempotencyKey,
  canActivateChallenge,
  canCancelChallenge,
  canEditFieldWhileActive,
  evaluateEligibility,
  normalizeEligibilityDefinition,
  validateChallengePayload,
} from '../challenge-rules'

describe('challenge rules', () => {
  test('builds idempotency keys in the expected format', () => {
    expect(buildCompletionIdempotencyKey('c1', 'e1')).toBe('challenge:c1:employee:e1:completion')
  })

  test('enforces challenge lifecycle state transitions', () => {
    expect(canActivateChallenge('draft')).toBe(true)
    expect(canActivateChallenge('active')).toBe(false)
    expect(canCancelChallenge('draft')).toBe(true)
    expect(canCancelChallenge('active')).toBe(true)
    expect(canCancelChallenge('completed')).toBe(false)
  })

  test('only allows name/description edits while active', () => {
    expect(canEditFieldWhileActive('name')).toBe(true)
    expect(canEditFieldWhileActive('description')).toBe(true)
    expect(canEditFieldWhileActive('threshold_value')).toBe(false)
  })

  test('normalizes filtered eligibility and rejects invalid tenure', () => {
    const normalized = normalizeEligibilityDefinition('filtered', {
      department_ids: ['ICU', ' ER '],
      employment_type: ['full_time', 'invalid', 'part_time'],
      min_tenure_days: 30,
    })
    expect(normalized).toEqual({
      department_ids: ['ICU', 'ER'],
      employment_type: ['full_time', 'part_time'],
      min_tenure_days: 30,
    })

    const invalid = normalizeEligibilityDefinition('filtered', { min_tenure_days: -1 })
    expect(invalid).toBeNull()
  })

  test('validates threshold and window requirements', () => {
    expect(validateChallengePayload({
      name: 'Q3 Challenge',
      metric_type: 'actions_count',
      threshold_value: 10,
      window_start_at: '2026-07-01T00:00:00.000Z',
      window_end_at: '2026-07-31T00:00:00.000Z',
      eligibility_mode: 'all_employees',
    })).toEqual({ ok: true })

    expect(validateChallengePayload({
      threshold_value: 0,
    })).toEqual({ ok: false, code: 'INVALID_THRESHOLD' })

    expect(validateChallengePayload({
      window_start_at: '2026-07-05T00:00:00.000Z',
      window_end_at: '2026-07-01T00:00:00.000Z',
    })).toEqual({ ok: false, code: 'INVALID_WINDOW' })
  })

  test('evaluates eligibility with AND semantics across fields', () => {
    const def = normalizeEligibilityDefinition('filtered', {
      department_ids: ['ICU'],
      min_tenure_days: 30,
    })
    expect(def).not.toBeNull()

    const eligible = evaluateEligibility(
      { department: 'ICU', enrolled_date: '2026-05-01' },
      'filtered',
      def,
      new Date('2026-07-10T00:00:00.000Z'),
    )
    expect(eligible).toEqual({ isEligible: true, reason: null })

    const ineligible = evaluateEligibility(
      { department: 'ER', enrolled_date: '2026-06-25' },
      'filtered',
      def,
      new Date('2026-07-10T00:00:00.000Z'),
    )
    expect(ineligible.isEligible).toBe(false)
  })
})
