import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSession, getUserAccess } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getUserAccess(session.user.id)
  const adminSupabase = createAdminSupabaseClient()
  const { error } = await adminSupabase
    .from('user_access')
    .upsert({
      user_id: session.user.id,
      role: access.role ?? 'employee',
      must_change_password: false,
    }, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
