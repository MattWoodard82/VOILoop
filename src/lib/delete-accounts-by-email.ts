import dotenv from 'dotenv'
import { createAdminSupabaseClient } from './supabase/admin'

dotenv.config({ path: '.env.local' })

const DEFAULT_EMAILS = [
  'test1@user.com',
  'test2@user.com',
  'test3@user.com',
  'test4@user.com',
  'test5@user.com',
]

interface ListUsersResult {
  data: { users?: Array<{ id: string; email?: string | null }> } | null
  error: { message: string } | null
}

interface DeleteParticipantsResult {
  error: { message: string } | null
}

interface DeleteAuthUserResult {
  error: { message: string } | null
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function parseTargetEmails(argv: string[]): string[] {
  const fromArgs = argv.map(normalizeEmail).filter(Boolean)
  if (fromArgs.length > 0) {
    return Array.from(new Set(fromArgs))
  }

  return DEFAULT_EMAILS
}

async function listUsersByEmail() {
  const adminClient = createAdminSupabaseClient()
  const usersByEmail = new Map<string, string>()
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 }) as ListUsersResult
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`)
    }

    const users = data?.users ?? []
    for (const user of users) {
      if (user.email) {
        usersByEmail.set(normalizeEmail(user.email), user.id)
      }
    }

    if (users.length < 1000) {
      break
    }
    page += 1
  }

  return { adminClient, usersByEmail }
}

async function deleteAccountsByEmail(targetEmails: string[]) {
  const { adminClient, usersByEmail } = await listUsersByEmail()
  const missingEmails: string[] = []
  const userIdsToDelete: string[] = []

  for (const email of targetEmails) {
    const userId = usersByEmail.get(email)
    if (!userId) {
      missingEmails.push(email)
      continue
    }
    userIdsToDelete.push(userId)
  }

  if (missingEmails.length > 0) {
    console.log(`Not found in auth.users: ${missingEmails.join(', ')}`)
  }

  if (userIdsToDelete.length === 0) {
    console.log('No matching auth accounts to delete.')
    return
  }

  for (let i = 0; i < targetEmails.length; i++) {
    const email = targetEmails[i]
    const userId = usersByEmail.get(email)
    if (!userId) {
      continue
    }

    const { error: participantDeleteError } = await adminClient
      .from('participants')
      .delete()
      .eq('auth_user_id', userId) as DeleteParticipantsResult

    if (participantDeleteError) {
      throw new Error(`Failed to delete participant for ${email}: ${participantDeleteError.message}`)
    }

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId) as DeleteAuthUserResult
    if (authDeleteError) {
      throw new Error(`Failed to delete auth user ${email}: ${authDeleteError.message}`)
    }

    console.log(`Deleted account for ${email}`)
  }

  console.log('Done.')
}

const targetEmails = parseTargetEmails(process.argv.slice(2))

deleteAccountsByEmail(targetEmails).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Account deletion failed: ${message}`)
  process.exit(1)
})
