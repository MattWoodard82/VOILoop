import { DEFAULT_ENGAGEMENT_WEIGHTS, normalizeEngagementWeights } from '../wellness-director-config'

describe('normalizeEngagementWeights', () => {
  test('returns a well-formed FR-13 weights object unchanged', () => {
    const weights = {
      submission_consistency: 30,
      device_wear_consistency: 25,
      pulse_completion: 15,
      nudge_response: 10,
      workout_volume: 20,
    }
    expect(normalizeEngagementWeights(weights)).toEqual(weights)
  })

  test('tolerates float noise in the total (e.g. 33.33 * 3)', () => {
    const weights = {
      submission_consistency: 33.34,
      device_wear_consistency: 33.33,
      pulse_completion: 33.33,
      nudge_response: 0,
      workout_volume: 0,
    }
    expect(normalizeEngagementWeights(weights)).toEqual(weights)
  })

  test('falls back to defaults for legacy/malformed shapes missing FR-13 keys', () => {
    expect(normalizeEngagementWeights({ recovery: 40, hrv: 30, sleep: 20, debt: 10 })).toEqual(DEFAULT_ENGAGEMENT_WEIGHTS)
    expect(normalizeEngagementWeights(null)).toEqual(DEFAULT_ENGAGEMENT_WEIGHTS)
    expect(normalizeEngagementWeights(undefined)).toEqual(DEFAULT_ENGAGEMENT_WEIGHTS)
    expect(normalizeEngagementWeights('not an object')).toEqual(DEFAULT_ENGAGEMENT_WEIGHTS)
  })

  test('falls back to defaults when a weight is negative', () => {
    expect(
      normalizeEngagementWeights({
        submission_consistency: -10,
        device_wear_consistency: 40,
        pulse_completion: 30,
        nudge_response: 20,
        workout_volume: 20,
      }),
    ).toEqual(DEFAULT_ENGAGEMENT_WEIGHTS)
  })

  test('falls back to defaults when a weight exceeds 100', () => {
    expect(
      normalizeEngagementWeights({
        submission_consistency: 150,
        device_wear_consistency: -50,
        pulse_completion: 0,
        nudge_response: 0,
        workout_volume: 0,
      }),
    ).toEqual(DEFAULT_ENGAGEMENT_WEIGHTS)
  })

  test('falls back to defaults when the total is not 100', () => {
    expect(
      normalizeEngagementWeights({
        submission_consistency: 10,
        device_wear_consistency: 10,
        pulse_completion: 10,
        nudge_response: 10,
        workout_volume: 10,
      }),
    ).toEqual(DEFAULT_ENGAGEMENT_WEIGHTS)
  })
})
