import {
  assertPilotTarget,
  parseDeactivationOptions,
  selectPilotAccountsToDeactivate,
} from '../pilot-account-deactivation'

describe('pilot account deactivation safety', () => {
  test('preserves every required operational account by default', () => {
    const selected = selectPilotAccountsToDeactivate([
      { id: 'test-user', email: ' TEST1@USER.COM ' },
      { id: 'admin-user', email: 'admin@voiloop.com' },
      { id: 'hr-user', email: 'hr@voiloop.com' },
      { id: 'matt-user', email: 'matt@voiloop.com' },
      { id: 'owner-user', email: 'mattwoodard82@gmail.com' },
      { id: 'pilot-user', email: 'pilot@example.com' },
      { id: 'no-email', email: null },
    ])

    expect(selected.map(({ id }) => id)).toEqual(['pilot-user', 'no-email'])
  })

  test('adds extra preservation values to the required defaults', () => {
    const selected = selectPilotAccountsToDeactivate([
      { id: 'test-user', email: 'test1@user.com' },
      { id: 'admin-user', email: 'admin@voiloop.com' },
      { id: 'hr-user', email: 'hr@voiloop.com' },
      { id: 'matt-user', email: 'matt@voiloop.com' },
      { id: 'owner-user', email: 'mattwoodard82@gmail.com' },
      { id: 'custom-user', email: 'custom@voiloop.com' },
      { id: 'pilot-user', email: 'pilot@example.com' },
    ], [' CUSTOM@VOILOOP.COM '])

    expect(selected.map(({ id }) => id)).toEqual(['pilot-user'])
  })

  test('parses --preserve-email arguments', () => {
    const options = parseDeactivationOptions([
      '--confirm-project-ref',
      'pilotref123',
      '--preserve-email',
      'admin@voiloop.com',
      '--preserve-emails',
      'hr@voiloop.com,matt@voiloop.com',
    ])
    expect(options.preserveEmails).toEqual([
      'admin@voiloop.com',
      'hr@voiloop.com',
      'matt@voiloop.com',
    ])
  })

  test('requires an explicit project-ref confirmation for writes and probes', () => {
    expect(() => parseDeactivationOptions(['--apply', '--method', 'ban']))
      .toThrow('--apply and --verify-ban require --confirm-project-ref.')
    expect(parseDeactivationOptions([
      '--apply',
      '--method',
      'password-rotation',
      '--confirm-project-ref',
      'pilotref123',
    ])).toMatchObject({
      apply: true,
      method: 'password-rotation',
      confirmedProjectRef: 'pilotref123',
    })

  })

  test('refuses to deactivate accounts when the protected test login is missing', () => {
    expect(() => selectPilotAccountsToDeactivate([{ id: 'pilot', email: 'pilot@example.com' }]))
      .toThrow('Protected test1@user.com account is absent')
  })

  test('rejects environments and URLs that do not identify the exact pilot project', () => {
    expect(() => assertPilotTarget(
      'https://pilotref123.supabase.co',
      'demo',
      'pilotref123',
      'pilotref123'
    )).toThrow('Set VOILOOP_ENV=pilot')

    expect(() => assertPilotTarget(
      'https://otherref.supabase.co',
      'pilot',
      'pilotref123',
      'pilotref123'
    )).toThrow('does not match PILOT_SUPABASE_PROJECT_REF')

    expect(assertPilotTarget(
      'https://pilotref123.supabase.co',
      'pilot',
      'pilotref123',
      'pilotref123'
    )).toBe('pilotref123')
  })
})
