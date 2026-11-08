import { DEMO_STORY_PARTICIPANTS, demoRecoveryScore, generateDemoStory, shiftDemoDate } from '../demo-story'

describe('demo pulse and recovery story', () => {
  test('later refreshes retain sparse coverage on overlapping persisted-enrollment dates', () => {
    const enrollment = { EMP019: '2026-07-22', EMP021: '2026-08-01', EMP028: '2026-08-26' }
    const first = generateDemoStory('2026-11-04', enrollment)
    const next = generateDemoStory('2026-11-05', enrollment)
    for (const id of Object.keys(enrollment)) {
      const dates = (story: typeof first) => story.recovery
        .filter(row => row.participant_id === id && row.date >= '2026-09-01' && row.date <= '2026-11-04')
        .map(row => row.date)
      expect(dates(next)).toEqual(dates(first))
    }
  })
  test.each(['2026-11-04', '2026-01-01', '2026-03-01', '2026-12-31', '2026-06-15'])(
    'has a visible monthly dip and rebound on %s using the Outcomes aggregation', anchor => {
      const story = generateDemoStory(anchor)
      const months: Record<string, Record<string, number>> = {}
      for (const row of story.recovery.sort((a, b) => a.date.localeCompare(b.date))) {
        const month = row.date.slice(0, 7)
        ;(months[month] ??= {})[row.participant_id] = row.recovery_score
      }
      const values = Object.values(months).map(scores => Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length)
      expect(values.length).toBeGreaterThanOrEqual(5)
      const trough = Math.min(...values.slice(1, -1))
      expect(values[0] - trough).toBeGreaterThan(3)
      expect(values.at(-1)! - trough).toBeGreaterThanOrEqual(10)
      const current = story.pulse.filter(row => row.date === anchor)
      expect(current.length).toBeGreaterThanOrEqual(20)
      expect(current.length).toBeLessThan(30)
      expect(current.some(row => row.health_flag)).toBe(true)
      expect(current.filter(row => row.program_supported === 'yes').length).toBeGreaterThan(current.length / 2)
    },
  )

  test('deterministically correlates responses with recovery without inventing device coverage', () => {
    const anchor = '2026-11-04'
    const story = generateDemoStory(anchor)
    expect(generateDemoStory(anchor)).toEqual(story)
    expect(new Set(story.recovery.map(row => `${row.participant_id}:${row.date}`)).size).toBe(story.recovery.length)
    const weeks = story.pulse.map(row => {
      const day = new Date(`${row.date}T00:00:00Z`).getUTCDay()
      return `${row.participant_id}:${shiftDemoDate(row.date, day === 0 ? -6 : 1 - day)}`
    })
    expect(new Set(weeks).size).toBe(story.pulse.length)
    for (const profile of DEMO_STORY_PARTICIPANTS) {
      const wellness = story.recovery.filter(row => row.participant_id === profile.id)
      const pulse = story.pulse.filter(row => row.participant_id === profile.id)
      const enrolled = shiftDemoDate(anchor, -profile.daysEnrolledAgo)
      expect([...wellness, ...pulse].every(row => row.date >= enrolled && row.date <= anchor)).toBe(true)
    }
    for (const id of ['EMP015', 'EMP030']) expect(story.recovery.some(row => row.participant_id === id)).toBe(false)
    for (const id of ['EMP017', 'EMP024']) expect(story.pulse.some(row => row.participant_id === id)).toBe(false)
    expect(story.recovery.filter(row => row.participant_id === 'EMP016')).toHaveLength(8)
    expect(story.recovery.filter(row => row.participant_id === 'EMP018').at(-1)?.date).toBe('2026-10-14')
    expect(story.recovery.filter(row => row.participant_id === 'EMP019').length).toBeLessThan(106)
    const trough = shiftDemoDate(anchor, -91)
    expect(demoRecoveryScore('EMP011', anchor, anchor)).toBeGreaterThan(demoRecoveryScore('EMP011', trough, anchor) + 20)
    const responses = story.pulse.filter(row => row.participant_id === 'EMP011')
    expect(responses[0].energy_level).toBeGreaterThan(responses.find(row => row.date === trough)!.energy_level!)
    expect(responses[0].stress_level).toBeLessThan(responses.find(row => row.date === trough)!.stress_level!)
    for (const row of story.pulse) {
      for (const value of [row.energy_level, row.rest_quality, row.stress_level, row.mental_wellbeing]) {
        expect(value).toBeGreaterThanOrEqual(1)
        expect(value).toBeLessThanOrEqual(5)
      }
    }
  })

  test('respects later persisted enrollment and rejects invalid anchors or unknown profiles', () => {
    const story = generateDemoStory('2026-11-04', { EMP011: '2026-11-02' })
    expect(story.recovery.filter(row => row.participant_id === 'EMP011')).toHaveLength(3)
    expect(story.pulse.filter(row => row.participant_id === 'EMP011')).toHaveLength(1)
    expect(() => generateDemoStory('2026-02-30')).toThrow()
    expect(() => demoRecoveryScore('real-person', '2026-11-04', '2026-11-04')).toThrow('Unknown demo participant')
  })
})
