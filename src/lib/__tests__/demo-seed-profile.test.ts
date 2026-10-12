import { ADDITIONAL_DEMO_PARTICIPANTS, demoSeedDate } from '../demo-seed-profile'

describe('additional demo seed cohort', () => {
  test('supports a repeatable anchor and rejects malformed or impossible dates', () => {
    expect(demoSeedDate('2026-10-12')).toBe('2026-10-12')
    for (const date of ['', '2026-02-30', '10/12/2026', '2026-10-12T12:00:00Z']) {
      expect(() => demoSeedDate(date)).toThrow('DEMO_SEED_DATE must be a valid YYYY-MM-DD date.')
    }
  })

  test('adds 20 unique participants to the existing 10-person seed', () => {
    const ids = ADDITIONAL_DEMO_PARTICIPANTS.map(({ id }) => id)

    expect(ADDITIONAL_DEMO_PARTICIPANTS).toHaveLength(20)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(Array.from({ length: 20 }, (_, index) => `EMP${String(index + 11).padStart(3, '0')}`))
  })

  test('covers contrasting trends, sparse/stale/no wearable data, and new enrollees', () => {
    const participants = ADDITIONAL_DEMO_PARTICIPANTS
    const directions = new Set(participants.map(({ scenario }) => scenario.trendDirection))
    const dataPatterns = new Set(participants.map(({ scenario }) => scenario.wearableHistory))

    expect(directions).toEqual(new Set(['improving', 'declining', 'steady']))
    expect(dataPatterns).toEqual(new Set(['complete', 'sparse', 'none']))
    expect(participants.some(({ scenario }) => scenario.staleDays)).toBe(true)
    expect(participants.some(({ scenario }) => scenario.missingEveryNthDay)).toBe(true)
    expect(participants.some(({ daysEnrolledAgo }) => daysEnrolledAgo <= 14)).toBe(true)
    expect(participants.some(({ cohort }) => cohort === 'red-flag')).toBe(true)
    expect(participants.some(({ cohort }) => cohort === 'pulse-silent')).toBe(true)
  })
})
