import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type ChangePasswordErrorBody = {
  error: string
  code: string
  detail?: string
  source: 'backend'
  requestId: string
}

function wantsJson(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? ''
  return contentType.toLowerCase().includes('application/json')
}

function getRequestId(request: Request): string {
  return request.headers.get('x-vercel-id') ?? crypto.randomUUID()
}

function buildErrorBody(request: Request, code: string, error: string, detail?: string): ChangePasswordErrorBody {
  return {
    error,
    code,
    detail,
    source: 'backend',
    requestId: getRequestId(request),
  }
}

function jsonOrRedirect(request: Request, body: Record<string, unknown>, status: number, redirectTo?: string) {
  if (wantsJson(request) || !redirectTo) {
    return NextResponse.json(body, { status })
  }
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 })
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return jsonOrRedirect(
        request,
        buildErrorBody(request, 'UNAUTHORIZED', 'Unauthorized', 'No authenticated session was found.'),
        401,
        '/login'
      )
    }

    let password = ''

    if (wantsJson(request)) {
      let body: { password?: string }
      try {
        body = await request.json()
      } catch {
        return NextResponse.json(
          buildErrorBody(request, 'INVALID_REQUEST_BODY', 'Invalid request body', 'Request body must be valid JSON with a password field.'),
          { status: 400 }
        )
      }
      password = String(body.password ?? '')
    } else {
      let formData: FormData
      try {
        formData = await request.formData()
      } catch {
        return NextResponse.json(
          buildErrorBody(request, 'INVALID_FORM_SUBMISSION', 'Invalid form submission', 'Form data could not be parsed on the server.'),
          { status: 400 }
        )
      }
      password = String(formData.get('password') ?? '')
    }

    if (password.length < 8) {
      return NextResponse.json(
        buildErrorBody(request, 'PASSWORD_TOO_SHORT', 'Password must be at least 8 characters.'),
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      return NextResponse.json(
        buildErrorBody(request, 'PASSWORD_UPDATE_FAILED', updateError.message),
        { status: 400 }
      )
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
      return NextResponse.json(
        buildErrorBody(request, 'ACCESS_UPDATE_FAILED', accessError.message),
        { status: 500 }
      )
    }

    const redirectTo = role === 'employee' ? '/my' : '/wellness-director'
    return jsonOrRedirect(request, { success: true, redirectTo }, 200, redirectTo)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      buildErrorBody(request, 'CHANGE_PASSWORD_ROUTE_ERROR', 'Password change failed on the server.', message),
      { status: 500 }
    )
  }
}
