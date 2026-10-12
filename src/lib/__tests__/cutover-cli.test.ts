import { spawnSync } from 'node:child_process'
import path from 'node:path'

describe('cutover CLI startup', () => {
  const cases = [
    ['refresh-demo-data.ts', 'Set VOILOOP_ENV=demo'],
    ['deactivate-pilot-accounts.ts', 'Set VOILOOP_ENV=pilot'],
    ['seed.ts', 'Refusing to seed when VOILOOP_ENV=production'],
    ['seed-team-health-score.ts', 'Refusing to seed when VOILOOP_ENV=production'],
    ['seed-nudge-responses.ts', 'Refusing to seed when VOILOOP_ENV=production'],
  ]

  test.each(cases)('%s loads and rejects an unsafe environment without network access', (script, expectedError) => {
    const result = spawnSync(process.execPath, [
      require.resolve('ts-node/dist/bin'),
      '--project', 'tsconfig.scripts.json',
      path.join('src', 'lib', script),
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 20000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: 'https://invalid-demo-target.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'validation-placeholder',
        VOILOOP_ENV: 'production',
        DEMO_SEED_DATE: '2026-10-12',
        NUDGE_RESPONSE_ENCRYPTION_KEY: 'validation-placeholder',
      },
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain(expectedError)
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
  }, 25000)

  test('bootstrap loads its shared provisioning helper before rejecting missing credentials', () => {
    const result = spawnSync(process.execPath, [
      require.resolve('ts-node/dist/bin'), '--project', 'tsconfig.scripts.json',
      path.join('src', 'lib', 'bootstrap-admin.ts'),
    ], {
      encoding: 'utf8',
      timeout: 20000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        PILOT_ADMIN_PASSWORD: 'validation-password',
      },
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }, 25000)
})
