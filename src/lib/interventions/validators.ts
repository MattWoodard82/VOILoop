export interface CreateInterventionInput {
  participant_id: string
  date_triggered: string
  trigger_metric: string
  trigger_value: string
  intervention_type: string
  assigned_to: string
  notes: string | null
}

export interface ValidationResult {
  ok: boolean
  details: string[]
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function normalizeCreateInterventionInput(body: unknown): CreateInterventionInput {
  const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {}

  return {
    participant_id: normalizeString(payload.participant_id),
    date_triggered: normalizeString(payload.date_triggered) || todayIsoDate(),
    trigger_metric: normalizeString(payload.trigger_metric),
    trigger_value: normalizeString(payload.trigger_value),
    intervention_type: normalizeString(payload.intervention_type),
    assigned_to: normalizeString(payload.assigned_to),
    notes: normalizeString(payload.notes) || null,
  }
}

export function validateCreateInterventionInput(input: CreateInterventionInput): ValidationResult {
  const details: string[] = []

  if (!input.participant_id) details.push('participant_id is required')
  if (!input.trigger_metric) details.push('trigger_metric is required')
  if (!input.trigger_value) details.push('trigger_value is required')
  if (!input.intervention_type) details.push('intervention_type is required')
  if (!input.assigned_to) details.push('assigned_to is required')
  if (!isIsoDate(input.date_triggered)) details.push('date_triggered must be YYYY-MM-DD')

  return { ok: details.length === 0, details }
}
