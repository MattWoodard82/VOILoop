import { initials } from '../utils'

describe('initials', () => {
  test('returns both initials when both names are present', () => {
    expect(initials('Alice', 'Able')).toBe('AA')
  })

  test('returns a single initial when last name is blank', () => {
    expect(initials('Travis', '')).toBe('T')
  })

  test('returns a single initial when first name is blank', () => {
    expect(initials('', 'Rediske')).toBe('R')
  })

  test('falls back to U when both names are unusable', () => {
    expect(initials('   ', '  ')).toBe('U')
  })

  test('trims whitespace before deriving initials', () => {
    expect(initials('  Kyle ', ' Schuppan  ')).toBe('KS')
  })
})
