import { initials, normalizeParticipantDisplayName } from '../utils'

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

describe('normalizeParticipantDisplayName', () => {
  test('prefers full name when available', () => {
    expect(normalizeParticipantDisplayName({
      firstName: 'Chris',
      lastName: 'Simmons',
      username: 'csimmons',
      email: 'chris@example.com',
    })).toBe('Chris Simmons')
  })

  test('falls back to username when full name is missing', () => {
    expect(normalizeParticipantDisplayName({
      firstName: ' ',
      lastName: '',
      username: 'jrevis',
      email: 'jrevis@example.com',
    })).toBe('jrevis')
  })

  test('falls back to email local-part when full name and username are missing', () => {
    expect(normalizeParticipantDisplayName({
      firstName: '',
      lastName: '',
      username: '',
      email: 'nrevis@lylepearson.com',
    })).toBe('nrevis')
  })

  test('returns stable unknown label when all sources are missing', () => {
    expect(normalizeParticipantDisplayName({
      firstName: '',
      lastName: '',
      username: '',
      email: '',
    })).toBe('Unknown participant')
  })
})
