import { isValidCalendarDateString } from '../date-validation'

describe('isValidCalendarDateString', () => {
  it('accepts a real calendar date', () => {
    expect(isValidCalendarDateString('2026-08-17')).toBe(true)
  })

  it('rejects an impossible calendar date that still matches the YYYY-MM-DD shape', () => {
    expect(isValidCalendarDateString('2026-02-31')).toBe(false)
  })

  it('rejects a non-date string', () => {
    expect(isValidCalendarDateString('not-a-date')).toBe(false)
  })

  it('rejects null/undefined/non-string input', () => {
    expect(isValidCalendarDateString(null)).toBe(false)
    expect(isValidCalendarDateString(undefined)).toBe(false)
    expect(isValidCalendarDateString(20260817)).toBe(false)
  })

  it('accepts a leap-day date on a leap year', () => {
    expect(isValidCalendarDateString('2024-02-29')).toBe(true)
  })

  it('rejects a leap-day date on a non-leap year', () => {
    expect(isValidCalendarDateString('2026-02-29')).toBe(false)
  })
})
