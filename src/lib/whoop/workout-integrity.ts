import type { WhoopWorkout } from './types'

export function workoutKey(row: Pick<WhoopWorkout, 'participant_id' | 'start_time'>): string {
  return `${row.participant_id}|${new Date(row.start_time).toISOString()}`
}

const METRIC_FIELDS = [
  'activity', 'duration_min', 'strain', 'calories', 'max_hr', 'avg_hr',
  'zone1_pct', 'zone2_pct', 'zone3_pct', 'zone4_pct', 'zone5_pct',
] as const

/** Evidence of a timezone-shifted copy, not authorization to delete either row. */
export function isTimezoneShiftedCopy(a: WhoopWorkout, b: WhoopWorkout): boolean {
  if (a.participant_id !== b.participant_id || !a.end_time || !b.end_time ||
    a.activity == null || a.duration_min == null || a.strain == null) return false

  const shift = Date.parse(b.start_time) - Date.parse(a.start_time)
  if (!Number.isFinite(shift) || shift === 0 ||
    Math.abs(shift) > 14 * 60 * 60_000 || shift % (15 * 60_000) !== 0) return false

  return Date.parse(b.end_time) - Date.parse(a.end_time) === shift &&
    METRIC_FIELDS.every((field) => a[field] === b[field])
}

export interface AuditWorkout extends WhoopWorkout {
  id: string
  source_batch_id: string | null
}

export function auditTimezoneShiftedWorkouts(rows: AuditWorkout[]) {
  const groups = new Map<string, AuditWorkout[]>()
  const pairs: Array<{
    workoutIds: [string, string]
    batchIds: [string | null, string | null]
    shiftMinutes: number
  }> = []

  for (const row of rows) {
    const signature = JSON.stringify([row.participant_id, ...METRIC_FIELDS.map((field) => row[field])])
    const candidates = groups.get(signature) ?? []
    for (const candidate of candidates) {
      if (isTimezoneShiftedCopy(candidate, row)) {
        pairs.push({
          workoutIds: [candidate.id, row.id],
          batchIds: [candidate.source_batch_id, row.source_batch_id],
          shiftMinutes: (Date.parse(row.start_time) - Date.parse(candidate.start_time)) / 60_000,
        })
      }
    }
    candidates.push(row)
    groups.set(signature, candidates)
  }
  return pairs
}
