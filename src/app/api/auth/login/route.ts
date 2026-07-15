import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getUserAccess } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type LoginErrorBody = {
  error: string
  code: string
  detail?: string
  source: 'backend'
  requestId: string
}
function isInvalidCredentialsError(error: { message?: string | null } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return message.includes('invalid login credentials') || message.includes('invalid credentials')
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const adminClient = createAdminSupabaseClient()
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      throw error
    }

    const users = data.users ?? []
    const existing = users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (existing) {
      return existing.id
    }

    if (users.length < 1000) {
      break
    }

    page += 1
  }

  return null
}

async function attemptAdminCredentialRepair(email: string): Promise<void> {
  const configuredAdminEmail = process.env.PILOT_ADMIN_EMAIL
  const configuredAdminPassword = process.env.PILOT_ADMIN_PASSWORD

  if (!configuredAdminEmail || !configuredAdminPassword) {
    return
  }

  if (email.toLowerCase() !== configuredAdminEmail.toLowerCase()) {
    return
  }

  const adminClient = createAdminSupabaseClient()
  let userId = await findUserIdByEmail(configuredAdminEmail)

  if (userId) {
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password: configuredAdminPassword,
      email_confirm: true,
    })
    if (error) {
      throw error
    }
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: configuredAdminEmail,
      password: configuredAdminPassword,
      email_confirm: true,
    })
    if (error || !data.user?.id) {
      throw new Error(error?.message ?? 'Failed to create configured admin user')
    }
    userId = data.user.id
  }

  const { error: accessError } = await adminClient
    .from('user_access')
    .upsert({
      user_id: userId,
      role: 'admin',
      must_change_password: false,
    }, { onConflict: 'user_id' })

  if (accessError) {
    throw accessError
  }
}

function wantsJson(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? ''
  return contentType.toLowerCase().includes('application/json')
}

function getRequestId(request: Request): string {
  return request.headers.get('x-vercel-id') ?? crypto.randomUUID()
}

function buildErrorBody(request: Request, code: string, error: string, detail?: string): LoginErrorBody {
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
    let email = ''
    let password = ''

    if (wantsJson(request)) {
      let body: { email?: string; password?: string }
      try {
        body = await request.json()
      } catch {
        return NextResponse.json(
          buildErrorBody(request, 'INVALID_REQUEST_BODY', 'Invalid request body', 'Request body must be valid JSON with email and password.'),
          { status: 400 }
        )
      }
      email = String(body.email ?? '').trim()
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
      email = String(formData.get('email') ?? '').trim()
      password = String(formData.get('password') ?? '')
    }

    if (!email || !password) {
      return jsonOrRedirect(
        request,
        buildErrorBody(request, 'MISSING_CREDENTIALS', 'Email and password are required.'),
        400,
        '/login'
      )
    }

    const supabase = createServerSupabaseClient()
    let { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if ((error || !data.user) && isInvalidCredentialsError(error)) {
      const configuredAdminEmail = process.env.PILOT_ADMIN_EMAIL
      const configuredAdminPassword = process.env.PILOT_ADMIN_PASSWORD
      if (
        configuredAdminEmail &&
        configuredAdminPassword &&
        email.toLowerCase() === configuredAdminEmail.toLowerCase() &&
        password === configuredAdminPassword
      ) {
        await attemptAdminCredentialRepair(email)
        const retried = await supabase.auth.signInWithPassword({ email, password })
        data = retried.data
        error = retried.error
      }
    }

    if (error || !data.user) {
      const configuredAdminEmail = process.env.PILOT_ADMIN_EMAIL
      const isConfiguredAdminEmail = configuredAdminEmail && email.toLowerCase() === configuredAdminEmail.toLowerCase()
      const detail = isConfiguredAdminEmail
        ? 'Configured admin account was used but credentials did not match Supabase auth.'
        : undefined
      return jsonOrRedirect(
        request,
        buildErrorBody(request, 'INVALID_LOGIN_CREDENTIALS', error?.message ?? 'Sign-in failed.', detail),
        401,
        '/login'
      )
    }

    const access = await getUserAccess(data.user.id)
    const redirectTo = access.mustChangePassword
      ? '/change-password'
      : !access.role || access.role === 'employee'
        ? '/my'
        : '/wellness-director'

    return jsonOrRedirect(request, { success: true, redirectTo }, 200, redirectTo)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      buildErrorBody(request, 'LOGIN_ROUTE_ERROR', 'Login request failed on the server.', message),
      { status: 500 }
    )
  }
}
