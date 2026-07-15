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
