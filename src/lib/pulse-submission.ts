export const PULSE_SCORE_FIELDS = [
  'wellbeing_score',
  'burnout_score',
  'manager_support',
  'energy_score',
  'psych_safety',
  'workload_score',
  'work_life_balance',
  'recommend_score',
] as const

export type PulseScoreField = (typeof PULSE_SCORE_FIELDS)[number]

export type PulseSubmissionPayload = Partial<Record<PulseScoreField, number | null>>

export interface PulseSubmissionValidationResult {
  ok: boolean
  error?: string
  value?: PulseSubmissionPayload
}

export function validatePulseSubmissionPayload(input: unknown): PulseSubmissionValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Request body must be a JSON object.' }
  }

  const body = input as Record<string, unknown>
  const allowedKeys = new Set<string>(PULSE_SCORE_FIELDS)
  const payload: PulseSubmissionPayload = {}
  let answeredCount = 0

  for (const [key, rawValue] of Object.entries(body)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unexpected field: ${key}` }
    }

    if (rawValue === null) {
      payload[key as PulseScoreField] = null
      continue
    }

    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      return { ok: false, error: `Field ${key} must be a number between 1 and 10 or null.` }
    }

    if (rawValue < 1 || rawValue > 10) {
      return { ok: false, error: `Field ${key} must be between 1 and 10.` }
    }

    payload[key as PulseScoreField] = rawValue
    answeredCount += 1
  }

  if (answeredCount === 0) {
    return { ok: false, error: 'At least one pulse score is required.' }
  }

  return { ok: true, value: payload }
}

export function buildPulseSurveyUpsertRecord(participantId: string, date: string, payload: PulseSubmissionPayload) {
  return {
    participant_id: participantId,
    date,
    wellbeing_score: payload.wellbeing_score ?? null,
    burnout_score: payload.burnout_score ?? null,
    manager_support: payload.manager_support ?? null,
    energy_score: payload.energy_score ?? null,
    psych_safety: payload.psych_safety ?? null,
    workload_score: payload.workload_score ?? null,
    work_life_balance: payload.work_life_balance ?? null,
    recommend_score: payload.recommend_score ?? null,
  }
}
