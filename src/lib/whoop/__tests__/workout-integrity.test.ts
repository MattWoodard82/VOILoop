import { auditTimezoneShiftedWorkouts, isTimezoneShiftedCopy, workoutKey, type AuditWorkout } from '../workout-integrity'

const legacy: AuditWorkout = {
  id: 'legacy', source_batch_id: 'september-24', participant_id: 'E1',
  date: '2026-07-02', start_time: '2026-07-02T08:00:00Z', end_time: '2026-07-02T09:00:00Z',
  activity: 'Run', duration_min: 60, strain: 4.7, calories: 300, max_hr: 160, avg_hr: 120,
  zone1_pct: 90, zone2_pct: 10, zone3_pct: 0, zone4_pct: 0, zone5_pct: 0,
}
const corrected: AuditWorkout = {
  ...legacy, id: 'corrected', source_batch_id: 'october-1',
  start_time: '2026-07-02T14:00:00+00:00', end_time: '2026-07-02T15:00:00+00:00',
}

test('normalizes Postgres and importer timestamp spellings to the same identity', () => {
  expect(workoutKey(corrected)).toBe(workoutKey({ ...corrected, start_time: '2026-07-02T14:00:00.000Z' }))
})

test('audits shifted copies without exposing raw metrics or mutating rows', () => {
  const rows = [legacy, corrected]
  const before = JSON.stringify(rows)
  expect(auditTimezoneShiftedWorkouts(rows)).toEqual([{
    workoutIds: ['legacy', 'corrected'], batchIds: ['september-24', 'october-1'], shiftMinutes: 360,
  }])
  expect(JSON.stringify(rows)).toBe(before)
})

test.each([
  { participant_id: 'E2' },
  { strain: 5 },
  { end_time: '2026-07-02T15:01:00Z' },
  { start_time: legacy.start_time, end_time: legacy.end_time },
  { end_time: null },
  { start_time: '2026-07-03T14:00:00Z', end_time: '2026-07-03T15:00:00Z' },
])('does not flag unrelated or insufficiently evidenced rows: %j', (override) => {
  expect(isTimezoneShiftedCopy(legacy, { ...corrected, ...override })).toBe(false)
})

test('supports negative and fractional-hour offsets', () => {
  expect(isTimezoneShiftedCopy(legacy, {
    ...corrected, start_time: '2026-07-02T02:30:00Z', end_time: '2026-07-02T03:30:00Z',
  })).toBe(true)
})
