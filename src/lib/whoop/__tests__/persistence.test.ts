import { deriveBatchStatus } from '../persistence'

describe('deriveBatchStatus', () => {
  test('returns completed when there are no failures', () => {
    expect(deriveBatchStatus({
      processed: 10,
      inserted: 8,
      updated: 2,
      skipped: 0,
      failed: 0,
    })).toBe('completed')
  })

  test('returns partial when there are mixed successes and failures', () => {
    expect(deriveBatchStatus({
      processed: 10,
      inserted: 4,
      updated: 1,
      skipped: 0,
      failed: 5,
    })).toBe('partial')
  })

  test('returns failed when all rows failed', () => {
    expect(deriveBatchStatus({
      processed: 10,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 10,
    })).toBe('failed')
  })
})
