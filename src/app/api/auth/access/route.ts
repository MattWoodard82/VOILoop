import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSession, getUserAccess } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let access = await getUserAccess(session.user.id)
  if (!access.role) {
    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('user_access')
      .upsert({
        user_id: session.user.id,
        role: 'participant',
        must_change_password: true,
      }, { onConflict: 'user_id' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    access = await getUserAccess(session.user.id)
  }

  if (access.role === 'participant') {
    const adminClient = createAdminSupabaseClient()
    const { data: participantRow, error } = await adminClient
      .from('participants')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (participantRow?.id) {
      const { error: insertError } = await adminClient
        .from('login_activity')
        .insert({
          participant_id: participantRow.id,
          logged_in_at: new Date().toISOString(),
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }
  }

  const redirectTo = access.mustChangePassword
    ? '/change-password'
    : access.role === 'participant'
      ? '/my'
      : '/wellness-director'

  return NextResponse.json({
    success: true,
    role: access.role ?? 'participant',
    mustChangePassword: access.mustChangePassword,
    redirectTo,
  })
}
