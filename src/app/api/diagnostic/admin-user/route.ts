import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type EnvVarCheck = {
  present: boolean
  nonEmpty: boolean
}

function inspectEnvVar(value: string | undefined): EnvVarCheck {
  return {
    present: typeof value !== 'undefined',
    nonEmpty: typeof value === 'string' && value.trim().length > 0,
  }
}

function getSupabaseEnvDiagnostics() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: inspectEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: inspectEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY),
  }
}

export async function GET() {
  try {
    const diagnostics = getSupabaseEnvDiagnostics()
    const hasRequiredEnv =
      diagnostics.NEXT_PUBLIC_SUPABASE_URL.nonEmpty &&
      diagnostics.SUPABASE_SERVICE_ROLE_KEY.nonEmpty

    if (!hasRequiredEnv) {
      return NextResponse.json(
        {
          id: null,
          error: 'Missing required Supabase environment variables.',
          diagnostics,
        },
        { status: 500 }
      )
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.auth.admin.listUsers()

    if (error) {
      return NextResponse.json({ id: null, error: error.message, diagnostics }, { status: 500 })
    }

    const user = data.users.find((u) => u.email === 'admin@voiloop.com')
    if (!user) {
      return NextResponse.json({ id: null })
    }

    return NextResponse.json({ id: user.id })
  } catch (error) {
    const diagnostics = getSupabaseEnvDiagnostics()
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ id: null, error: message, diagnostics }, { status: 500 })
  }
}
