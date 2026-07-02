import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getUserAccess } from '@/lib/supabase/server'

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
  let email = ''
  let password = ''

  if (wantsJson(request)) {
    let body: { email?: string; password?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    email = String(body.email ?? '').trim()
    password = String(body.password ?? '')
  } else {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form submission' }, { status: 400 })
    }
    email = String(formData.get('email') ?? '').trim()
    password = String(formData.get('password') ?? '')
  }

  if (!email || !password) {
    return jsonOrRedirect(request, { error: 'Email and password are required.' }, 400, '/login')
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return jsonOrRedirect(request, { error: error?.message ?? 'Sign-in failed.' }, 401, '/login')
  }

  const access = await getUserAccess(data.user.id)
  const redirectTo = access.mustChangePassword
    ? '/change-password'
    : !access.role || access.role === 'employee'
      ? '/my'
      : '/executive'

  return jsonOrRedirect(request, { success: true, redirectTo }, 200, redirectTo)
}
