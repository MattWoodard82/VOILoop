import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function wantsJson(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? ''
  return contentType.toLowerCase().includes('application/json')
}

function jsonOrRedirect(request: Request, body: Record<string, unknown>, status: number, redirectTo?: string) {
  if (wantsJson(request) || !redirectTo) {
    return NextResponse.json(body, { status })
  }
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return jsonOrRedirect(request, { error: 'Unauthorized' }, 401, '/login')
  }

  let password = ''

  if (wantsJson(request)) {
    let body: { password?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    password = String(body.password ?? '')
  } else {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form submission' }, { status: 400 })
    }
    password = String(formData.get('password') ?? '')
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  const access = await getUserAccess(session.user.id)
  const role = access.role ?? 'employee'
  const adminSupabase = createAdminSupabaseClient()
  const { error: accessError } = await adminSupabase
    .from('user_access')
    .upsert({
      user_id: session.user.id,
      role,
      must_change_password: false,
    }, { onConflict: 'user_id' })

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 })
  }

  const redirectTo = role === 'employee' ? '/my' : '/wellness-director'
  return jsonOrRedirect(request, { success: true, redirectTo }, 200, redirectTo)
}
