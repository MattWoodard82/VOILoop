import dotenv from 'dotenv'
import { createAdminSupabaseClient } from './supabase/admin'
import { provisionSupabaseAccount } from './supabase/provision-account'

dotenv.config({ path: '.env.local' })

async function bootstrapAdmin() {
  const adminEmail = process.env.PILOT_ADMIN_EMAIL ?? 'admin@voiloop.local'
  const adminPassword = process.env.PILOT_ADMIN_PASSWORD ?? 'Admin1234'

  if (adminPassword.length < 8) {
    throw new Error('PILOT_ADMIN_PASSWORD must be at least 8 characters long.')
  }

  const adminClient = createAdminSupabaseClient()
  const result = await provisionSupabaseAccount({
    adminClient,
    email: adminEmail,
    password: adminPassword,
    role: 'admin',
    mustChangePassword: false,
  })

  const { data: accessRow, error: accessError } = await adminClient
    .from('user_access')
    .select('role, must_change_password')
    .eq('user_id', result.userId)
    .maybeSingle()

  if (accessError) {
    throw new Error(`Failed to verify user_access for admin: ${accessError.message}`)
  }

  if (!accessRow || accessRow.role !== 'admin' || accessRow.must_change_password !== false) {
    throw new Error('Admin bootstrap did not produce required user_access values.')
  }

  if (result.status === 'created') {
    console.log(`Created new admin user: ${adminEmail}`)
  } else {
    console.log(`Updated existing admin user: ${adminEmail}`)
  }
  console.log('Admin access granted.')
}

bootstrapAdmin().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Admin bootstrap failed: ${message}`)
  process.exit(1)
})
