export const PULSE_BOOLEAN_FIELDS = ['confident_health', 'body_trending_good'] as const
export const PULSE_SCALE5_FIELDS = ['energy_level', 'rest_quality', 'stress_level', 'mental_wellbeing'] as const

const PROGRAM_SUPPORTED_OPTIONS = ['yes', 'neutral', 'no'] as const
const WHOOP_REVIEWED_OPTIONS = ['yes_regularly', 'yes_once', 'no'] as const
export const PHYSICAL_ACTIVITY_OPTIONS = [
  'fitness_center',
  'outside',
  'local_gym',
  'home_gym',
  'none',
] as const

export type ProgramSupportedValue = (typeof PROGRAM_SUPPORTED_OPTIONS)[number]
export type WhoopReviewedValue = (typeof WHOOP_REVIEWED_OPTIONS)[number]
export type PhysicalActivityValue = (typeof PHYSICAL_ACTIVITY_OPTIONS)[number]

export interface PulseSubmissionPayload {
  confident_health?: boolean | null
  body_trending_good?: boolean | null
  energy_level?: number | null
  rest_quality?: number | null
  stress_level?: number | null
  physical_activity?: PhysicalActivityValue[] | null
  mental_wellbeing?: number | null
  program_supported?: ProgramSupportedValue | null
  whoop_reviewed?: WhoopReviewedValue | null
  health_flag?: string | null
}

export interface PulseSubmissionValidationResult {
  ok: boolean
  error?: string
  value?: PulseSubmissionPayload
}

const ALLOWED_KEYS = new Set<string>([
  ...PULSE_BOOLEAN_FIELDS,
  ...PULSE_SCALE5_FIELDS,
  'physical_activity',
  'program_supported',
  'whoop_reviewed',
  'health_flag',
])

export function validatePulseSubmissionPayload(input: unknown): PulseSubmissionValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Request body must be a JSON object.' }
  }

  const body = input as Record<string, unknown>
  const payload: PulseSubmissionPayload = {}
  let answeredCount = 0

  for (const [key, rawValue] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, error: `Unexpected field: ${key}` }
    }

    if (rawValue === null) {
      (payload as Record<string, null>)[key] = null
      continue
    }

    if ((PULSE_BOOLEAN_FIELDS as readonly string[]).includes(key)) {
      if (typeof rawValue !== 'boolean') {
        return { ok: false, error: `Field ${key} must be a boolean or null.` }
      }
      (payload as Record<string, boolean>)[key] = rawValue
      answeredCount += 1
      continue
    }

    if ((PULSE_SCALE5_FIELDS as readonly string[]).includes(key)) {
      if (typeof rawValue !== 'number' || !Number.isInteger(rawValue)) {
        return { ok: false, error: `Field ${key} must be an integer between 1 and 5 or null.` }
      }
      if (rawValue < 1 || rawValue > 5) {
        return { ok: false, error: `Field ${key} must be between 1 and 5.` }
      }
      (payload as Record<string, number>)[key] = rawValue
      answeredCount += 1
      continue
    }

    if (key === 'physical_activity') {
      if (!Array.isArray(rawValue)) {
        return { ok: false, error: 'Field physical_activity must be an array or null.' }
      }
      if (rawValue.length === 0) {
        payload.physical_activity = null
        continue
      }
      const validOptions = new Set<string>(PHYSICAL_ACTIVITY_OPTIONS)
      for (const item of rawValue) {
        if (typeof item !== 'string' || !validOptions.has(item)) {
          return { ok: false, error: `Invalid physical_activity value: ${item}` }
        }
      }
      payload.physical_activity = rawValue as PhysicalActivityValue[]
      answeredCount += 1
      continue
    }

    if (key === 'program_supported') {
      if (!PROGRAM_SUPPORTED_OPTIONS.includes(rawValue as ProgramSupportedValue)) {
        return { ok: false, error: `Field program_supported must be one of: ${PROGRAM_SUPPORTED_OPTIONS.join(', ')}.` }
      }
      payload.program_supported = rawValue as ProgramSupportedValue
      answeredCount += 1
      continue
    }

    if (key === 'whoop_reviewed') {
      if (!WHOOP_REVIEWED_OPTIONS.includes(rawValue as WhoopReviewedValue)) {
        return { ok: false, error: `Field whoop_reviewed must be one of: ${WHOOP_REVIEWED_OPTIONS.join(', ')}.` }
      }
      payload.whoop_reviewed = rawValue as WhoopReviewedValue
      answeredCount += 1
      continue
    }

    if (key === 'health_flag') {
      if (typeof rawValue !== 'string') {
        return { ok: false, error: 'Field health_flag must be a string or null.' }
      }
      payload.health_flag = rawValue
      answeredCount += 1
      continue
    }
  }

  if (answeredCount === 0) {
    return { ok: false, error: 'At least one pulse response is required.' }
  }

  return { ok: true, value: payload }
}

export function buildPulseSurveyUpsertRecord(participantId: string, date: string, payload: PulseSubmissionPayload) {
  return {
    participant_id: participantId,
    date,
    confident_health: payload.confident_health ?? null,
    body_trending_good: payload.body_trending_good ?? null,
    energy_level: payload.energy_level ?? null,
    rest_quality: payload.rest_quality ?? null,
    stress_level: payload.stress_level ?? null,
    physical_activity: payload.physical_activity ?? null,
    mental_wellbeing: payload.mental_wellbeing ?? null,
    program_supported: payload.program_supported ?? null,
    whoop_reviewed: payload.whoop_reviewed ?? null,
    health_flag: payload.health_flag ?? null,
  }
}
