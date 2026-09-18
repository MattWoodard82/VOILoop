// Read-only discovery script for test-account cleanup (item 3).
//
// Lists every auth account whose email matches the test-account pattern
// (see isTestAccountEmail), plus a per-account count of rows in the main
// participant-linked tables, so a human can review and approve exactly which
// emails should be deleted BEFORE any delete script is written or run.
//
// This script performs NO writes/deletes. Run it with:
//   npx ts-node --project tsconfig.json src/lib/list-test-accounts.ts
// or via the `admin:list-test-accounts` npm script.
import dotenv from 'dotenv'
import { createAdminSupabaseClient } from './supabase/admin'
import { isTestAccountEmail } from './test-accounts'

dotenv.config({ path: '.env.local' })

interface ListUsersResult {
  data: { users?: Array<{ id: string; email?: string | null; created_at?: string }> } | null
  error: { message: string } | null
}

interface ParticipantRow {
  id: string
  auth_user_id: string | null
  first_name: string | null
  last_name: string | null
  employee_id: string | null
}

// Tables keyed by participant_id whose row counts are useful context when
// deciding which test account to keep and which to remove.
const PARTICIPANT_LINKED_TABLES = [
  'daily_wellness',
  'workouts',
  'habits',
  'pulse_surveys',
  'interventions',
  'challenge_participants',
  'upload_batches',
  'nudge_acknowledgements',
  'login_activity',
] as const

async function listAllAuthUsers() {
  const adminClient = createAdminSupabaseClient()
  const users: Array<{ id: string; email: string; created_at?: string }> = []
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 }) as ListUsersResult
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`)
    }

    const pageUsers = data?.users ?? []
    for (const user of pageUsers) {
      if (user.email) {
        users.push({ id: user.id, email: user.email, created_at: user.created_at })
      }
    }

    if (pageUsers.length < 1000) {
      break
    }
    page += 1
  }

  return { adminClient, users }
}

async function countRows(adminClient: ReturnType<typeof createAdminSupabaseClient>, table: string, participantId: string): Promise<number> {
  const { count, error } = await adminClient
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('participant_id', participantId)

  if (error) {
    // Some tables may not exist in every environment (e.g. optional migrations
    // not yet applied) — treat as zero rather than failing the whole report.
    console.warn(`Warning: could not count ${table} for participant ${participantId}: ${error.message}`)
    return 0
  }
  return count ?? 0
}

async function main() {
  const { adminClient, users } = await listAllAuthUsers()
  const testUsers = users.filter(u => isTestAccountEmail(u.email))

  if (testUsers.length === 0) {
    console.log('No test accounts found (no emails matching the test-account pattern).')
    return
  }

  console.log(`Found ${testUsers.length} test account(s):\n`)

  const rows: Array<{
    email: string
    authUserId: string
    createdAt: string
    participantId: string | null
    employeeId: string | null
    name: string | null
    dataCounts: Record<string, number>
    totalRows: number
  }> = []

  for (const user of testUsers) {
    const { data: participant, error: participantError } = await adminClient
      .from('participants')
      .select('id, auth_user_id, first_name, last_name, employee_id')
      .eq('auth_user_id', user.id)
      .maybeSingle() as { data: ParticipantRow | null, error: { message: string } | null }

    if (participantError) {
      console.warn(`Warning: could not look up participant for ${user.email}: ${participantError.message}`)
    }

    const dataCounts: Record<string, number> = {}
    let totalRows = 0

    if (participant?.id) {
      for (const table of PARTICIPANT_LINKED_TABLES) {
        const count = await countRows(adminClient, table, participant.id)
        dataCounts[table] = count
        totalRows += count
      }
    }

    rows.push({
      email: user.email,
      authUserId: user.id,
      createdAt: user.created_at ?? 'unknown',
      participantId: participant?.id ?? null,
      employeeId: participant?.employee_id ?? null,
      name: participant ? `${participant.first_name ?? ''} ${participant.last_name ?? ''}`.trim() || null : null,
      dataCounts,
      totalRows,
    })
  }

  // Sort oldest-first: the longest-standing test account is the conventional
  // "keeper" candidate, but the final decision is the user's.
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  for (const row of rows) {
    console.log(`- ${row.email}`)
    console.log(`    auth_user_id:   ${row.authUserId}`)
    console.log(`    created_at:     ${row.createdAt}`)
    console.log(`    participant_id: ${row.participantId ?? '(no participant row)'}`)
    console.log(`    employee_id:    ${row.employeeId ?? 'n/a'}`)
    console.log(`    name:           ${row.name ?? 'n/a'}`)
    console.log(`    data rows:      ${row.totalRows} total (${Object.entries(row.dataCounts).map(([t, c]) => `${t}=${c}`).join(', ') || 'no participant row'})`)
    console.log('')
  }

  console.log('--- SUMMARY ---')
  console.log(`Total test accounts found: ${rows.length}`)
  console.log(`Emails: ${rows.map(r => r.email).join(', ')}`)
  console.log('\nThis script made NO changes. Review this list and confirm which single account to KEEP')
  console.log('before any deletion script is written or run.')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Test account discovery failed: ${message}`)
  process.exit(1)
})
