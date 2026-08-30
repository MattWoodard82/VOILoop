// Shared FR-13 (GH issue #66) engagement-score weight config helpers, used by both the
// admin config API route and the team-dashboard score calculation so the two stay in sync.

export interface EngagementWeights {
  submission_consistency: number
  device_wear_consistency: number
  pulse_completion: number
  nudge_response: number
  workout_volume: number
}

export const DEFAULT_ENGAGEMENT_WEIGHTS: EngagementWeights = {
  submission_consistency: 25,
  device_wear_consistency: 20,
  pulse_completion: 20,
  nudge_response: 15,
  workout_volume: 20,
}

const FR13_WEIGHT_KEYS = [
  'submission_consistency',
  'device_wear_consistency',
  'pulse_completion',
  'nudge_response',
  'workout_volume',
] as const

// A persisted config row may still hold the legacy {recovery, hrv, sleep, debt}
// shape from before this route switched to the FR-13 component keys. Normalize
// anything that isn't a complete, well-formed FR-13 weights object back to the
// defaults instead of surfacing stale legacy keys to the client (which would then
// show wrong labels, fail diagnostics, and reject on PUT).
export function normalizeEngagementWeights(rawWeights: unknown): EngagementWeights {
  if (!rawWeights || typeof rawWeights !== 'object') return DEFAULT_ENGAGEMENT_WEIGHTS
  const candidate = rawWeights as Record<string, unknown>
  const hasAllKeys = FR13_WEIGHT_KEYS.every((key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]))
  if (!hasAllKeys) return DEFAULT_ENGAGEMENT_WEIGHTS
  return {
    submission_consistency: candidate.submission_consistency as number,
    device_wear_consistency: candidate.device_wear_consistency as number,
    pulse_completion: candidate.pulse_completion as number,
    nudge_response: candidate.nudge_response as number,
    workout_volume: candidate.workout_volume as number,
  }
}
