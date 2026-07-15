import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.auth.admin.listUsers()

  if (error) {
    return NextResponse.json({ id: null, error: error.message }, { status: 500 })
  }

  const user = data.users.find((u) => u.email === 'admin@voiloop.com')
  if (!user) {
    return NextResponse.json({ id: null })
  }

  return NextResponse.json({ id: user.id })
}
