import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set(name: string, value: string, options: any) { try { cookieStore.set({ name, value, ...options }) } catch {} },
          remove(name: string, options: any) { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
        },
      }
    )

    await supabase.auth.exchangeCodeForSession(code)

    const { data: roleData } = await supabase.from('user_roles').select('role').single()
    const role = roleData?.role

    if (role === 'employee') return NextResponse.redirect(new URL('/my', requestUrl.origin))
    if (role === 'wellness_director') return NextResponse.redirect(new URL('/executive', requestUrl.origin))
    if (role === 'admin') return NextResponse.redirect(new URL('/executive', requestUrl.origin))

    return NextResponse.redirect(new URL('/login?error=no_role', requestUrl.origin))
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin))
}
