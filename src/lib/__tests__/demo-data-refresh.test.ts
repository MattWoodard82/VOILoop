import {
  DEMO_REFRESH_CONFIRMATION_PHRASE,
  parseDemoRefreshOptions,
  selectAuthUsersToDelete,
} from '../demo-data-refresh'
import { assertSupabaseProjectTarget } from '../pilot-account-deactivation'

describe('demo data refresh safety', () => {
  test('requires project, destructive-action, and verified-backup confirmations', () => {
    expect(() => parseDemoRefreshOptions(['--apply', '--confirm-project-ref', 'demoref']))
      .toThrow('--apply requires --confirm-demo-refresh DELETE_PILOT_DATA.')

    expect(parseDemoRefreshOptions([
      '--apply',
      '--confirm-project-ref',
      'demoref',
      '--confirm-demo-refresh',
      DEMO_REFRESH_CONFIRMATION_PHRASE,
      '--backup-reference',
      'backup-2026-10-12',
    ])).toMatchObject({
      apply: true,
      confirmedProjectRef: 'demoref',
      confirmationPhrase: DEMO_REFRESH_CONFIRMATION_PHRASE,
      backupReference: 'backup-2026-10-12',
    })
  })

  test('only retains the designated test account and configured admin by default', () => {
    const toDelete = selectAuthUsersToDelete([
      { id: 'test', email: 'TEST1@USER.COM' },
      { id: 'admin', email: 'demo-admin@example.com' },
      { id: 'pilot', email: 'pilot@example.com' },
    ], ' Demo-Admin@example.com ')

    expect(toDelete.map(({ id }) => id)).toEqual(['pilot'])
  })

  test('retains additional specified accounts during refresh', () => {
    const toDelete = selectAuthUsersToDelete([
      { id: 'test', email: 'test1@user.com' },
      { id: 'admin', email: 'admin@voiloop.com' },
      { id: 'hr', email: 'hr@voiloop.com' },
      { id: 'matt', email: 'matt@voiloop.com' },
      { id: 'pilot', email: 'pilot@example.com' },
    ], 'admin@voiloop.com', ['hr@voiloop.com', 'matt@voiloop.com'])

    expect(toDelete.map(({ id }) => id)).toEqual(['pilot'])
  })

  test('parses --preserve-email arguments for demo refresh', () => {
    const options = parseDemoRefreshOptions([
      '--confirm-project-ref',
      'demoref',
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

  test('fails closed if the configured admin is absent', () => {
    expect(() => selectAuthUsersToDelete([
      { id: 'pilot', email: 'pilot@example.com' },
    ], 'admin@example.com')).toThrow('does not exist in this Supabase project')
  })

  test('only allows the explicitly selected demo project', () => {
    expect(assertSupabaseProjectTarget(
      'https://demoref.supabase.co',
      'demo',
      'demo',
      'demoref',
      'demoref'
    )).toBe('demoref')

    expect(() => assertSupabaseProjectTarget(
      'https://pilotref.supabase.co',
      'demo',
      'demo',
      'demoref',
      'demoref'
    )).toThrow('does not match DEMO_SUPABASE_PROJECT_REF')
  })

  test('refuses cleanup when the protected test login is missing', () => {
    expect(() => selectAuthUsersToDelete([
      { id: 'admin', email: 'admin@example.com' },
      { id: 'pilot', email: 'pilot@example.com' },
    ], 'admin@example.com')).toThrow('Protected test1@user.com account is absent')
  })
})
