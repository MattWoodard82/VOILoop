import { isTestAccountEmail } from '../test-accounts'

describe('isTestAccountEmail', () => {
  test.each([
    'test1@user.com',
    'test23@user.com',
    'TEST9@USER.COM',
    'Test0@User.Com',
    'test1@example.org',
  ])('matches pilot/test account email %s', (email) => {
    expect(isTestAccountEmail(email)).toBe(true)
  })

  test.each([
    'testing@user.com',
    'contest1@user.com',
    'test@user.com',
    'atest1@user.com',
    'test1user.com',
    'test1x@user.com',
    'real.person@user.com',
    '',
  ])('does not match non-pilot email %s', (email) => {
    expect(isTestAccountEmail(email)).toBe(false)
  })

  test('trims surrounding whitespace before matching', () => {
    expect(isTestAccountEmail('  test1@user.com  ')).toBe(true)
  })
})
