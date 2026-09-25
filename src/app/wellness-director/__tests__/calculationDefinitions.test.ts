import { CALCULATION_DEFINITIONS } from '../calculationDefinitions'

describe('calculation detail definitions', () => {
  test('uses plain-language labels for every reported calculation field', () => {
    expect(Object.values(CALCULATION_DEFINITIONS).every((definition) => definition.whatItIs.length > 0)).toBe(true)
    expect(CALCULATION_DEFINITIONS.wellnessNights.label).toBe('Nights with wellness data')
    expect(CALCULATION_DEFINITIONS.usableWorkouts.label).toBe('Workouts with usable Zone 2+ data')
    expect(CALCULATION_DEFINITIONS.hrvScore.label).toBe('HRV trend score')
    expect(CALCULATION_DEFINITIONS.teamHealthScore.label).toBe('Team Health Score')
  })

  test('distinguishes raw HRV from the normalized HRV score', () => {
    expect(CALCULATION_DEFINITIONS.hrvAverage.whatItIs).toContain('milliseconds')
    expect(CALCULATION_DEFINITIONS.hrvScore.whatItIs).toContain('0–100')
    expect(CALCULATION_DEFINITIONS.hrvScore.whyItMatters).toContain('not raw HRV')
  })
})
