import dotenv from 'dotenv'
import { createAdminSupabaseClient } from './supabase/admin'
import {
  DEMO_REFRESH_CONFIRMATION_PHRASE,
  parseDemoRefreshOptions,
  selectAuthUsersToDelete,
} from './demo-data-refresh'
import {
  assertSupabaseProjectTarget,
  normalizeEmail,
  PRESERVED_PILOT_ACCOUNT_EMAILS,
  PRESERVED_TEST_ACCOUNT_EMAIL,
  type PilotAuthUser,
} from './pilot-account-deactivation'

dotenv.config({ path: '.env.local' })

const DATA_TABLES = [
  'participants',
  'daily_wellness',
  'workouts',
  'habits',
  'pulse_surveys',
  'interventions',
  'challenges',
  'challenge_participants',
  'challenge_audit_log',
  'events',
  'event_rsvps',
  'weekly_nudges',
  'nudge_targets',
  'nudge_acknowledgements',
  'engagement_nudge_responses',
  'engagement_nudge_targets',
  'login_activity',
  'risk_flags',
  'leaderboard_metric_snapshots',
  'import_logs',
  'import_row_outcomes',
  'upload_batches',
] as const

async function listAuthUsers(admin: ReturnType<typeof createAdminSupabaseClient>): Promise<PilotAuthUser[]> {
  const users: PilotAuthUser[] = []
  let page = 1

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Failed to list Auth users: ${error.message}`)
    const pageUsers = data.users ?? []
    users.push(...pageUsers)
    if (pageUsers.length < 1000) return users
    page += 1
  }
}

function countRows(admin: ReturnType<typeof createAdminSupabaseClient>, table: string) {
  return admin.from(table).select('*', { count: 'exact', head: true })
}

function requireEnvironment() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  const projectRef = assertSupabaseProjectTarget(
    supabaseUrl,
    process.env.VOILOOP_ENV,
    'demo',
    process.env.DEMO_SUPABASE_PROJECT_REF,
    options.confirmedProjectRef
  )
  const adminEmail = process.env.PILOT_ADMIN_EMAIL?.trim().toLowerCase() ?? ''
  if (!adminEmail) throw new Error('PILOT_ADMIN_EMAIL must identify the demo admin account to preserve.')
  if (adminEmail === PRESERVED_TEST_ACCOUNT_EMAIL) {
    throw new Error('PILOT_ADMIN_EMAIL cannot be the protected test account.')
  }
  return { projectRef, adminEmail }
}

const options = parseDemoRefreshOptions(process.argv.slice(2))

async function main() {
  const { projectRef, adminEmail } = requireEnvironment()
  const admin = createAdminSupabaseClient()
  const users = await listAuthUsers(admin)
  const extraPreservedFromEnv = (process.env.PILOT_PRESERVE_EMAILS ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
  const allPreservedEmails = Array.from(
    new Set([...options.preserveEmails, ...extraPreservedFromEnv])
  )
  const usersToDelete = selectAuthUsersToDelete(users, adminEmail, allPreservedEmails)
  const counts = await Promise.all(DATA_TABLES.map(async (table) => {
    const { count, error } = await countRows(admin, table)
    if (error) throw new Error(`Failed to count ${table} before refresh: ${error.message}`)
    return [table, count ?? 0] as const
  }))

  console.log(`Demo Supabase project: ${projectRef}`)
  console.log(`Protected accounts: ${PRESERVED_PILOT_ACCOUNT_EMAILS.join(', ')}`)
  console.log(`Preserved admin account: ${adminEmail}`)
  if (allPreservedEmails.length > 0) {
    console.log(`Additional preserved accounts: ${allPreservedEmails.join(', ')}`)
  }
  console.log(`Pilot Auth accounts scheduled for deletion: ${usersToDelete.length}`)
  for (const user of usersToDelete) {
    console.log(`- ${user.email ?? '(no email)'} (${user.id})`)
  }
  console.log('Existing row counts:')
  for (const [table, count] of counts) console.log(`- ${table}: ${count}`)
  if (!options.apply) {
    console.log('\nDry run only. No database rows or Auth accounts were changed.')
    console.log(`To apply, confirm a completed manual backup and run with --apply --confirm-project-ref ${projectRef} --confirm-demo-refresh ${DEMO_REFRESH_CONFIRMATION_PHRASE} --backup-reference <backup-id>.`)
    return
  }

  const { error: refreshError } = await admin.rpc('prepare_demo_data_refresh', {
    p_backup_reference: options.backupReference!,
  })
  if (refreshError) {
    throw new Error(`Database refresh was not applied: ${refreshError.message}`)
  }
  for (const table of DATA_TABLES) {
    const { count, error } = await countRows(admin, table)
    if (error) throw new Error(`Database cleanup completed, but verifying ${table} failed: ${error.message}`)
    if (count !== 0) throw new Error(`Database cleanup left ${count} rows in ${table}; stop and investigate before seeding.`)
  }
  console.log('Pilot data tables cleared transactionally by the refresh procedure.')

  let deletedUsers = 0
  for (const user of usersToDelete) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      throw new Error(
        `Database data was refreshed, but Auth account deletion stopped after ${deletedUsers}/${usersToDelete.length}; ` +
        `failed for ${user.email ?? user.id}: ${error.message}. Review the dry-run and rerun to continue.`
      )
    }
    deletedUsers += 1
  }

  console.log(`Removed ${deletedUsers} old pilot Auth accounts.`)
  console.log('Refresh RPC completed successfully.')
  console.log('Next: run npm run admin:bootstrap, then the approved demo seed commands.')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Demo data refresh failed: ${message}`)
  process.exit(1)
})
