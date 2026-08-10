import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { provisionSupabaseAccount } from '@/lib/supabase/provision-account'

export const runtime = 'nodejs'

type LoginErrorBody = {
  error: string
  code: string
  detail?: string
  source: 'backend'
  requestId: string
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
  await provisionSupabaseAccount({
    adminClient,
    email: configuredAdminEmail,
    password: configuredAdminPassword,
    role: 'admin',
    mustChangePassword: false,
  })
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

    if (wantsJson(request)) {
      let body: { email?: string }
      try {
        body = await request.json()
      } catch {
        return NextResponse.json(
          buildErrorBody(request, 'INVALID_REQUEST_BODY', 'Invalid request body', 'Request body must be valid JSON with an email field.'),
          { status: 400 }
        )
      }
      email = String(body.email ?? '').trim()
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
    }

    if (!email) {
      return jsonOrRedirect(
        request,
        buildErrorBody(request, 'MISSING_EMAIL', 'Email is required.'),
        400,
        '/login'
      )
    }

    const configuredAdminEmail = process.env.PILOT_ADMIN_EMAIL
    if (configuredAdminEmail && email.toLowerCase() === configuredAdminEmail.toLowerCase()) {
      await attemptAdminCredentialRepair(email)
    }

    return jsonOrRedirect(request, { success: true }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      buildErrorBody(request, 'LOGIN_ROUTE_ERROR', 'Login request failed on the server.', message),
      { status: 500 }
    )
  }
}
