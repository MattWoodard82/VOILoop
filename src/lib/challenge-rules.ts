export type ChallengeStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type ChallengeMetricType = 'actions_count'
export type ChallengeEligibilityMode = 'all_employees' | 'filtered'
export type ChallengeCompletionSource = 'event' | 'scheduled_recompute' | 'manual_repair'
export type ChallengeAuditAction = 'create' | 'update' | 'activate' | 'cancel' | 'complete' | 'recompute' | 'repair'

export interface ChallengeEligibilityDefinition {
  department_ids?: string[]
  location_ids?: string[]
  employment_type?: Array<'full_time' | 'part_time' | 'contractor'>
  min_tenure_days?: number
}

export interface ChallengePayload {
  name: string
  description?: string | null
  metric_type: ChallengeMetricType
  threshold_value: number
  window_start_at: string
  window_end_at: string
  eligibility_mode: ChallengeEligibilityMode
  eligibility_definition?: ChallengeEligibilityDefinition | null
}

interface RuleEvaluationEmployee {
  department?: string | null
  location_id?: string | null
  employment_type?: string | null
  enrolled_date?: string | null
}

export function buildCompletionIdempotencyKey(challengeId: string, employeeId: string): string {
  return `challenge:${challengeId}:employee:${employeeId}:completion`
}

export function isTerminalChallengeStatus(status: ChallengeStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

export function canActivateChallenge(status: ChallengeStatus): boolean {
  return status === 'draft'
}

export function canCancelChallenge(status: ChallengeStatus): boolean {
  return status === 'draft' || status === 'active'
}

export function canEditFieldWhileActive(field: keyof ChallengePayload): boolean {
  return field === 'name' || field === 'description'
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
  return normalized.length ? normalized : null
}

function normalizeEmploymentTypes(value: unknown): Array<'full_time' | 'part_time' | 'contractor'> | null {
  if (!Array.isArray(value)) return null
  const allowed = new Set(['full_time', 'part_time', 'contractor'])
  const normalized = value
    .map((item) => String(item ?? '').trim())
    .filter((item): item is 'full_time' | 'part_time' | 'contractor' => allowed.has(item))
  return normalized.length ? normalized : null
}

export function normalizeEligibilityDefinition(
  mode: ChallengeEligibilityMode,
  rawDefinition: unknown,
): ChallengeEligibilityDefinition | null {
  if (mode === 'all_employees') return null
  if (!rawDefinition || typeof rawDefinition !== 'object') return null

  const source = rawDefinition as Record<string, unknown>
  const departmentIds = normalizeStringArray(source.department_ids)
  const locationIds = normalizeStringArray(source.location_ids)
  const employmentTypes = normalizeEmploymentTypes(source.employment_type)
  const minTenureDays =
    source.min_tenure_days === undefined || source.min_tenure_days === null
      ? undefined
      : Number(source.min_tenure_days)

  if (minTenureDays !== undefined && (!Number.isInteger(minTenureDays) || minTenureDays < 0)) {
    return null
  }

  const normalized: ChallengeEligibilityDefinition = {}
  if (departmentIds) normalized.department_ids = departmentIds
  if (locationIds) normalized.location_ids = locationIds
  if (employmentTypes) normalized.employment_type = employmentTypes
  if (minTenureDays !== undefined) normalized.min_tenure_days = minTenureDays
  return normalized
}

interface LooseChallengePayload {
  name?: unknown
  description?: unknown
  metric_type?: unknown
  threshold_value?: unknown
  window_start_at?: unknown
  window_end_at?: unknown
  eligibility_mode?: unknown
  eligibility_definition?: unknown
}

export function validateChallengePayload(payload: LooseChallengePayload): { ok: true } | { ok: false; code: string } {
  if (payload.name !== undefined) {
    const name = String(payload.name).trim()
    if (name.length < 3 || name.length > 120) return { ok: false, code: 'INVALID_NAME' }
  }

  if (payload.description !== undefined && payload.description !== null) {
    if (String(payload.description).length > 1000) return { ok: false, code: 'INVALID_DESCRIPTION' }
  }

  if (payload.metric_type !== undefined && String(payload.metric_type) !== 'actions_count') {
    return { ok: false, code: 'INVALID_METRIC_TYPE' }
  }

  if (payload.threshold_value !== undefined) {
    const thresholdValue = Number(payload.threshold_value)
    if (!Number.isInteger(thresholdValue) || thresholdValue <= 0) {
      return { ok: false, code: 'INVALID_THRESHOLD' }
    }
  }

  if (payload.window_start_at !== undefined || payload.window_end_at !== undefined) {
    if (!payload.window_start_at || !payload.window_end_at) {
      return { ok: false, code: 'INVALID_WINDOW' }
    }
    const start = new Date(String(payload.window_start_at))
    const end = new Date(String(payload.window_end_at))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return { ok: false, code: 'INVALID_WINDOW' }
    }
  }

  if (payload.eligibility_mode !== undefined) {
    if (String(payload.eligibility_mode) !== 'all_employees' && String(payload.eligibility_mode) !== 'filtered') {
      return { ok: false, code: 'INVALID_ELIGIBILITY' }
    }
  }

  if (String(payload.eligibility_mode) === 'filtered' && payload.eligibility_definition === undefined) {
    return { ok: false, code: 'INVALID_ELIGIBILITY' }
  }

  return { ok: true }
}

function tenureDays(enrolledDate: string, referenceDate: Date): number {
  const start = new Date(enrolledDate)
  if (Number.isNaN(start.getTime())) return -1
  const ms = referenceDate.getTime() - start.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

export function evaluateEligibility(
  employee: RuleEvaluationEmployee,
  mode: ChallengeEligibilityMode,
  definition: ChallengeEligibilityDefinition | null,
  referenceDate: Date = new Date(),
): { isEligible: boolean; reason: string | null } {
  if (mode === 'all_employees') return { isEligible: true, reason: null }
  if (!definition) return { isEligible: false, reason: 'missing_definition' }

  if (definition.department_ids?.length) {
    const department = employee.department?.trim()
    if (!department || !definition.department_ids.includes(department)) {
      return { isEligible: false, reason: 'department_mismatch' }
    }
  }

  if (definition.location_ids?.length) {
    const locationId = employee.location_id?.trim()
    if (!locationId || !definition.location_ids.includes(locationId)) {
      return { isEligible: false, reason: 'location_mismatch' }
    }
  }

  if (definition.employment_type?.length) {
    const employmentType = employee.employment_type?.trim() as 'full_time' | 'part_time' | 'contractor' | undefined
    if (!employmentType || !definition.employment_type.includes(employmentType)) {
      return { isEligible: false, reason: 'employment_type_mismatch' }
    }
  }

  if (definition.min_tenure_days !== undefined) {
    if (!employee.enrolled_date) return { isEligible: false, reason: 'missing_enrolled_date' }
    const days = tenureDays(employee.enrolled_date, referenceDate)
    if (days < definition.min_tenure_days) {
      return { isEligible: false, reason: 'tenure_below_minimum' }
    }
  }

  return { isEligible: true, reason: null }
}
