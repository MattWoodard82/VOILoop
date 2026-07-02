import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const adminClient = createAdminSupabaseClient()
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const users = data.users ?? []
    const existing = users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (existing) return existing.id
    if (users.length < 1000) break
    page++
  }

  return null
}

async function bootstrapAdmin() {
  const adminEmail = process.env.PILOT_ADMIN_EMAIL ?? 'admin@voiloop.local'
  const adminPassword = process.env.PILOT_ADMIN_PASSWORD ?? 'Admin1234'

  if (adminPassword.length < 8) {
    throw new Error('PILOT_ADMIN_PASSWORD must be at least 8 characters long.')
  }

  const adminClient = createAdminSupabaseClient()
  let userId = await findUserIdByEmail(adminEmail)

  if (userId) {
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password: adminPassword,
      email_confirm: true,
    })
    if (error) throw error
    console.log(`Updated existing admin user: ${adminEmail}`)
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    })
    if (error || !data.user?.id) {
      throw new Error(error?.message ?? 'Failed to create admin user')
    }
    userId = data.user.id
    console.log(`Created new admin user: ${adminEmail}`)
  }

  const { error: accessError } = await adminClient
    .from('user_access')
    .upsert({
      user_id: userId,
      role: 'admin',
      must_change_password: false,
    }, { onConflict: 'user_id' })

  if (accessError) throw accessError
  console.log('Admin access granted.')
}

bootstrapAdmin().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Admin bootstrap failed: ${message}`)
  process.exit(1)
})
