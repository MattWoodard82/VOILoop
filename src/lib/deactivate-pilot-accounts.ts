import { randomBytes, randomUUID } from 'node:crypto'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from './supabase/admin'
import {
  assertPilotTarget,
  normalizeEmail,
  parseDeactivationOptions,
  PILOT_ACCOUNT_BAN_DURATION,
  PRESERVED_TEST_ACCOUNT_EMAIL,
  selectPilotAccountsToDeactivate,
  type PilotAuthUser,
  type PilotDeactivationMethod,
} from './pilot-account-deactivation'

dotenv.config({ path: '.env.local' })

type AdminClient = ReturnType<typeof createAdminSupabaseClient>

async function listAuthUsers(admin: AdminClient): Promise<PilotAuthUser[]> {
  const allUsers: PilotAuthUser[] = []
  let page = 1

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Failed to list Auth users: ${error.message}`)

    const users = data?.users ?? []
    allUsers.push(...users)
    if (users.length < 1000) return allUsers
    page += 1
  }
}

async function verifyBanBehavior(supabaseUrl: string, anonKey: string, admin: AdminClient) {
  const email = `pilot-deactivation-check-${randomUUID()}@example.invalid`
  const password = randomBytes(32).toString('base64url')
  const createResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  const probeUserId = createResult.data?.user?.id
  if (createResult.error || !probeUserId) {
    throw new Error(`Could not create disposable Auth verification user: ${createResult.error?.message ?? 'No user returned'}`)
  }

  let cleanupError: string | null = null
  try {
    const probeClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const initialSignIn = await probeClient.auth.signInWithPassword({ email, password })
    const accessToken = initialSignIn.data.session?.access_token
    if (initialSignIn.error || !accessToken) {
      throw new Error(`Disposable account could not sign in before the ban test: ${initialSignIn.error?.message ?? 'No session returned'}`)
    }

    const banResult = await admin.auth.admin.updateUserById(probeUserId, {
      ban_duration: PILOT_ACCOUNT_BAN_DURATION,
    })
    const banApplied = !banResult.error

    const freshClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const postBanSignIn = await freshClient.auth.signInWithPassword({ email, password })
    const passwordSignInBlocked = Boolean(
      banApplied && postBanSignIn.error?.code === 'user_banned' && !postBanSignIn.data.session
    )
    if (postBanSignIn.error && postBanSignIn.error.code !== 'user_banned') {
      throw new Error(`Ban verification was inconclusive: ${postBanSignIn.error.message}`)
    }

    const sessionClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const existingSessionCheck = await sessionClient.auth.getUser(accessToken)
    const existingSessionBlocked = Boolean(existingSessionCheck.error || !existingSessionCheck.data.user)

    const revokeResult = await admin.auth.admin.signOut(accessToken, 'global')
    if (revokeResult.error) {
      console.warn(`Could not revoke the disposable test session: ${revokeResult.error.message}`)
    }

    console.log(`Auth ban applied to disposable account: ${banApplied ? 'yes' : 'no'}`)
    console.log(`New password sign-in blocked: ${passwordSignInBlocked ? 'yes' : 'no'}`)
    console.log(`Existing access token rejected: ${existingSessionBlocked ? 'yes' : 'no'}`)
    if (banResult.error) console.log(`Ban probe error: ${banResult.error.message}`)

    return { banApplied, passwordSignInBlocked, existingSessionBlocked }
  } finally {
    const { error } = await admin.auth.admin.deleteUser(probeUserId)
    if (error) cleanupError = error.message
    if (cleanupError) {
      throw new Error(`Disposable Auth probe cleanup failed for ${email}: ${cleanupError}`)
    }
  }
}

async function verifyPasswordRotationBehavior(supabaseUrl: string, anonKey: string, admin: AdminClient) {
  const email = `pilot-password-check-${randomUUID()}@example.invalid`
  const originalPassword = randomBytes(32).toString('base64url')
  const rotatedPassword = randomBytes(32).toString('base64url')
  const createResult = await admin.auth.admin.createUser({
    email,
    password: originalPassword,
    email_confirm: true,
  })
  const probeUserId = createResult.data?.user?.id
  if (createResult.error || !probeUserId) {
    throw new Error(`Could not create disposable password verification user: ${createResult.error?.message ?? 'No user returned'}`)
  }

  try {
    const probeClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const initialSignIn = await probeClient.auth.signInWithPassword({ email, password: originalPassword })
    const accessToken = initialSignIn.data.session?.access_token
    if (initialSignIn.error || !accessToken) {
      throw new Error(`Disposable account could not sign in before password rotation: ${initialSignIn.error?.message ?? 'No session returned'}`)
    }

    const rotateResult = await admin.auth.admin.updateUserById(probeUserId, { password: rotatedPassword })
    if (rotateResult.error) {
      throw new Error(`Could not rotate disposable account password: ${rotateResult.error.message}`)
    }

    const freshClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const oldPasswordSignIn = await freshClient.auth.signInWithPassword({ email, password: originalPassword })
    const oldPasswordBlocked = Boolean(
      oldPasswordSignIn.error?.code === 'invalid_credentials' && !oldPasswordSignIn.data.session
    )
    if (oldPasswordSignIn.error && oldPasswordSignIn.error.code !== 'invalid_credentials') {
      throw new Error(`Password-rotation verification was inconclusive: ${oldPasswordSignIn.error.message}`)
    }
    const rotatedSignIn = await freshClient.auth.signInWithPassword({ email, password: rotatedPassword })
    if (rotatedSignIn.error || !rotatedSignIn.data.session) {
      throw new Error(`Rotated-password sign-in verification failed: ${rotatedSignIn.error?.message ?? 'No session returned'}`)
    }

    const sessionClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const existingSessionCheck = await sessionClient.auth.getUser(accessToken)
    const existingSessionBlocked = Boolean(existingSessionCheck.error || !existingSessionCheck.data.user)

    const revokeResult = await admin.auth.admin.signOut(accessToken, 'global')
    if (revokeResult.error) {
      console.warn(`Could not revoke the disposable password test session: ${revokeResult.error.message}`)
    }

    console.log(`Password rotation blocks old-password sign-in: ${oldPasswordBlocked ? 'yes' : 'no'}`)
    console.log(`Existing access token rejected after rotation: ${existingSessionBlocked ? 'yes' : 'no'}`)
    return oldPasswordBlocked
  } finally {
    const { error } = await admin.auth.admin.deleteUser(probeUserId)
    if (error) {
      throw new Error(`Disposable password verification cleanup failed for ${email}: ${error.message}`)
    }
  }
}

function requireEnvironment() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  const projectRef = assertPilotTarget(
    supabaseUrl,
    process.env.VOILOOP_ENV,
    process.env.PILOT_SUPABASE_PROJECT_REF,
    parsedOptions.confirmedProjectRef
  )
  return { supabaseUrl, projectRef }
}

const parsedOptions = parseDeactivationOptions(process.argv.slice(2))

async function main() {
  const { supabaseUrl, projectRef } = requireEnvironment()
  const admin = createAdminSupabaseClient()

  if (parsedOptions.verifyBan || parsedOptions.apply) {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonKey) {
      throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required to verify the Auth ban behavior.')
    }
    const verification = await verifyBanBehavior(supabaseUrl, anonKey, admin)
    const passwordRotationBlocksSignIn = verification.passwordSignInBlocked
      ? false
      : await verifyPasswordRotationBehavior(supabaseUrl, anonKey, admin)

    if (parsedOptions.apply) {
      if (parsedOptions.method === 'ban' && !verification.passwordSignInBlocked) {
        throw new Error('Auth ban verification failed; use --method password-rotation for the approved fallback.')
      }
      if (parsedOptions.method === 'password-rotation' && verification.passwordSignInBlocked) {
        throw new Error('Auth ban verification succeeded; use --method ban instead of rotating passwords.')
      }
      if (parsedOptions.method === 'password-rotation' && !passwordRotationBlocksSignIn) {
        throw new Error('Password rotation verification failed; no pilot accounts were changed.')
      }
    }
    if (parsedOptions.verifyBan) return
  }

  const allUsers = await listAuthUsers(admin)
  const extraPreservedFromEnv = (process.env.PILOT_PRESERVE_EMAILS ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
  const allPreservedEmails = Array.from(
    new Set([...parsedOptions.preserveEmails, ...extraPreservedFromEnv])
  )
  const targets = selectPilotAccountsToDeactivate(allUsers, allPreservedEmails)
  console.log(`Pilot Supabase project: ${projectRef}`)
  console.log(`Protected account: ${PRESERVED_TEST_ACCOUNT_EMAIL}`)
  if (allPreservedEmails.length > 0) {
    console.log(`Additional preserved accounts: ${allPreservedEmails.join(', ')}`)
  }
  console.log(`Mode: ${parsedOptions.apply ? `APPLY (${parsedOptions.method})` : 'DRY RUN'}`)
  console.log(`Accounts to deactivate: ${targets.length}`)
  for (const user of targets) {
    console.log(`- ${user.email ?? '(no email)'} (${user.id})`)
  }

  if (!parsedOptions.apply) {
    console.log('\nNo accounts changed. To apply, rerun with --apply --method ban --confirm-project-ref <project-ref>.')
    return
  }
  if (targets.length === 0) {
    console.log('No pilot accounts to deactivate.')
    return
  }

  const targetIds = targets.map(({ id }) => id)
  const { data: accessRows, error: accessQueryError } = await admin
    .from('user_access')
    .select('user_id, role, must_change_password')
    .in('user_id', targetIds)
  if (accessQueryError) {
    throw new Error(`Failed to inspect user_access rows before deactivation: ${accessQueryError.message}`)
  }
  const existingAccessById = new Map((accessRows ?? []).map((row) => [row.user_id, row]))
  const inactiveAccessRows = targets.map(({ id }) => {
    const existing = existingAccessById.get(id)
    return {
      user_id: id,
      role: existing?.role ?? 'participant',
      must_change_password: existing?.must_change_password ?? true,
      is_active: false,
    }
  })
  const { error: accessError } = await admin
    .from('user_access')
    .upsert(inactiveAccessRows, { onConflict: 'user_id' })
  if (accessError) {
    throw new Error(`Failed to mark Auth accounts inactive in user_access: ${accessError.message}`)
  }

  const { error: participantError } = await admin
    .from('participants')
    .update({ status: 'Inactive' })
    .in('auth_user_id', targetIds)
  if (participantError) {
    throw new Error(`Failed to mark linked participants inactive: ${participantError.message}`)
  }

  let completed = 0
  for (const user of targets) {
    const attributes = parsedOptions.method === 'ban'
      ? { ban_duration: PILOT_ACCOUNT_BAN_DURATION }
      : { password: randomBytes(32).toString('base64url') }
    const { error } = await admin.auth.admin.updateUserById(user.id, attributes)
    if (error) {
      throw new Error(
        `Deactivation stopped after ${completed}/${targets.length} accounts; failed for ${user.email ?? user.id}: ${error.message}. ` +
        'Rerun the dry-run and apply command to safely continue.'
      )
    }
    completed += 1
  }

  console.log(`\nDeactivated ${completed} accounts. Participant data and Auth user rows were preserved.`)
  if (parsedOptions.method === 'password-rotation') {
    console.log('Passwords were replaced with random values and were not displayed or stored.')
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Pilot account deactivation failed: ${message}`)
  process.exit(1)
})
